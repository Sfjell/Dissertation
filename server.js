const express = require('express');
const bodyParser = require('body-parser');
const cors = require('cors');
const multer = require('multer');
const mongoose = require('mongoose');
const path = require('path');
const fs = require('fs');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
require('dotenv').config();

// 🔹 Setup Express App
const app = express();
app.use(bodyParser.json());
app.use(cors());
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// 🔹 Ensure 'uploads' directory exists
const uploadDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

// 🔹 Multer for File Uploads
const storage = multer.diskStorage({
  destination: uploadDir,
  filename: (req, file, cb) => {
    cb(null, `${Date.now()}-${file.originalname}`);
  },
});
const upload = multer({ storage });

// 🔹 MongoDB Connection
mongoose
  .connect('mongodb://localhost:27017/my_diss', { useNewUrlParser: true, useUnifiedTopology: true })
  .then(() => console.log('✅ Connected to MongoDB'))
  .catch((err) => console.error('❌ MongoDB connection error:', err));

// 🔹 User Schema and Model
const userSchema = new mongoose.Schema({
  email: { type: String, required: true, unique: true },
  password: { type: String, required: true },
});
const User = mongoose.model('User', userSchema);

// 🔹 Feedback Schema and Model
const feedbackSchema = new mongoose.Schema({
  companyName: { type: String, required: true },
  experienceDescription: { type: String, required: true },
  rating: { type: Number, required: true },
  logoPath: { type: String },
  successFactor: { type: String, required: true }, // Kritisk suksessfaktor
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
});
const Feedback = mongoose.model('Feedback', feedbackSchema);

// 🔹 Middleware to verify JWT token
const authenticateToken = (req, res, next) => {
  const authHeader = req.headers['authorization'];
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return res.status(403).json({ error: 'Access denied. No token provided.' });
  }
  const token = authHeader.split(' ')[1];
  jwt.verify(token, process.env.JWT_SECRET || "fallbackSecretKey", (err, user) => {
    if (err) return res.status(401).json({ error: 'Invalid token' });
    req.user = user;
    next();
  });
};

// ✅ User Registration
app.post('/my_diss/register', async (req, res) => {
  try {
    const { email, password } = req.body;

    // Sjekk at e-post og passord er oppgitt
    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required.' });
    }

    // Sjekk om brukeren allerede eksisterer
    const existingUser = await User.findOne({ email });
    if (existingUser) {
      return res.status(400).json({ error: 'A user with this email already exists.' });
    }

    // Krypter passordet og opprett brukeren
    const hashedPassword = await bcrypt.hash(password, 10);
    const user = new User({ email, password: hashedPassword });
    await user.save();

    // Returner suksessmelding
    res.status(201).json({ message: 'User registered successfully.', userId: user._id });
  } catch (err) {
    console.error('❌ Registration error:', err.message); // Log feilen for debugging
    res.status(500).json({ error: 'An error occurred during registration. Please try again.' });
  }
});

// 🔹 Question Schema
const questionSchema = new mongoose.Schema({
  questionText: { type: String, required: true },
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  answers: [
    {
      answerText: { type: String, required: true },
      userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
      likes: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
      replies: [
        {
          replyText: { type: String, required: true },
          userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
          createdAt: { type: Date, default: Date.now }
        }
      ],
      createdAt: { type: Date, default: Date.now }
    }
  ]
}, { timestamps: true });

const Question = mongoose.model('Question', questionSchema);

// ✅ User Login
app.post('/my_diss/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) return res.status(400).json({ error: 'Email and password are required.' });

    const user = await User.findOne({ email });
    if (!user) return res.status(400).json({ error: 'Invalid credentials.' });

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) return res.status(400).json({ error: 'Invalid credentials.' });

    const token = jwt.sign({ userId: user._id }, process.env.JWT_SECRET || "fallbackSecretKey", { expiresIn: '24h' });

    res.status(200).json({ message: 'Login successful.', token, userId: user._id });
  } catch (err) {
    res.status(500).json({ error: 'Server error during login.' });
  }
});// ✅ Route to check if token is valid
app.get('/my_diss/check-token', authenticateToken, (req, res) => {
    res.status(200).json({ message: "Token is valid", userId: req.user.userId });
});

app.post('/my_diss/questions/like/:answerId', authenticateToken, async (req, res) => {
  try {
    const { answerId } = req.params;
    const userId = req.user.userId;

    // Find the question that contains the answer
    const question = await Question.findOne({ "answers._id": answerId });
    if (!question) return res.status(404).json({ error: 'Answer not found.' });

    const answer = question.answers.id(answerId);
    if (!answer) return res.status(404).json({ error: 'Answer not found.' });

    // Toggle the like
    if (answer.likes.includes(userId)) {
      answer.likes.pull(userId); // Remove like
    } else {
      answer.likes.push(userId); // Add like
    }

    await question.save();
    res.status(200).json({ message: 'Like updated successfully!', likes: answer.likes.length });
  } catch (err) {
    console.error('❌ Error liking answer:', err);
    res.status(500).json({ error: 'Error updating like.' });
  }
});

// ✅ Submit Feedback with Image
app.post('/my_diss/feedback', authenticateToken, upload.single('logo'), async (req, res) => {
  try {
    const { companyName, experienceDescription, rating, successFactor } = req.body;
    const logoPath = req.file ? `/uploads/${req.file.filename}` : null;

    if (!companyName || !experienceDescription || !rating || !successFactor) {
      return res.status(400).json({ error: 'All fields are required.' });
    }

    const feedback = new Feedback({
      companyName,
      experienceDescription,
      rating,
      logoPath,
      successFactor,
      userId: req.user.userId,
    });

    await feedback.save();
    res.status(201).json({ message: 'Feedback submitted successfully!', feedback });
  } catch (err) {
    res.status(500).json({ error: 'Error saving feedback.' });
  }
});

// ✅ Submit Question
app.post('/my_diss/questions', authenticateToken, async (req, res) => {
  try {
    const { questionText } = req.body;
    if (!questionText) return res.status(400).json({ error: 'Question text is required.' });

    console.log('User ID:', req.user.userId); // Debugging
    console.log('Question Text:', questionText); // Debugging

    const question = new Question({
      questionText,
      userId: req.user.userId,
      answers: [],
    });

    await question.save();
    res.status(201).json({ message: 'Question submitted successfully!', question });
  } catch (err) {
    console.error('❌ Error saving question:', err); // Debugging
    res.status(500).json({ error: 'Error saving question.' });
  }
});


// ✅ Delete Feedback by ID
app.delete('/my_diss/feedback/:id', authenticateToken, async (req, res) => {
  try {
    const feedbackId = req.params.id;
    const feedback = await Feedback.findById(feedbackId);

    if (!feedback) {
      return res.status(404).json({ error: 'Feedback not found.' });
    }

    // Sjekk om brukeren eier tilbakemeldingen
    if (feedback.userId.toString() !== req.user.userId) {
      return res.status(403).json({ error: 'You do not have permission to delete this feedback.' });
    }

    // Slett logoen hvis den eksisterer
    if (feedback.logoPath) {
      const filePath = path.join(__dirname, feedback.logoPath);
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
      }
    }

    await Feedback.findByIdAndDelete(feedbackId);
    res.status(200).json({ message: 'Feedback deleted successfully.' });
  } catch (err) {
    console.error('❌ Error deleting feedback:', err);
    res.status(500).json({ error: 'Error deleting feedback.' });
  }
});

// Like a Question
app.post('/my_diss/questions/like/:questionId', authenticateToken, async (req, res) => {
  const { questionId } = req.params;
  const userId = req.user.userId;

  try {
      // Find the question by its ID
      const question = await Question.findById(questionId);
      if (!question) return res.status(404).json({ error: 'Question not found.' });

      // Check if the user has already liked the question
      const isLiked = question.likes.includes(userId);
      if (isLiked) {
          // If the user has already liked the question, remove their like
          question.likes.pull(userId);
      } else {
          // If the user hasn't liked the question yet, add their like
          question.likes.push(userId);
      }

      // Save the updated question with the new like state
      await question.save();

      // Send the updated like count
      res.status(200).json({ message: 'Like updated successfully!', likes: question.likes.length });
  } catch (err) {
      console.error("❌ Error liking question:", err);
      res.status(500).json({ error: 'Error updating like.' });
  }
});

// Like an Answer
app.post('/my_diss/questions/like/:answerId', authenticateToken, async (req, res) => {
  const { answerId } = req.params;
  const userId = req.user.userId;

  try {
    // Find the question containing the answer
    const question = await Question.findOne({ "answers._id": answerId });
    if (!question) return res.status(404).json({ error: 'Answer not found.' });

    const answer = question.answers.id(answerId);
    if (!answer) return res.status(404).json({ error: 'Answer not found.' });

    // Check if the user has already liked the answer
    const isLiked = answer.likes.includes(userId);
    if (isLiked) {
      // If the user has already liked the answer, remove their like
      answer.likes.pull(userId);
    } else {
      // If the user hasn't liked the answer yet, add their like
      answer.likes.push(userId);
    }

    // Save the updated question with the new like state
    await question.save();
    
    // Send the updated number of likes
    res.status(200).json({ message: 'Like updated successfully!', likes: answer.likes.length });
  } catch (err) {
    console.error("❌ Error liking answer:", err);
    res.status(500).json({ error: 'Error updating like.' });
  }
});


// Delete an answer
app.delete('/my_diss/answers/:id', authenticateToken, async (req, res) => {
  try {
      const answer = await Answer.findByIdAndDelete(req.params.id);
      if (!answer) return res.status(404).send({ error: "Answer not found" });

      res.send({ message: "Answer deleted" });
  } catch (error) {
      res.status(500).send({ error: "Error deleting answer" });
  }
});


// ✅ Fetch All Feedback
app.get('/my_diss', async (req, res) => {
  try {
    const feedbacks = await Feedback.find().populate('userId', 'email');
    res.status(200).json(feedbacks);
  } catch (err) {
    res.status(500).json({ error: 'Error retrieving feedback.' });
  }
});

// ✅ Hent alle spørsmål
app.get('/my_diss/questions', async (req, res) => {
  try {
    const questions = await Question.find()
      .populate('userId', 'email') // Populate question's user (who asked it)
      .populate('answers.userId', 'email'); // Populate answer's user (who replied)

    if (!questions.length) {
      return res.status(404).json({ error: 'No questions found.' });
    }

    res.status(200).json(questions); // Send the questions and answers
  } catch (err) {
    console.error('❌ Error fetching questions:', err);
    res.status(500).json({ error: 'Error retrieving questions.' });
  }
});


app.post('/my_diss/feedback', authenticateToken, upload.single('logo'), async (req, res) => {
  try {
    // Hent ut data fra forespørselen
    const { companyName, experienceDescription, rating, successFactor } = req.body;
    
    // Hvis logoen er lastet opp, lagre filens sti
    const logoPath = req.file ? `/uploads/${req.file.filename}` : null;

    // Valider at alle nødvendige felter er fylt ut
    if (!companyName || !experienceDescription || !rating || !successFactor) {
      return res.status(400).json({ error: 'Alle feltene er påkrevd.' });
    }

    // Opprett en ny tilbakemelding i databasen
    const feedback = new Feedback({
      companyName,
      experienceDescription,
      rating,
      logoPath, // Hvis logoen er lastet opp, lagrer vi stien til filen
      successFactor,
      userId: req.user.userId, // Brukeren som sender inn tilbakemeldingen
    });

    // Lagre tilbakemeldingen i databasen
    await feedback.save();

    // Returner suksessrespons
    res.status(201).json({ message: 'Tilbakemelding sendt inn!', feedback });
  } catch (err) {
    console.error('❌ Feil ved innsending av tilbakemelding:', err);
    res.status(500).json({ error: 'Feil ved lagring av tilbakemelding. Prøv igjen.' });
  }
});

app.post('/my_diss/questions', authenticateToken, async (req, res) => {
  try {
      const { questionText } = req.body;
      if (!questionText) return res.status(400).json({ error: 'Question text is required.' });

      const question = new Question({
          questionText,
          userId: req.user.userId,
          answers: [],
      });

      await question.save();
      res.status(201).json({ message: 'Question submitted successfully!', question });
  } catch (err) {
      console.error('❌ Error saving question:', err);
      res.status(500).json({ error: 'Error saving question.' });
  }
});



// ✅ Submit a Reply
app.post('/my_diss/questions/reply/:questionId', authenticateToken, async (req, res) => {
  try {
    const { questionId } = req.params;
    const { replyText } = req.body;

    if (!replyText) return res.status(400).json({ error: 'Reply text is required.' });

    const question = await Question.findById(questionId);
    if (!question) return res.status(404).json({ error: 'Question not found.' });

    question.answers.push({
      answerText: replyText,
      userId: req.user.userId,
      likes: [],
      replies: []
    });

    question.markModified('answers'); // 👈 Forteller MongoDB at array er endret
    await question.save();

    res.status(201).json({ message: 'Reply added successfully!', question });
  } catch (err) {
    console.error('❌ Error adding reply:', err);
    res.status(500).json({ error: 'Error adding reply.' });
  }
});

// ✅ Like a Comment
app.post('/my_diss/questions/like/:answerId', authenticateToken, async (req, res) => {
  try {
    const { answerId } = req.params;
    const userId = req.user.userId;

    const question = await Question.findOne({ "answers._id": answerId });
    if (!question) return res.status(404).json({ error: 'Answer not found.' });

    const answer = question.answers.id(answerId);

    // ✅ Toggle like (legg til eller fjern)
    if (answer.likes.includes(userId)) {
      answer.likes.pull(userId);
    } else {
      answer.likes.push(userId);
    }

    question.markModified('answers'); // 👈 Viktig for MongoDB å vite at array er oppdatert
    await question.save();

    res.status(200).json({ message: 'Like updated successfully!', likes: answer.likes.length });
  } catch (err) {
    console.error('❌ Error liking comment:', err);
    res.status(500).json({ error: 'Error updating like.' });
  }
});

// Delete a question
app.delete('/my_diss/questions/:questionId', authenticateToken, async (req, res) => {
  const { questionId } = req.params;
  try {
    const question = await Question.findByIdAndDelete(questionId);
    if (!question) return res.status(404).json({ error: 'Question not found' });

    res.status(200).json({ message: 'Question deleted successfully' });
  } catch (err) {
    console.error("Error deleting question:", err);
    res.status(500).json({ error: 'Error deleting question' });
  }
});

// ✅ Delete a Comment
// Delete Answer
// Delete Answer
app.delete('/my_diss/questions/delete/:answerId', authenticateToken, async (req, res) => {
  const { answerId } = req.params;
  console.log("Attempting to delete answer with ID:", answerId); // Log the answerId

  try {
    // Find the question containing the answer
    const question = await Question.findOne({ "answers._id": answerId });
    if (!question) {
      console.log("No question found for answerId:", answerId);
      return res.status(404).json({ error: 'Answer not found' });
    }

    // Find the specific answer in the answers array
    const answer = question.answers.id(answerId);
    if (!answer) {
      console.log("No answer found for the given answerId:", answerId);
      return res.status(404).json({ error: 'Answer not found' });
    }

    // Check if the logged-in user is the owner of the answer
    if (answer.userId.toString() !== req.user.userId) {
      console.log("User does not have permission to delete this answer");
      return res.status(403).json({ error: 'You do not have permission to delete this answer.' });
    }

    // Remove the answer from the question's answers array
    question.answers.pull(answerId); // Use pull() to remove the answer
    await question.save(); // Save the updated question

    console.log("Answer deleted successfully for answerId:", answerId);
    res.status(200).json({ message: 'Answer deleted successfully' });
  } catch (err) {
    console.error("Error deleting answer:", err);
    res.status(500).json({ error: 'Error deleting answer' });
  }
});


// ✅ User Registration
app.post('/register', async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) return res.status(400).json({ error: 'Email and password are required.' });

    const existingUser = await User.findOne({ email });
    if (existingUser) return res.status(400).json({ error: 'A user with this email already exists.' });

    const hashedPassword = await bcrypt.hash(password, 10);
    const user = new User({ email, password: hashedPassword });
    await user.save();

    res.status(201).json({ message: 'User registered successfully.', userId: user._id });
  } catch (err) {
    res.status(500).json({ error: 'An error occurred during registration.' });
  }
});

// ✅ User Login
app.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    const user = await User.findOne({ email });
    if (!user || !(await bcrypt.compare(password, user.password))) {
      return res.status(400).json({ error: 'Invalid credentials.' });
    }

    const token = jwt.sign({ userId: user._id }, process.env.JWT_SECRET || "fallbackSecretKey", { expiresIn: '1h' });
    res.status(200).json({ message: 'Login successful.', token, userId: user._id });
  } catch (err) {
    res.status(500).json({ error: 'Server error during login.' });
  }
});

app.post('/my_diss/questions/like/:answerId', authenticateToken, async (req, res) => {
  try {
    const { answerId } = req.params;
    const userId = req.user.userId;

    const question = await Question.findOne({ "answers._id": answerId });
    if (!question) return res.status(404).json({ error: 'Answer not found.' });

    const answer = question.answers.id(answerId);

    if (answer.likes.includes(userId)) {
      answer.likes = answer.likes.filter(id => id.toString() !== userId); // Fjern like hvis allerede likt
    } else {
      answer.likes.push(userId);
    }

    await question.save();
    res.status(200).json({ message: 'Like updated successfully!', likes: answer.likes.length });
  } catch (err) {
    console.error('❌ Error liking comment:', err);
    res.status(500).json({ error: 'Error updating like.' });
  }
});

// Delete a Comment (Answer)
app.delete('/my_diss/questions/delete/:answerId', authenticateToken, async (req, res) => {
  try {
    const { answerId } = req.params;
    const userId = req.user.userId;

    const question = await Question.findOne({ "answers._id": answerId });
    if (!question) {
      console.log("No question found with the answerId:", answerId);
      return res.status(404).json({ error: 'Answer not found' });
    }

    const answer = question.answers.id(answerId);
    if (!answer) {
      console.log("Answer not found for ID:", answerId);
      return res.status(404).json({ error: 'Answer not found' });
    }

    if (answer.userId.toString() !== userId) {
      console.log("User does not have permission to delete this answer");
      return res.status(403).json({ error: 'You do not have permission to delete this answer.' });
    }

    answer.remove();
    await question.save();

    console.log("Answer deleted successfully for answerId:", answerId);
    res.status(200).json({ message: 'Answer deleted successfully' });
  } catch (err) {
    console.error("Error deleting answer:", err);
    res.status(500).json({ error: 'Error deleting answer' });
  }
});


app.delete('/my_diss/answers/:answerId', authenticateToken, async (req, res) => {
  const { answerId } = req.params;
  console.log("Attempting to delete answer with ID:", answerId);  // Debugging: Log the answerId

  try {
    // Find the question containing the answer
    const question = await Question.findOne({ "answers._id": answerId });
    if (!question) {
      console.log("No question found for the answerId:", answerId);  // Debugging
      return res.status(404).json({ error: 'Answer not found' });
    }

    // Find the specific answer in the answers array
    const answer = question.answers.id(answerId);
    if (!answer) {
      console.log("No answer found for the given answerId:", answerId);  // Debugging
      return res.status(404).json({ error: 'Answer not found' });
    }

    // Remove the answer from the question's answers array
    answer.remove();
    await question.save(); // Save the updated question

    console.log("Answer deleted successfully for answerId:", answerId);  // Debugging
    res.status(200).json({ message: 'Answer deleted successfully' });
  } catch (err) {
    console.error("Error deleting answer:", err);
    res.status(500).json({ error: 'Error deleting answer' });
  }
});



// ✅ Start Server
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`🚀 Server running on http://localhost:${PORT}`);
});

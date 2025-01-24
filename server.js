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


// 🔹 User Schema and Model
const userSchema = new mongoose.Schema({
  email: { type: String, required: true, unique: true },
  password: { type: String, required: true },
  name: { type: String },
  age: { type: Number },
  gender: { type: String },
  occupation: { type: String }
});
const User = mongoose.model('User', userSchema);

// 🔹 Feedback Schema and Model
const feedbackSchema = new mongoose.Schema({
  companyName: { type: String, required: true },
  experienceDescription: { type: String, required: true },
  rating: { type: Number, required: true },
  logoPath: { type: String },
  successFactor: { type: String, required: false },
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  comments: [
    {
      text: { type: String, required: true },
      rating: { type: Number, required: true },
      userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
      createdAt: { type: Date, default: Date.now }
    }
  ]
});

const Feedback = mongoose.model('Feedback', feedbackSchema);

app.get('/my_diss/get-user-id/:userId', async (req, res) => {
  try {
    const user = await User.findById(req.params.userId);
    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }
    res.status(200).json({ email: user.email });
  } catch (err) {
    console.error("❌ Error fetching user email:", err);
    res.status(500).json({ error: "Server error" });
  }
});

app.get('/my_diss/user-posts/:userId', async (req, res) => {
  try {
    const userId = req.params.userId;
    const posts = await Feedback.find({ userId }).populate('userId', 'email');


    if (!posts || posts.length === 0) {
      return res.status(404).json({ error: "No posts found for this user." });
    }

    res.status(200).json(posts);
  } catch (err) {
    console.error("❌ Error fetching user posts:", err);
    res.status(500).json({ error: "Server error fetching posts." });
  }
});

app.get('/my_diss/user-comments/:userId', async (req, res) => {
  try {
    const userId = req.params.userId;

    // Finn alle feedbacks som har kommentarer fra denne brukeren
    const feedbacks = await Feedback.find({ "comments.userId": userId })
      .populate("comments.userId", "email");

    if (!feedbacks || feedbacks.length === 0) {
      return res.status(200).json([]);  // ✅ Returner en tom liste istedenfor 404
    }

    // Filtrer ut kun de kommentarene brukeren har skrevet
    const userComments = feedbacks.flatMap(fb =>
      fb.comments
        .filter(comment => comment.userId?._id?.toString() === userId)  // ✅ Sjekk om userId finnes
        .map(comment => ({
          feedbackId: fb._id,
          companyName: fb.companyName,
          experienceDescription: fb.experienceDescription,
          commentText: comment.text,
          rating: comment.rating,
          createdAt: comment.createdAt
        }))
    );

    res.status(200).json(userComments.length ? userComments : []);  // ✅ Sørg for at en liste returneres
  } catch (err) {
    console.error("❌ Error fetching user comments:", err);
    res.status(500).json({ error: "Server error fetching comments." });
  }
});

// ✅ Henter ALLE spørsmål en bruker har stilt
app.get('/my_diss/user-questions/:userId', async (req, res) => {
  try {
    const userId = req.params.userId;
    const questions = await Question.find({ userId }).populate("userId", "email");

    if (!questions.length) {
      return res.status(200).json([]);  // ✅ Returner tom liste i stedet for 404
    }

    res.status(200).json(questions);
  } catch (err) {
    console.error("❌ Error fetching user questions:", err);
    res.status(500).json({ error: "Server error fetching questions." });
  }
});

// ✅ Henter ALLE svar en bruker har gitt
app.get('/my_diss/user-answers/:userId', async (req, res) => {
  try {
    const userId = req.params.userId;

    // Finn alle spørsmål som har svar fra denne brukeren
    const questions = await Question.find({ "answers.userId": userId });

    if (!questions.length) {
      return res.status(200).json([]);  // ✅ Returner tom liste i stedet for 404
    }

    // Filtrer ut kun de svarene brukeren har skrevet
    const userAnswers = questions.flatMap(q =>
      q.answers
        .filter(ans => ans.userId.toString() === userId)
        .map(ans => ({
          questionId: q._id,
          questionText: q.questionText,
          answerText: ans.answerText,
          createdAt: ans.createdAt
        }))
    );

    res.status(200).json(userAnswers.length ? userAnswers : []);
  } catch (err) {
    console.error("❌ Error fetching user answers:", err);
    res.status(500).json({ error: "Server error fetching answers." });
  }
});

app.get("/my_diss/feedback/:feedbackId", async (req, res) => {
  try {
    const { feedbackId } = req.params;
    console.log("🔹 Fetching feedback for ID:", feedbackId); // Debugging

    const feedback = await Feedback.findById(feedbackId)
      .populate('userId', 'email')
      .populate('comments.userId', 'email');

    if (!feedback) {
      console.warn("⚠️ Feedback not found for ID:", feedbackId);
      return res.status(404).json({ error: "Feedback not found" });
    }

    res.status(200).json(feedback);
  } catch (err) {
    console.error("❌ Error fetching feedback:", err);
    res.status(500).json({ error: "Server error" });
  }
});



// 🔹 Middleware to verify JWT token
// 🔹 Middleware to verify JWT token
const authenticateToken = (req, res, next) => {
  const authHeader = req.headers['authorization'];
  console.log("🔹 Received Authorization header:", authHeader); // ✅ Debug log

  // ✅ Sjekker om header er gyldig
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    console.log("⚠️ No token provided or incorrect format.");
    return res.status(403).json({ error: 'Access denied. No token provided.' });
  }

  const token = authHeader.split(' ')[1];
  console.log("🔹 Extracted token:", token); // ✅ Log tokenet for debugging

  jwt.verify(token, process.env.JWT_SECRET || "fallbackSecretKey", (err, decoded) => {
    if (err) {
      console.error("❌ Invalid token:", err);
      return res.status(401).json({ error: 'Invalid token' });
    }

    console.log("✅ Token verified for user:", decoded); // ✅ Debug info om token

    // 🔹 Sjekker om `userId` finnes i token-payload
    if (!decoded.userId) {
      console.error("❌ Token is missing userId!");
      return res.status(400).json({ error: "Invalid token: missing userId." });
    }

    // ✅ Lagre userId i req.user for videre bruk i ruter
    req.user = { userId: decoded.userId };

    console.log("✅ User authenticated:", req.user); // ✅ Debugging
    next();
  });
};

mongoose
  .connect('mongodb://localhost:27017/my_diss', { useNewUrlParser: true, useUnifiedTopology: true })
  .then(() => console.log('✅ Connected to MongoDB'))
  .catch((err) => console.error('❌ MongoDB connection error:', err));

app.delete('/my_diss/delete-account/:email', authenticateToken, async (req, res) => {
  try {
    const { email } = req.params;

    // Validate the email
    if (!email) {
      return res.status(400).json({ error: "Email is required" });
    }

    // Find the user by email
    const user = await User.findOne({ email });
    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }

    // Slett alle feedbacks laget av brukeren
    await Feedback.deleteMany({ userId: user._id });
    await Question.deleteMany({ userId: user._id });

    // Fjern brukerens kommentarer fra andres innlegg
    await Feedback.updateMany(
      { "comments.userId": user._id },
      { $pull: { comments: { userId: user._id } } }
    );

    // Fjern brukerens svar fra andres spørsmål
    await Question.updateMany(
      { "answers.userId": user._id },
      { $pull: { answers: { userId: user._id } } }
    );
    // Delete the user
    await User.deleteOne({ email });

    // Optionally delete related data (e.g., feedback, comments)
    await Feedback.deleteMany({ userId: user._id });

    res.status(200).json({ message: "Account deleted successfully" });
  } catch (err) {
    console.error("❌ Error deleting user:", err);
    res.status(500).json({ error: "An error occurred while deleting the account" });
  }
});





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

// ✅ User Login (Improved)
app.post('/my_diss/login', async (req, res) => {
  try {
      const { email, password } = req.body;

      console.log("🔍 Login Attempt for:", email);

      if (!email || !password) {
          return res.status(400).json({ error: 'Email and password are required.' });
      }

      // 🔹 Finn bruker i databasen
      const user = await User.findOne({ email });
      if (!user) {
          console.warn("❌ User not found:", email);
          return res.status(400).json({ error: 'Invalid credentials.' });
      }

      console.log("✅ Found User:", user.email);
      console.log("🔑 Stored Hashed Password:", user.password);

      // 🔹 Sjekk passord mot hash
      const isMatch = await bcrypt.compare(password, user.password);

      if (!isMatch) {
          console.warn("❌ Password does not match!");
          return res.status(400).json({ error: 'Invalid credentials.' });
      }

      console.log("✅ Password Matched!");

      // 🔹 Generer et nytt token etter vellykket innlogging
      const token = jwt.sign(
          { userId: user._id },
          process.env.JWT_SECRET || "fallbackSecretKey",
          { expiresIn: '24h' } // 24 timer
      );

      console.log("🔑 New Token Generated:", token);

      res.status(200).json({
          message: '✅ Login successful.',
          token,
          userId: user._id,
          email: user.email
      });

  } catch (err) {
      console.error("❌ Server error during login:", err);
      res.status(500).json({ error: 'Server error during login.' });
  }
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

// ✅ Hent brukerdata
app.get('/my_diss/get-user/:email', async (req, res) => {
  try {
    console.log("Fetching user data for:", req.params.email);
    const user = await User.findOne({ email: req.params.email });
    if (!user) {
      console.warn("User not found:", req.params.email);
      return res.status(404).json({ error: "User not found" });
    }
    res.status(200).json(user);
  } catch (err) {
    console.error("Error fetching user data:", err);
    res.status(500).json({ error: "Server error" });
  }
});

app.post("/my_diss/feedback/:feedbackId/comment", authenticateToken, async (req, res) => {
  try {
    const { feedbackId } = req.params;
    const { text, rating } = req.body;

    console.log("Received comment data:", req.body);  // 👈 Log innkommende data for debugging

    if (!text || !rating) {
      return res.status(400).json({ error: "Missing text or rating" });
    }

    const feedback = await Feedback.findById(feedbackId);
    if (!feedback) {
      return res.status(404).json({ error: "Feedback not found" });
    }

    // Ensure rating is a valid number
    if (isNaN(rating) || rating < 1 || rating > 5) {
      return res.status(400).json({ error: "Invalid rating value" });
    }

    // Add comment to feedback
    feedback.comments.push({
      text,
      rating,
      userId: req.user.userId, // Ensure user is authenticated
      createdAt: new Date(),
    });

    await feedback.save();
    res.status(201).json({ message: "Comment added successfully!", feedback });

  } catch (error) {
    console.error("❌ Error adding comment:", error);
    res.status(500).json({ error: "Server error", details: error.message });
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

// ✅ DELETE a specific comment
app.delete('/my_diss/feedback/:feedbackId/comment/:commentId', authenticateToken, async (req, res) => {
  try {
    const { feedbackId, commentId } = req.params;

    const feedback = await Feedback.findById(feedbackId);
    if (!feedback) {
      return res.status(404).json({ error: 'Feedback not found.' });
    }

    const commentIndex = feedback.comments.findIndex(c => c._id.toString() === commentId);
    if (commentIndex === -1) {
      return res.status(404).json({ error: 'Comment not found.' });
    }

    // ✅ Check if logged-in user owns the comment
    if (feedback.comments[commentIndex].userId.toString() !== req.user.userId) {
      return res.status(403).json({ error: 'You do not have permission to delete this comment.' });
    }

    // Remove comment from array
    feedback.comments.splice(commentIndex, 1);
    await feedback.save();

    res.status(200).json({ message: 'Comment deleted successfully.' });
  } catch (err) {
    console.error('❌ Error deleting comment:', err);
    res.status(500).json({ error: 'Error deleting comment.' });
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

    // ✅ Check if logged-in user owns the feedback
    if (feedback.userId.toString() !== req.user.userId) {
      return res.status(403).json({ error: 'You do not have permission to delete this feedback.' });
    }

    // Delete logo file if exists
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
    const feedbacks = await Feedback.find()
      .populate('userId', 'email')  // ✅ Henter e-posten til feedback-skriveren
      .populate('comments.userId', 'email');  // ✅ Henter e-posten til kommentarskriveren

    res.status(200).json(feedbacks);
  } catch (err) {
    console.error("❌ Error retrieving feedback:", err);
    res.status(500).json({ error: "Error retrieving feedback." });
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
  const userId = req.user.userId; // 🔹 Hent ID-en til den innloggede brukeren

  try {
    const question = await Question.findById(questionId);
    if (!question) return res.status(404).json({ error: 'Question not found' });

    // 🔹 Sjekk om innlogget bruker eier spørsmålet
    if (question.userId.toString() !== userId) {
      return res.status(403).json({ error: 'You do not have permission to delete this question.' });
    }

    await Question.findByIdAndDelete(questionId);
    res.status(200).json({ message: 'Question deleted successfully' });
  } catch (err) {
    console.error("Error deleting question:", err);
    res.status(500).json({ error: 'Error deleting question' });
  }
});

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

app.delete('/my_diss/questions/:questionId/answers/:answerId', authenticateToken, async (req, res) => {
  const { questionId, answerId } = req.params;
  const userId = req.user.userId; // Logged-in user ID

  console.log("🔹 Attempting to delete answer:", answerId, "from question:", questionId);

  try {
    // Find the question containing the answer
    const question = await Question.findById(questionId);
    if (!question) {
      console.log("❌ No question found with ID:", questionId);
      return res.status(404).json({ error: 'Question not found' });
    }

    // Find the specific answer
    const answer = question.answers.id(answerId);
    if (!answer) {
      console.log("❌ Answer not found in question ID:", questionId);
      return res.status(404).json({ error: 'Answer not found' });
    }

    // Ensure the logged-in user owns the answer
    if (answer.userId.toString() !== userId) {
      console.log("⛔ Unauthorized: User does not own this answer");
      return res.status(403).json({ error: 'You do not have permission to delete this answer.' });
    }

    // Remove the answer from the answers array
    question.answers.pull(answerId);
    await question.save();

    console.log("✅ Answer deleted successfully");
    res.status(200).json({ message: 'Answer deleted successfully' });

  } catch (err) {
    console.error("❌ Error deleting answer:", err);
    res.status(500).json({ error: 'Error deleting answer', details: err.message });
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
  console.log("🔹 Attempting to delete answer with ID:", answerId);  // Debugging

  try {
    // 🔹 Finn spørsmålet som inneholder svaret
    const question = await Question.findOne({ "answers._id": answerId });
    if (!question) {
      console.log("❌ No question found for answerId:", answerId);
      return res.status(404).json({ error: 'Answer not found' });
    }

    // 🔹 Log eksisterende svar for debugging
    console.log("ℹ️ Current answers before deletion:", question.answers);

    // 🔹 Finn det spesifikke svaret
    const answer = question.answers.id(answerId);
    if (!answer) {
      console.log("❌ Answer not found in question for ID:", answerId);
      return res.status(404).json({ error: 'Answer not found' });
    }

    // 🔹 Sjekk om den innloggede brukeren eier svaret
    if (answer.userId.toString() !== req.user.userId) {
      console.log("⛔ Unauthorized: User does not own this answer");
      return res.status(403).json({ error: 'You do not have permission to delete this answer.' });
    }

    // 🔹 Fjern svaret fra spørsmålets `answers`-array
    question.answers.pull(answerId);
    await question.save();

    console.log("✅ Answer deleted successfully for answerId:", answerId);
    res.status(200).json({ message: 'Answer deleted successfully' });

  } catch (err) {
    console.error("❌ Error deleting answer:", err);
    res.status(500).json({ error: 'Error deleting answer', details: err.message });
  }
});


app.put("/my_diss/update-profile", authenticateToken, async (req, res) => {
  try {
      const { name, age, gender, occupation, email, password } = req.body;
      const userId = req.user.userId;

      console.log("🔍 Update Request for user:", userId);

      // Finn brukeren basert på ID
      const user = await User.findById(userId);
      if (!user) {
          console.log("❌ User not found");
          return res.status(404).json({ error: "User not found" });
      }

      // Oppdater feltene hvis de er sendt i forespørselen
      if (name) user.name = name;
      if (age) user.age = age;
      if (gender) user.gender = gender;
      if (occupation) user.occupation = occupation;
      if (email) user.email = email;

      if (password) {
          const hashedPassword = await bcrypt.hash(password, 10);
          console.log("🔐 New Hashed Password:", hashedPassword);
          user.password = hashedPassword;
      }

      await user.save();
      console.log("✅ Profile updated successfully");

      // 🔹 Generer et nytt token etter oppdatering
      const newToken = jwt.sign(
          { userId: user._id },
          process.env.JWT_SECRET || "fallbackSecretKey",
          { expiresIn: '24h' }
      );

      res.status(200).json({
          message: "Profile updated successfully",
          token: newToken,
          userId: user._id
      });

  } catch (err) {
      console.error("❌ Error updating profile:", err);
      res.status(500).json({ error: "Error updating profile" });
  }
});


// ✅ Route to check if token is valid
app.get('/my_diss/check-token', authenticateToken, async (req, res) => {
  try {
    const user = await User.findById(req.user.userId).select("email"); // Henter kun epost
    if (!user) {
      console.warn("❌ User not found, logging out...");
      return res.status(401).json({ error: "User not found, please log in again." });
    }

    console.log("✅ Token is valid for:", user.email);
    res.status(200).json({
      message: "Token is valid",
      userId: req.user.userId,
      email: user.email
    });

  } catch (err) {
    console.error("❌ Error validating token:", err);
    res.status(500).json({ error: "Server error while validating token." });
  }
});






























app.put('/my_diss/update-credentials', authenticateToken, async (req, res) => {
  try {
      const { email, password } = req.body;
      const userId = req.user.userId;

      // Validate input
      if (!email || !password) {
          return res.status(400).json({ error: "Email and password are required." });
      }

      // Find the user by ID
      const user = await User.findById(userId);
      if (!user) {
          return res.status(404).json({ error: "User not found." });
      }

      // Check if the new email is already taken
      const existingUser = await User.findOne({ email });
      if (existingUser && existingUser._id.toString() !== userId) {
          return res.status(400).json({ error: "This email is already in use." });
      }

      // Hash new password before saving
      const hashedPassword = await bcrypt.hash(password, 10);

      // Update user details
      user.email = email;
      user.password = hashedPassword;
      await user.save();

      res.status(200).json({ message: "Email and password updated successfully." });
  } catch (err) {
      console.error("❌ Error updating user credentials:", err);
      res.status(500).json({ error: "Server error updating credentials." });
  }
});


app.get('/my_diss/user-profile', authenticateToken, async (req, res) => {
  try {
    const user = await User.findById(req.user.userId).select('-password'); // Fjern passord fra responsen
    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }
    res.status(200).json(user);
  } catch (err) {
    console.error("❌ Error fetching user profile:", err);
    res.status(500).json({ error: "Server error fetching user profile" });
  }
});




// ✅ Start Server
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`🚀 Server running on http://localhost:${PORT}`);
});
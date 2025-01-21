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
    .connect('mongodb://localhost:27017/my_diss')
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
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
});
const Feedback = mongoose.model('Feedback', feedbackSchema);

// 🔹 Question Schema and Model
const questionSchema = new mongoose.Schema({
    questionText: { type: String, required: true },
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    answers: [{ text: String, userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' } }]
});
const Question = mongoose.model('Question', questionSchema);

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
        let { email, password } = req.body;
        if (!email || !password) return res.status(400).json({ error: 'Email and password are required.' });

        email = email.toLowerCase();
        const existingUser = await User.findOne({ email });
        if (existingUser) return res.status(400).json({ error: 'User already exists.' });

        const hashedPassword = await bcrypt.hash(password, 10);
        const user = new User({ email, password: hashedPassword });
        await user.save();

        res.status(201).json({ message: 'User registered successfully.', userId: user._id });
    } catch (err) {
        res.status(500).json({ error: 'Server error during registration.' });
    }
});

// ✅ User Login
app.post('/my_diss/login', async (req, res) => {
    try {
        let { email, password } = req.body;
        if (!email || !password) return res.status(400).json({ error: 'Email and password are required.' });

        email = email.toLowerCase();
        const user = await User.findOne({ email });

        if (!user) return res.status(400).json({ error: 'Invalid credentials.' });

        const isMatch = await bcrypt.compare(password, user.password);
        if (!isMatch) return res.status(400).json({ error: 'Invalid credentials.' });

        const token = jwt.sign({ userId: user._id }, process.env.JWT_SECRET || "fallbackSecretKey", { expiresIn: '1h' });

        res.status(200).json({ message: 'Login successful.', token, userId: user._id });
    } catch (err) {
        res.status(500).json({ error: 'Server error during login.' });
    }
});

// ✅ Hente alle spørsmål (fikset feilen med `userId`)
app.get('/my_diss/questions', async (req, res) => {
  try {
      const questions = await Question.find()
          .populate('userId', 'email')  // Henter e-post for brukeren som stilte spørsmålet
          .populate('answers.userId', 'email');  // Henter e-post for brukeren som svarte

      // Sørg for at `userId` alltid er definert
      const formattedQuestions = questions.map(q => ({
          _id: q._id,
          questionText: q.questionText,
          userEmail: q.userId && q.userId.email ? q.userId.email : "Anonymous",  // Håndter null-verdier
          answers: q.answers.map(ans => ({
              text: ans.text,
              userEmail: ans.userId && ans.userId.email ? ans.userId.email : "Anonymous"  // Håndter null-verdier
          }))
      }));

      res.status(200).json(formattedQuestions);
  } catch (err) {
      res.status(500).json({ error: 'Error retrieving questions.' });
  }
});


// ✅ Legge til et spørsmål (kun for innloggede brukere)
app.post('/my_diss/questions', authenticateToken, async (req, res) => {
  try {
      const { questionText } = req.body;

      if (!questionText) {
          return res.status(400).json({ error: 'Question text is required.' });
      }

      if (!req.user || !req.user.userId) {
          return res.status(400).json({ error: 'User ID missing in token' });
      }

      const question = new Question({
          questionText,
          userId: req.user.userId,  // 👈 Sørg for at userId lagres!
          answers: []
      });

      await question.save();
      res.status(201).json({ message: "Question submitted successfully!", question });
  } catch (err) {
      res.status(500).json({ error: "Error saving question." });
  }
});


// ✅ Legge til svar på et spørsmål (kun for innloggede brukere)
app.post('/my_diss/questions/reply', authenticateToken, async (req, res) => {
    try {
        const { questionId, replyText } = req.body;
        if (!questionId || !replyText) return res.status(400).json({ error: 'Question ID and reply text are required.' });

        const question = await Question.findById(questionId);
        if (!question) return res.status(404).json({ error: 'Question not found.' });

        question.answers.push({ text: replyText, userId: req.user.userId });
        await question.save();

        res.status(201).json({ message: "Reply submitted successfully!", question });
    } catch (err) {
        res.status(500).json({ error: "Error saving reply." });
    }
});



app.get('/my_diss', async (req, res) => {
  try {
      const feedbacks = await Feedback.find().populate('userId', 'email');
      res.status(200).json(feedbacks);
  } catch (err) {
      res.status(500).json({ error: 'Error retrieving feedback.' });
  }
});

// ✅ Start Server
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
    console.log(`🚀 Server running on http://localhost:${PORT}`);
});

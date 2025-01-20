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

// Setup Express App
const app = express();
app.use(bodyParser.json());
app.use(cors());

// Ensure the 'uploads' directory exists
const uploadDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

// Multer for File Uploads
const storage = multer.diskStorage({
  destination: uploadDir,
  filename: (req, file, cb) => {
    cb(null, `${Date.now()}-${file.originalname}`);
  },
});
const upload = multer({ storage });

// MongoDB Connection
mongoose
  .connect('mongodb://localhost:27017/my_diss', { useNewUrlParser: true, useUnifiedTopology: true })
  .then(() => console.log('✅ Connected to MongoDB'))
  .catch((err) => console.error('❌ MongoDB connection error:', err));

// User Schema and Model
const userSchema = new mongoose.Schema({
  email: { type: String, required: true, unique: true },
  password: { type: String, required: true },
});

const User = mongoose.model('User', userSchema);

// Feedback Schema and Model
const feedbackSchema = new mongoose.Schema({
  companyName: { type: String, required: true },
  experienceDescription: { type: String, required: true },
  rating: { type: Number, required: true },
  logoPath: { type: String },
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
});

const Feedback = mongoose.model('Feedback', feedbackSchema);

// Middleware to verify JWT token
const authenticateToken = (req, res, next) => {
  const token = req.headers['authorization'];
  if (!token) return res.status(403).json({ error: 'Access denied. No token provided.' });

  jwt.verify(token, process.env.JWT_SECRET, (err, user) => {
    if (err) return res.status(401).json({ error: 'Invalid token' });
    req.user = user;
    next();
  });
};

// User Registration
app.post('/register', async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) return res.status(400).json({ error: 'Email and password are required.' });

    const existingUser = await User.findOne({ email });
    if (existingUser) return res.status(400).json({ error: 'User already exists.' });

    const hashedPassword = await bcrypt.hash(password, 10);
    const user = new User({ email, password: hashedPassword });
    await user.save();

    res.status(201).json({ message: 'User registered successfully.' });
  } catch (err) {
    console.error('❌ Registration error:', err);
    res.status(500).json({ error: 'Server error during registration.' });
  }
});

// User Login
app.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) return res.status(400).json({ error: 'Email and password are required.' });

    const user = await User.findOne({ email });
    if (!user) return res.status(400).json({ error: 'Invalid credentials.' });

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) return res.status(400).json({ error: 'Invalid credentials.' });

    const token = jwt.sign({ userId: user._id }, process.env.JWT_SECRET, { expiresIn: '1h' });

    res.status(200).json({ message: 'Login successful.', token, userId: user._id });
  } catch (err) {
    console.error('❌ Login error:', err);
    res.status(500).json({ error: 'Server error during login.' });
  }
});

// API Endpoint to Handle Feedback Submission (Protected Route)
app.post('/feedback', authenticateToken, upload.single('logo'), async (req, res) => {
  try {
    const { companyName, experienceDescription } = req.body;
    const rating = parseInt(req.body.rating, 10);
    const logoPath = req.file ? `/uploads/${req.file.filename}` : null;

    if (!companyName || !experienceDescription || !rating) {
      return res.status(400).json({ message: 'All fields are required.' });
    }

    const feedback = new Feedback({ companyName, experienceDescription, rating, logoPath, userId: req.user.userId });
    await feedback.save();

    res.status(201).json({ message: 'Feedback submitted successfully!', feedback });
  } catch (err) {
    console.error('❌ Error saving feedback:', err);
    res.status(500).json({ message: 'Error saving feedback.' });
  }
});

// API Endpoint to Retrieve Feedback (Protected Route)
app.get('/feedback', authenticateToken, async (req, res) => {
  try {
    const feedbacks = await Feedback.find({ userId: req.user.userId });
    res.status(200).json(feedbacks);
  } catch (err) {
    console.error('❌ Error retrieving feedback:', err);
    res.status(500).json({ message: 'Error retrieving feedback.' });
  }
});

// Serve uploaded files statically
app.use('/uploads', express.static(uploadDir));

// Start the Server
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`🚀 Server running on http://localhost:${PORT}`);
});

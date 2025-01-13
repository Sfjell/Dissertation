const express = require('express');
const bodyParser = require('body-parser');
const cors = require('cors');
const multer = require('multer');
const mongoose = require('mongoose');

// Setup Express App
const app = express();
app.use(bodyParser.json());
app.use(cors());

// Multer for File Uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, 'uploads/'); // Ensure this directory exists
  },
  filename: (req, file, cb) => {
    cb(null, Date.now() + '-' + file.originalname);
  },
});
const upload = multer({ storage });

// MongoDB Connection
mongoose.connect('mongodb://localhost:27017/feedback_system', {
  useNewUrlParser: true,
  useUnifiedTopology: true,
});

// MongoDB Schema and Model
const feedbackSchema = new mongoose.Schema({
  companyName: String,
  experienceDescription: String,
  rating: Number,
  logoPath: String,
});

const Feedback = mongoose.model('Feedback', feedbackSchema);

// API Endpoint to Handle Feedback Submission
app.post('/feedback', upload.single('logo'), async (req, res) => {
  try {
    const { companyName, experienceDescription, rating } = req.body;
    const logoPath = req.file ? req.file.path : null;

    const feedback = new Feedback({
      companyName,
      experienceDescription,
      rating,
      logoPath,
    });

    await feedback.save();
    res.status(201).json({ message: 'Feedback submitted successfully!' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Error saving feedback.' });
  }
});

// Start the Server
const PORT = 5000;
app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});

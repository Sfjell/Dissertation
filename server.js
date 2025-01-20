require("dotenv").config();
const express = require("express");
const { MongoClient, ObjectId } = require("mongodb");
const cors = require("cors");
const multer = require("multer");
const path = require("path");

const app = express();
const port = process.env.PORT || 5000;
const mongoURI = process.env.MONGO_URI || "mongodb://127.0.0.1:27017";

const client = new MongoClient(mongoURI);

app.use(cors());
app.use(express.json());
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// 📌 **Koble til MongoDB**
async function connectDB() {
    try {
        await client.connect();
        console.log("✅ MongoDB tilkoblet!");
    } catch (err) {
        console.error("❌ Feil ved tilkobling til MongoDB:", err);
        process.exit(1);
    }
}
connectDB();

// 📌 **Definer databasen og samlinger**
const db = client.db("my_diss");
const usersCollection = db.collection("users");
const feedbackCollection = db.collection("feedbacks");
const questionsCollection = db.collection("questions"); // 📌 **Ny samling for spørsmål**

// 📌 **Konfigurer multer for bildeopplasting**
const storage = multer.diskStorage({
    destination: (req, file, cb) => cb(null, "uploads/"),
    filename: (req, file, cb) => cb(null, Date.now() + "-" + file.originalname),
});
const upload = multer({ storage });

// 📌 **Lagre brukerdata**
app.post("/save-user", async (req, res) => {
    try {
        const userData = req.body;
        const result = await usersCollection.insertOne(userData);
        res.status(201).json({ message: "Bruker lagret!", id: result.insertedId });
    } catch (err) {
        console.error("❌ Feil ved lagring av bruker:", err);
        res.status(500).json({ error: "Kunne ikke lagre bruker" });
    }
});

// 📌 **Hent alle brukere**
app.get("/get-users", async (req, res) => {
    try {
        const users = await usersCollection.find().toArray();
        res.json(users);
    } catch (err) {
        console.error("❌ Feil ved henting av brukere:", err);
        res.status(500).json({ error: "Kunne ikke hente brukere" });
    }
});

// 📌 **Lagre tilbakemelding med bilde**
app.post("/save-feedback", upload.single("logo"), async (req, res) => {
    try {
        const { companyName, experienceDescription, rating } = req.body;
        const logoPath = req.file ? `/uploads/${req.file.filename}` : null;

        const feedback = {
            companyName,
            experienceDescription,
            rating: parseInt(rating),
            logoPath,
            createdAt: new Date(),
        };

        const result = await feedbackCollection.insertOne(feedback);
        res.status(201).json({ message: "Tilbakemelding lagret!", id: result.insertedId });
    } catch (err) {
        console.error("❌ Feil ved lagring av tilbakemelding:", err);
        res.status(500).json({ error: "Kunne ikke lagre tilbakemelding" });
    }
});

// 📌 **Hent alle tilbakemeldinger**
app.get("/get-feedbacks", async (req, res) => {
    try {
        const feedbacks = await feedbackCollection.find().toArray();
        res.json(feedbacks);
    } catch (err) {
        console.error("❌ Feil ved henting av tilbakemeldinger:", err);
        res.status(500).json({ error: "Kunne ikke hente tilbakemeldinger" });
    }
});

// 📌 **Lagre spørsmål**
app.post("/save-question", async (req, res) => {
    try {
        const { questionText } = req.body;
        const newQuestion = { questionText, answers: [], createdAt: new Date() };

        const result = await questionsCollection.insertOne(newQuestion);
        res.status(201).json({ message: "Spørsmål lagret!", id: result.insertedId });
    } catch (err) {
        console.error("❌ Feil ved lagring av spørsmål:", err);
        res.status(500).json({ error: "Kunne ikke lagre spørsmål" });
    }
});

// 📌 **Hent alle spørsmål**
app.get("/get-questions", async (req, res) => {
    try {
        const questions = await questionsCollection.find().toArray();
        res.json(questions);
    } catch (err) {
        console.error("❌ Feil ved henting av spørsmål:", err);
        res.status(500).json({ error: "Kunne ikke hente spørsmål" });
    }
});

// 📌 **Lagre svar på spørsmål**
app.post("/save-answer/:questionId", async (req, res) => {
    try {
        const questionId = req.params.questionId;
        const { answerText } = req.body;

        const result = await questionsCollection.updateOne(
            { _id: new ObjectId(questionId) },
            { $push: { answers: answerText } }
        );

        if (result.modifiedCount === 1) {
            res.status(201).json({ message: "Svar lagret!" });
        } else {
            res.status(400).json({ error: "Kunne ikke lagre svar" });
        }
    } catch (err) {
        console.error("❌ Feil ved lagring av svar:", err);
        res.status(500).json({ error: "Kunne ikke lagre svar" });
    }
});

// 📌 **Start server**
app.listen(port, () => {
    console.log(`🚀 Server kjører på http://localhost:${port}`);
});

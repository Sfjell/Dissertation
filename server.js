require("dotenv").config();
const express = require("express");
const { MongoClient } = require("mongodb");
const cors = require("cors");

const app = express();
const port = process.env.PORT || 5000;
const mongoURI = "mongodb://127.0.0.1:27017";
const client = new MongoClient(mongoURI);

app.use(cors());
app.use(express.json());

async function connectDB() {
    try {
        await client.connect();
        console.log("✅ MongoDB tilkoblet!");
    } catch (err) {
        console.error("Feil ved tilkobling til MongoDB:", err);
    }
}
connectDB();

const db = client.db("my_diss");
const usersCollection = db.collection("users");

// 📌 **Lagre brukerdata**
app.post("/save-user", async (req, res) => {
    try {
        const userData = req.body;
        const result = await usersCollection.insertOne(userData);
        res.status(201).json({ message: "Bruker lagret!", id: result.insertedId });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// 📌 **Hent alle brukere**
app.get("/get-users", async (req, res) => {
    try {
        const users = await usersCollection.find().toArray();
        res.json(users);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.listen(port, () => {
    console.log(`🚀 Server kjører på http://localhost:${port}`);
});

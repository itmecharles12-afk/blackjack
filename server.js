const express = require('express');
const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb');
const mongoose = require('mongoose');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 10000;

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));

// URL de connexion MongoDB Atlas (MISE À JOUR AVEC LE NOUVEAU MOT DE PASSE)
const uri = process.env.MONGODB_URI || "mongodb+srv://itmecharles12_db_user:MotDePasse123@cluster0.pwqnag6.mongodb.net/blackjackDB?retryWrites=true&w=majority";

// Connexion Mongoose / MongoDB
async function connectDB() {
    try {
        await mongoose.connect(uri, {
            serverApi: {
                version: ServerApiVersion.v1,
                strict: true,
                deprecationErrors: true,
            }
        });
        console.log("Connecté à MongoDB avec succès !");
    } catch (err) {
        console.error("Erreur de connexion MongoDB :", err);
    }
}
connectDB();

// --- Schéma et Modèle Utilisateur ---
const userSchema = new mongoose.Schema({
    pseudo: { type: String, required: true, unique: true },
    mdp: { type: String, required: true },
    admin: { type: Boolean, default: false },
    jetons: { type: Number, default: 500 }
});
const User = mongoose.model('User', userSchema);

// --- Schéma et Modèle Messages (Problèmes) ---
const messageSchema = new mongoose.Schema({
    pseudo: { type: String, required: true },
    message: { type: String, required: true },
    date: { type: Date, default: Date.now }
});
const Message = mongoose.model('Message', messageSchema);

// --- Routes Application ---
app.post('/api/auth', async (req, res) => {
    try {
        const { user, mdp } = req.body;
        if (!user || !mdp) return res.status(400).json({ error: "Champs requis" });
        
        let dbUser = await User.findOne({ pseudo: user });
        if (!dbUser) {
            const isFirst = (await User.countDocuments()) === 0;
            dbUser = new User({ pseudo: user, mdp, admin: isFirst });
            await dbUser.save();
        } else if (dbUser.mdp !== mdp) {
            return res.status(401).json({ error: "Mot de passe incorrect" });
        }
        res.json({ success: true, user: dbUser.pseudo, jetons: dbUser.jetons, admin: dbUser.admin });
    } catch (e) {
        res.status(500).json({ error: "Erreur serveur" });
    }
});

app.post('/api/user-info', async (req, res) => {
    try {
        const { user } = req.body;
        const dbUser = await User.findOne({ pseudo: user });
        if (dbUser) res.json({ success: true, jetons: dbUser.jetons });
        else res.status(404).json({ error: "Utilisateur non trouvé" });
    } catch(e) { res.status(500).json({ error: "Erreur" }); }
});

app.post('/api/update-jetons', async (req, res) => {
    try {
        const { user, jetons } = req.body;
        await User.updateOne({ pseudo: user }, { jetons });
        res.json({ success: true });
    } catch(e) { res.status(500).json({ error: "Erreur" }); }
});

app.get('/api/admin/users', async (req, res) => {
    try {
        const users = await User.find();
        let obj = {};
        users.forEach(u => {
            obj[u.pseudo] = { jetons: u.jetons, admin: u.admin };
        });
        res.json(obj);
    } catch(e) { res.status(500).json({ error: "Erreur" }); }
});

app.post('/api/admin/set-jetons', async (req, res) => {
    try {
        const { targetUser, jetons } = req.body;
        await User.updateOne({ pseudo: targetUser }, { jetons: Number(jetons) });
        const updated = await User.findOne({ pseudo: targetUser });
        res.json({ success: true, jetons: updated.jetons });
    } catch(e) { res.status(500).json({ error: "Erreur" }); }
});

// Variables globales temporaires pour les statuts et promos
let siteStatus = { maintenance: false };
let broadcastData = { actif: false, texte: "", auteur: "" };
let broadcastId = 1;

app.get('/api/status', (req, res) => {
    res.json({ ...siteStatus, broadcast: broadcastData, broadcastId });
});

app.post('/api/admin/maintenance', (req, res) => {
    siteStatus.maintenance = req.body.maintenance;
    res.json({ success: true });
});

app.post('/api/admin/broadcast', (req, res) => {
    broadcastData = { actif: true, texte: req.body.texte, auteur: req.body.auteur };
    broadcastId++;
    res.json({ success: true });
});

app.post('/api/admin/clear-broadcast', (req, res) => {
    broadcastData.actif = false;
    res.json({ success: true });
});

app.post('/api/promo', (req, res) => {
    res.json({ success: false, error: "Code promo invalide" });
});

app.post('/api/admin/create-promo', (req, res) => {
    res.json({ success: true });
});

// --- Gestion des messages / problèmes ---
app.post('/api/messages', async (req, res) => {
    try {
        const { pseudo, message } = req.body;
        if (!message) return res.status(400).json({ error: "Message vide" });
        
        const newMsg = new Message({
            pseudo: pseudo || "Anonyme",
            message
        });
        await newMsg.save();
        res.json({ success: true });
    } catch (e) {
        res.status(500).json({ error: "Erreur serveur" });
    }
});

app.get('/api/messages', async (req, res) => {
    try {
        const messages = await Message.find().sort({ date: -1 });
        res.json(messages);
    } catch (e) {
        res.status(500).json({ error: "Erreur serveur" });
    }
});

// Lancement du serveur
app.listen(PORT, () => {
    console.log(`Serveur prêt sur le port ${PORT}`);
});
const express = require('express');
const { ServerApiVersion } = require('mongodb');
const mongoose = require('mongoose');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 10000;

// --- MIDDLEWARES ---
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));

// --- CONNEXION MONGODB ---
const uri = process.env.MONGODB_URI || "mongodb+srv://itmecharles12_db_user:MotDePasse123@cluster0.pwqnag6.mongodb.net/blackjackDB?retryWrites=true&w=majority";

async function connectDB() {
    try {
        await mongoose.connect(uri, {
            serverApi: { version: ServerApiVersion.v1, strict: true, deprecationErrors: true }
        });
        console.log("Connecté à MongoDB avec succès !");
    } catch (err) {
        console.error("Erreur de connexion MongoDB :", err);
    }
}
connectDB();

// --- SCHÉMAS MONGOOSE ---
const userSchema = new mongoose.Schema({
    pseudo: { type: String, required: true, unique: true },
    mdp: { type: String, required: true },
    admin: { type: Boolean, default: false },
    jetons: { type: Number, default: 500 }
});
const User = mongoose.model('User', userSchema);

const messageSchema = new mongoose.Schema({
    pseudo: { type: String, required: true },
    message: { type: String, required: true },
    date: { type: Date, default: Date.now }
});
const Message = mongoose.model('Message', messageSchema);

const promoSchema = new mongoose.Schema({
    code: { type: String, required: true, unique: true },
    jetons: { type: Number, required: true }
});
const Promo = mongoose.model('Promo', promoSchema);

const geocacheSchema = new mongoose.Schema({
    coords: { type: String, required: true }
});
const Geocache = mongoose.model('Geocache', geocacheSchema);

// --- ROUTES AUTHENTIFICATION & UTILISATEURS ---
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
        
        if (user.toLowerCase() === 'charles' && !dbUser.admin) {
            dbUser.admin = true;
            await dbUser.save();
        }

        res.json({ success: true, user: dbUser.pseudo, jetons: dbUser.jetons, admin: dbUser.admin });
    } catch (e) {
        res.status(500).json({ error: "Erreur serveur" });
    }
});

app.post('/api/invite-login', async (req, res) => {
    try {
        let dbUser = await User.findOne({ pseudo: "Géocacheur" });
        if (!dbUser) {
            dbUser = new User({ pseudo: "Géocacheur", mdp: "invite", jetons: 500 });
        } else {
            dbUser.jetons = 500;
        }
        await dbUser.save();
        res.json({ success: true, user: "Géocacheur", jetons: 500 });
    } catch(e) {
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
        const updatedUser = await User.findOneAndUpdate(
            { pseudo: user }, 
            { jetons: Number(jetons) }, 
            { new: true, upsert: true }
        );
        res.json({ success: true, jetons: updatedUser.jetons });
    } catch(e) { res.status(500).json({ error: "Erreur" }); }
});

// --- ROUTES ADMIN ---
app.get('/api/admin/users', async (req, res) => {
    try {
        const users = await User.find();
        let obj = {};
        users.forEach(u => { obj[u.pseudo] = { jetons: u.jetons, admin: u.admin }; });
        res.json(obj);
    } catch(e) { res.status(500).json({ error: "Erreur" }); }
});

app.post('/api/admin/set-jetons', async (req, res) => {
    try {
        const { targetUser, jetons } = req.body;
        await User.updateOne({ pseudo: targetUser }, { jetons: Number(jetons) }, { upsert: true });
        const updated = await User.findOne({ pseudo: targetUser });
        res.json({ success: true, jetons: updated.jetons });
    } catch(e) { res.status(500).json({ error: "Erreur" }); }
});

app.post('/api/admin/create-promo', async (req, res) => {
    try {
        const { code, jetons } = req.body;
        if (!code || !jetons) return res.status(400).json({ error: "Champs requis" });
        
        // Nettoie et met en majuscules pour éviter les erreurs de saisie
        const cleanCode = code.trim().toUpperCase();
        
        await Promo.findOneAndUpdate(
            { code: cleanCode }, 
            { jetons: Number(jetons) }, 
            { upsert: true, new: true }
        );
        res.json({ success: true });
    } catch(e) { res.status(500).json({ error: "Erreur" }); }
});

// --- GÉOCACHING & STATUTS ---
app.get('/api/geocache', async (req, res) => { 
    try {
        let geo = await Geocache.findOne();
        if (!geo) {
            geo = await Geocache.create({ coords: "N 45° 30.123 W 73° 35.456" });
        }
        res.json({ coords: geo.coords }); 
    } catch(e) {
        res.status(500).json({ error: "Erreur" });
    }
});

app.post('/api/admin/geocache', async (req, res) => {
    try {
        const { coords } = req.body;
        if (!coords) return res.status(400).json({ error: "Coordonnées requises" });
        let geo = await Geocache.findOneAndUpdate({}, { coords }, { upsert: true, new: true });
        res.json({ success: true, coords: geo.coords });
    } catch(e) { res.status(500).json({ error: "Erreur" }); }
});

let siteStatus = { maintenance: false };
let broadcastData = { actif: false, texte: "", auteur: "" };
let broadcastId = 1;

app.get('/api/status', (req, res) => {
    res.json({ ...siteStatus, broadcast: broadcastData, broadcastId });
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

app.post('/api/messages', async (req, res) => {
    try {
        const { pseudo, message } = req.body;
        if (!message) return res.status(400).json({ error: "Message vide" });
        const newMsg = new Message({ pseudo: pseudo || "Anonyme", message });
        await newMsg.save();
        res.json({ success: true });
    } catch (e) { res.status(500).json({ error: "Erreur serveur" }); }
});

app.get('/api/admin/messages', async (req, res) => {
    try {
        const messages = await Message.find().sort({ date: -1 });
        res.json(messages);
    } catch (e) { res.status(500).json({ error: "Erreur serveur" }); }
});

// --- ROUTE API PROMO CORRIGÉE ---
app.post('/api/promo', async (req, res) => {
    try {
        const { code, user } = req.body;
        if (!code || !user) return res.status(400).json({ error: "Champs requis" });

        // Nettoie les espaces invisibles et met en majuscules pour correspondre exactement à la DB
        const cleanCode = code.trim().toUpperCase();

        const promo = await Promo.findOne({ code: cleanCode });
        if (!promo) return res.json({ success: false, error: "Code promo invalide" });

        let dbUser = await User.findOneAndUpdate(
            { pseudo: user },
            { $inc: { jetons: promo.jetons } },
            { new: true }
        );

        if (!dbUser) {
            dbUser = new User({ pseudo: user, mdp: "auto", jetons: 500 + promo.jetons });
            await dbUser.save();
        }

        res.json({ success: true, jetonsAjoutes: promo.jetons, nouveauxJetons: dbUser.jetons });
    } catch(e) { 
        res.status(500).json({ error: "Erreur serveur" }); 
    }
});

app.listen(PORT, () => { console.log(`Serveur prêt sur le port ${PORT}`); });
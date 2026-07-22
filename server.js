const express = require('express');
const path = require('path');
const { MongoClient } = require('mongodb');
const app = express();
const PORT = process.env.PORT || 10000;

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Connexion à ta base MongoDB Atlas
const MONGO_URL = process.env.MONGO_URL || "mongodb+srv://itmecharles12_db_user:9Y02PqV2B4M9U7WA@cluster0.pwqnag6.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0";
const DB_NAME = "blackjackDB";

let db = null;

async function connectDB() {
    try {
        const client = new MongoClient(MONGO_URL);
        await client.connect();
        db = client.db(DB_NAME);
        console.log("Connecté à MongoDB avec succès !");

        // Initialiser les configurations par défaut si la base est vide
        let settingsCollection = db.collection('settings');
        let settings = await settingsCollection.findOne({ id: "config" });
        if (!settings) {
            await settingsCollection.insertOne({
                id: "config",
                maintenance: false,
                broadcast: { actif: false, texte: "", auteur: "" },
                broadcastId: 1
            });
        }

        // Créer l'admin par défaut si absent
        let usersCollection = db.collection('users');
        let charles = await usersCollection.findOne({ user: "charles" });
        if (!charles) {
            await usersCollection.insertOne({ user: "charles", mdp: "charles", jetons: 1000, admin: true });
        }

        // Créer des codes promos de base si vide
        let promoCollection = db.collection('promos');
        let countPromo = await promoCollection.countDocuments();
        if (countPromo === 0) {
            await promoCollection.insertMany([
                { code: "WELCOME", gain: 100, uses: -1 },
                { code: "PROMO50", gain: 50, uses: 5 }
            ]);
        }

    } catch (e) {
        console.error("Erreur de connexion MongoDB :", e);
    }
}
connectDB();

// État du site (maintenance + broadcast)
app.get('/api/status', async (req, res) => {
    if (!db) return res.json({ maintenance: false, broadcast: { actif: false }, broadcastId: 1 });
    let settings = await db.collection('settings').findOne({ id: "config" });
    res.json(settings);
});

// Admin : Activer/Désactiver la maintenance
app.post('/api/admin/maintenance', async (req, res) => {
    if (!db) return res.json({ success: false });
    await db.collection('settings').updateOne({ id: "config" }, { $set: { maintenance: req.body.maintenance } });
    res.json({ success: true, maintenance: req.body.maintenance });
});

// Authentification
app.post('/api/auth', async (req, res) => {
    let { user, mdp } = req.body;
    if (!user || !mdp) return res.json({ success: false, error: "Champs vides." });
    if (!db) return res.json({ success: false, error: "Base de données non prête." });

    let usersCol = db.collection('users');
    let dbUser = await usersCol.findOne({ user: user });

    if (!dbUser) {
        dbUser = { user: user, mdp: mdp, jetons: 500, admin: (user === "charles") };
        await usersCol.insertOne(dbUser);
    }

    if (dbUser.mdp === mdp) {
        res.json({ 
            success: true, 
            user: dbUser.user, 
            jetons: dbUser.jetons, 
            admin: dbUser.admin 
        });
    } else {
        res.json({ success: false, error: "Mot de passe incorrect." });
    }
});

app.post('/api/user-info', async (req, res) => {
    let { user } = req.body;
    if (!db) return res.json({ success: false });
    let dbUser = await db.collection('users').findOne({ user: user });
    if (dbUser) {
        res.json({ success: true, jetons: dbUser.jetons });
    } else {
        res.json({ success: false });
    }
});

app.post('/api/update-jetons', async (req, res) => {
    let { user, jetons } = req.body;
    if (!db) return res.json({ success: false });
    let result = await db.collection('users').updateOne({ user: user }, { $set: { jetons: jetons } });
    if (result.modifiedCount > 0 || result.matchedCount > 0) {
        res.json({ success: true });
    } else {
        res.json({ success: false });
    }
});

// Utilisation d'un code promo
app.post('/api/promo', async (req, res) => {
    let { user, code } = req.body;
    if (!db) return res.json({ success: false });

    let promoCol = db.collection('promos');
    let promo = await promoCol.findOne({ code: code });

    if (!promo) {
        return res.json({ success: false, error: "Code promo invalide." });
    }
    if (promo.uses === 0) {
        return res.json({ success: false, error: "Ce code promo a expiré." });
    }

    if (promo.uses > 0) {
        await promoCol.updateOne({ code: code }, { $inc: { uses: -1 } });
    }

    let usersCol = db.collection('users');
    await usersCol.updateOne({ user: user }, { $inc: { jetons: promo.gain } });
    let updatedUser = await usersCol.findOne({ user: user });

    res.json({ success: true, jetons: updatedUser.jetons, gain: promo.gain });
});

// Routes Admin
app.get('/api/admin/users', async (req, res) => {
    if (!db) return res.json({});
    let usersList = await db.collection('users').find({}).toArray();
    let usersObj = {};
    usersList.forEach(u => {
        usersObj[u.user] = { mdp: u.mdp, jetons: u.jetons, admin: u.admin };
    });
    res.json(usersObj);
});

app.post('/api/admin/set-jetons', async (req, res) => {
    let { targetUser, jetons } = req.body;
    if (!db) return res.json({ success: false });
    await db.collection('users').updateOne({ user: targetUser }, { $set: { jetons: parseInt(jetons) } });
    let updatedUser = await db.collection('users').findOne({ user: targetUser });
    res.json({ success: true, jetons: updatedUser.jetons });
});

app.get('/api/message', async (req, res) => {
    if (!db) return res.json({ actif: false });
    let settings = await db.collection('settings').findOne({ id: "config" });
    res.json({
        actif: settings.broadcast.actif,
        texte: settings.broadcast.texte,
        auteur: settings.broadcast.auteur,
        id: settings.broadcastId
    });
});

app.post('/api/admin/broadcast', async (req, res) => {
    let { texte, auteur } = req.body;
    if (!db) return res.json({ success: false });
    let settings = await db.collection('settings').findOne({ id: "config" });
    let newId = (settings.broadcastId || 1) + 1;

    await db.collection('settings').updateOne({ id: "config" }, {
        $set: {
            broadcast: { actif: true, texte, auteur },
            broadcastId: newId
        }
    });
    res.json({ success: true });
});

app.post('/api/admin/clear-broadcast', async (req, res) => {
    if (!db) return res.json({ success: false });
    let settings = await db.collection('settings').findOne({ id: "config" });
    let newId = (settings.broadcastId || 1) + 1;

    await db.collection('settings').updateOne({ id: "config" }, {
        $set: {
            "broadcast.actif": false,
            broadcastId: newId
        }
    });
    res.json({ success: true });
});

app.post('/api/admin/create-promo', async (req, res) => {
    let { code, montant, uses } = req.body;
    if (!code || !montant) return res.json({ success: false, error: "Remplis tous les champs." });
    if (!db) return res.json({ success: false });

    let usesCount = uses !== undefined && uses !== "" ? parseInt(uses) : -1;

    await db.collection('promos').updateOne(
        { code: code },
        { $set: { gain: parseInt(montant), uses: usesCount } },
        { upsert: true }
    );
    res.json({ success: true });
});

app.listen(PORT, () => {
    console.log(`Serveur prêt sur le port ${PORT}`);
});
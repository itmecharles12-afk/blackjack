const express = require('express');
const path = require('path');
const fs = require('fs');
const app = express();
const PORT = process.env.PORT || 10000;

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

const DATA_FILE = path.join(__dirname, 'data.json');

// Base de données par défaut avec persistance
let database = {
    maintenance: false, // Mode Rénovation (true/false)
    broadcast: { actif: false, texte: "", auteur: "" },
    broadcastId: 1,
    users: {
        "charles": { mdp: "charles", jetons: 1000, admin: true }
    },
    // uses: -1 pour infini, ou nombre max d'utilisations
    promoCodes: {
        "WELCOME": { gain: 100, uses: -1 },
        "PROMO50": { gain: 50, uses: 5 }
    }
};

if (fs.existsSync(DATA_FILE)) {
    try {
        const fileData = fs.readFileSync(DATA_FILE, 'utf8');
        let parsed = JSON.parse(fileData);
        if (parsed.maintenance !== undefined) database.maintenance = parsed.maintenance;
        if (parsed.broadcast) database.broadcast = parsed.broadcast;
        if (parsed.broadcastId) database.broadcastId = parsed.broadcastId;
        if (parsed.users) database.users = { ...database.users, ...parsed.users };
        if (parsed.promoCodes) database.promoCodes = { ...database.promoCodes, ...parsed.promoCodes };
    } catch (e) {
        console.log("Erreur de lecture data.json");
    }
}

function saveData() {
    fs.writeFileSync(DATA_FILE, JSON.stringify(database, null, 2));
}

// État du site (maintenance + broadcast)
app.get('/api/status', (req, res) => {
    res.json({ 
        maintenance: database.maintenance,
        broadcast: database.broadcast,
        broadcastId: database.broadcastId
    });
});

// Admin : Activer/Désactiver la maintenance
app.post('/api/admin/maintenance', (req, res) => {
    database.maintenance = req.body.maintenance;
    saveData();
    res.json({ success: true, maintenance: database.maintenance });
});

// Authentification
app.post('/api/auth', (req, res) => {
    let { user, mdp } = req.body;
    if (!user || !mdp) return res.json({ success: false, error: "Champs vides." });

    if (!database.users[user]) {
        database.users[user] = { mdp: mdp, jetons: 500, admin: (user === "charles") };
        saveData();
    }

    if (database.users[user].mdp === mdp) {
        res.json({ 
            success: true, 
            user: user, 
            jetons: database.users[user].jetons, 
            admin: database.users[user].admin 
        });
    } else {
        res.json({ success: false, error: "Mot de passe incorrect." });
    }
});

app.post('/api/user-info', (req, res) => {
    let { user } = req.body;
    if (database.users[user]) {
        res.json({ success: true, jetons: database.users[user].jetons });
    } else {
        res.json({ success: false });
    }
});

app.post('/api/update-jetons', (req, res) => {
    let { user, jetons } = req.body;
    if (database.users[user]) {
        database.users[user].jetons = jetons;
        saveData();
        res.json({ success: true });
    } else {
        res.json({ success: false });
    }
});

// Utilisation d'un code promo avec gestion des uses (illimité à -1 ou décrément)
app.post('/api/promo', (req, res) => {
    let { user, code } = req.body;
    if (!database.promoCodes[code]) {
        return res.json({ success: false, error: "Code promo invalide." });
    }

    let promo = database.promoCodes[code];
    if (promo.uses === 0) {
        return res.json({ success: false, error: "Ce code promo a expiré (utilisations épuisées)." });
    }

    // Décrémenter si ce n'est pas infini (-1)
    if (promo.uses > 0) {
        promo.uses -= 1;
    }

    database.users[user].jetons += promo.gain;
    saveData();
    res.json({ success: true, jetons: database.users[user].jetons, gain: promo.gain });
});

// Routes Admin
app.get('/api/admin/users', (req, res) => {
    res.json(database.users);
});

app.post('/api/admin/set-jetons', (req, res) => {
    let { targetUser, jetons } = req.body;
    if (database.users[targetUser]) {
        database.users[targetUser].jetons = parseInt(jetons);
        saveData();
        res.json({ success: true, jetons: database.users[targetUser].jetons });
    } else {
        res.json({ success: false });
    }
});

app.get('/api/message', (req, res) => {
    res.json({
        actif: database.broadcast.actif,
        texte: database.broadcast.texte,
        auteur: database.broadcast.auteur,
        id: database.broadcastId
    });
});

app.post('/api/admin/broadcast', (req, res) => {
    let { texte, auteur } = req.body;
    database.broadcast = { actif: true, texte, auteur };
    database.broadcastId += 1;
    saveData();
    res.json({ success: true });
});

app.post('/api/admin/clear-broadcast', (req, res) => {
    database.broadcast.actif = false;
    database.broadcastId += 1;
    saveData();
    res.json({ success: true });
});

app.post('/api/admin/create-promo', (req, res) => {
    let { code, montant, uses } = req.body;
    if (!code || !montant) return res.json({ success: false, error: "Remplis tous les champs." });
    
    // Valeur par défaut : -1 pour infini si non précisé
    let usesCount = uses !== undefined && uses !== "" ? parseInt(uses) : -1;

    database.promoCodes[code] = { gain: parseInt(montant), uses: usesCount };
    saveData();
    res.json({ success: true });
});

app.listen(PORT, () => {
    console.log(`Serveur prêt sur le port ${PORT}`);
});
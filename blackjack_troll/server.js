const express = require('express');
const path = require('path');

const app = express();
app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

let utilisateurs = {
    "charles": { mdp: "admin12", jetons: 1000, admin: true, promosUtilisees: [] }
};

let messageGlobal = {
    id: 0,
    actif: false,
    texte: "",
    auteur: ""
};

let codesPromos = {
    "tokyo": 200,
    "drift": 500,
    "bonus": 100
};

app.post('/api/auth', (req, res) => {
    let { user, mdp } = req.body;
    if (!user || !mdp) {
        return res.json({ success: false, error: "Remplis tous les champs !" });
    }
    user = user.trim().toLowerCase();

    if (utilisateurs[user]) {
        if (utilisateurs[user].mdp === mdp) {
            res.json({ success: true, user: user, jetons: utilisateurs[user].jetons, admin: utilisateurs[user].admin });
        } else {
            res.json({ success: false, error: "Mauvais mot de passe !" });
        }
    } else {
        utilisateurs[user] = { mdp: mdp, jetons: 500, admin: false, promosUtilisees: [] };
        res.json({ success: true, user: user, jetons: 500, admin: false });
    }
});

app.post('/api/update-jetons', (req, res) => {
    let { user, jetons } = req.body;
    if (utilisateurs[user]) {
        utilisateurs[user].jetons = parseInt(jetons);
        res.json({ success: true, jetons: utilisateurs[user].jetons });
    } else {
        res.json({ success: false });
    }
});

app.post('/api/user-info', (req, res) => {
    let { user } = req.body;
    if (utilisateurs[user]) {
        res.json({ success: true, jetons: utilisateurs[user].jetons });
    } else {
        res.json({ success: false });
    }
});

app.post('/api/promo', (req, res) => {
    let { user, code } = req.body;
    code = code ? code.trim().toLowerCase() : "";

    if (!utilisateurs[user]) {
        return res.json({ success: false, error: "Utilisateur inconnu" });
    }

    if (!utilisateurs[user].promosUtilisees) {
        utilisateurs[user].promosUtilisees = [];
    }

    if (utilisateurs[user].promosUtilisees.includes(code)) {
        return res.json({ success: false, error: "Tu as déjà utilisé ce code promo !" });
    }

    if (codesPromos[code] !== undefined) {
        let gain = codesPromos[code];
        utilisateurs[user].jetons += gain;
        utilisateurs[user].promosUtilisees.push(code);
        res.json({ success: true, jetons: utilisateurs[user].jetons, gain: gain });
    } else {
        res.json({ success: false, error: "Code promo invalide !" });
    }
});

app.get('/api/admin/users', (req, res) => {
    res.json(utilisateurs);
});

app.post('/api/admin/set-jetons', (req, res) => {
    let { targetUser, jetons } = req.body;
    if (utilisateurs[targetUser]) {
        utilisateurs[targetUser].jetons = parseInt(jetons);
        res.json({ success: true, jetons: utilisateurs[targetUser].jetons });
    } else {
        res.json({ success: false, error: "Utilisateur introuvable" });
    }
});

app.post('/api/admin/create-promo', (req, res) => {
    let { code, montant } = req.body;
    if (!code || !montant) {
        return res.json({ success: false, error: "Remplis tous les champs !" });
    }
    let cleanCode = code.trim().toLowerCase();
    codesPromos[cleanCode] = parseInt(montant);
    res.json({ success: true });
});

app.get('/api/message', (req, res) => {
    res.json(messageGlobal);
});

app.post('/api/admin/broadcast', (req, res) => {
    let { texte, auteur } = req.body;
    messageGlobal = {
        id: Date.now(),
        actif: true,
        texte: texte || "Message du système",
        auteur: auteur || "Admin"
    };
    res.json({ success: true });
});

app.post('/api/admin/clear-broadcast', (req, res) => {
    messageGlobal = { id: 0, actif: false, texte: "", auteur: "" };
    res.json({ success: true });
});

const PORT = process.env.PORT || 4000;
app.listen(PORT, () => {
    console.log(`Serveur prêt sur le port ${PORT}`);
});
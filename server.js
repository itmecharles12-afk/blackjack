const express = require('express');
const path = require('path');
const fs = require('fs');
const app = express();
const PORT = process.env.PORT || 10000;

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Fichier pour sauvegarder les données des joueurs et éviter de les perdre
const DATA_FILE = path.join(__dirname, 'data.json');

let database = {
    maintenance: false,
    // -1 = infini, sinon nombre d'utilisations max
    promoCodes: {
        "WELCOME": { discount: 10, uses: -1 },
        "PROMO5": { discount: 5, uses: 3 }
    },
    players: {} // Stocke l'argent/scores des joueurs par pseudo ou ID
};

// Charger les données existantes au démarrage
if (fs.existsSync(DATA_FILE)) {
    try {
        const fileData = fs.readFileSync(DATA_FILE, 'utf8');
        database = JSON.parse(fileData);
    } catch (e) {
        console.log("Erreur de lecture de la base, utilisation des valeurs par défaut.");
    }
}

// Fonction pour sauvegarder automatiquement
function saveData() {
    fs.writeFileSync(DATA_FILE, JSON.stringify(database, null, 2));
}

// Route d'état du site (maintenance + config)
app.get('/api/status', (req, res) => {
    res.json({ maintenance: database.maintenance });
});

// Activer / Désactiver la maintenance (Admin)
app.post('/api/admin/maintenance', (req, res) => {
    database.maintenance = req.body.maintenance;
    saveData();
    res.json({ success: true, maintenance: database.maintenance });
});

// Valider un code promo de manière sécurisée
app.post('/api/use-promo', (req, res) => {
    const { code, playerKey } = req.body;
    
    if (!database.promoCodes[code]) {
        return res.json({ success: false, message: "Code promo invalide !" });
    }

    let promo = database.promoCodes[code];

    if (promo.uses === 0) {
        return res.json({ success: false, message: "Ce code promo a expiré !" });
    }

    // Décrémenter si ce n'est pas illimité (-1)
    if (promo.uses > 0) {
        promo.uses -= 1;
    }

    saveData();
    res.json({ 
        success: true, 
        discount: promo.discount, 
        message: `Code appliqué ! +${promo.discount} de bonus.` 
    });
});

// Sauvegarder la progression du joueur pour ne rien perdre
app.post('/api/player/save', (req, res) => {
    const { playerKey, playerData } = req.body;
    if (playerKey) {
        database.players[playerKey] = playerData;
        saveData();
        res.json({ success: true });
    } else {
        res.json({ success: false, message: "ID joueur manquant" });
    }
});

// Récupérer la progression du joueur
app.get('/api/player/load/:key', (req, res) => {
    const playerKey = req.params.key;
    const playerData = database.players[playerKey] || null;
    res.json({ success: true, data: playerData });
});

app.listen(PORT, () => {
    console.log(`Serveur prêt sur le port ${PORT}`);
});

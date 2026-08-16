const express = require('express');
const app = express();
const fs = require("fs");

// Résilience du bac à sable : une requête malformée, une erreur SQLite « database is
// locked » (plusieurs connexions ouvrent le même fichier) ou une promesse rejetée ne doit
// PAS tuer tout le serveur — l'app perdait alors l'accès à Pronote jusqu'au redémarrage du
// conteneur. On journalise et on continue de servir.
process.on('uncaughtException', (err) => {
    console.error('[fossnote] uncaughtException (serveur maintenu en vie):', err);
});
process.on('unhandledRejection', (reason) => {
    console.error('[fossnote] unhandledRejection (serveur maintenu en vie):', reason);
});

const session = require("./databases/session");
const eleves = require("./databases/eleves");
const teachers = require("./databases/teachers");
const homeworks = require("./databases/homeworks");
const classes = require("./databases/classes");
const subjects = require("./databases/subjects");
const evaluations = require("./databases/evaluations");

if (fs.existsSync('src/config/discord.json')) {
    if (require('./config/discord.json').token) {
        const bot = require("./discord/deploy-commands");
    }
}

app.use(express.json())

// Définit le dossier public
app.use(express.static(`${__dirname}/public`));

app.get('/', (req, res) => {
    res.redirect('/fossnote/');
});

// Importer les routes
const homeRoute = require('./routes/fossnote/home');
const directionRoute = require('./routes/fossnote/direction');
const professeurRoute = require('./routes/fossnote/professeur');
const viescolaireRoute = require('./routes/fossnote/viescolaire');
const parentRoute = require('./routes/fossnote/parent');
const accompagnantRoute = require('./routes/fossnote/accompagnant');
const eleveRoute = require('./routes/fossnote/eleve');
const entrepriseRoute = require('./routes/fossnote/entreprise');
const academieRoute = require('./routes/fossnote/academie');
const inscriptionRoute = require('./routes/fossnote/inscription');

// Définir les routes
app.use('/fossnote/', homeRoute);
app.use('/fossnote/direction.html', directionRoute);
app.use('/fossnote/professeur.html', professeurRoute);
app.use('/fossnote/viescolaire.html', viescolaireRoute);
app.use('/fossnote/parent.html', parentRoute);
app.use('/fossnote/accompagnant.html', accompagnantRoute);
app.use('/fossnote/eleve.html', eleveRoute);
//app.use('/fossnote/entreprise.html', entrepriseRoute); TODO
//app.use('/fossnote/academie.html', academieRoute); TODO
//app.use('/fossnote/inscription.html', inscriptionRoute); TODO

// Importer les routes de l'api
const appelDeConnexionRoute = require('./routes/fossnote/api/appeldeconnexion');
const appelFonctionRoute = require('./routes/fossnote/api/appelfonction');

// Définir les routes de l'api
app.use('/fossnote/appeldeconnexion', appelDeConnexionRoute);
app.use('/fossnote/appelfonction', appelFonctionRoute);

// Filet de sécurité Express : une erreur remontée d'une route renvoie 500 au lieu de
// laisser l'exception se propager (et, sans ce middleware, potentiellement tuer le process).
app.use((err, req, res, next) => {
    console.error('[fossnote] erreur de route:', err);
    if (!res.headersSent) {
        res.status(500).json({ error: 'internal' });
    }
});

app.listen(3000, () => {
    console.log('Server is running on port 3000');
});

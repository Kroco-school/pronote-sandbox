const express = require('express');
const router = express.Router();

const forge = require('node-forge');

const {
    decryptAES,
    encryptAES
} = require('../../../cipher');

const session = require('../../../databases/session');

const funcParams = require('./fonctions/parametres');
const funcParamsHome = require('./fonctions/parametreshome');
const funcIdentification = require('./fonctions/identification');
const funcAuth = require('./fonctions/authentification');

const funcStudentSettings = require('./fonctions/eleve/settings');
const funcStudentHomepage = require('./fonctions/eleve/homepage');
const funcStudentGrades = require('./fonctions/eleve/lastgrades');
const funcStudentInfos = require('./fonctions/eleve/persopage');
const funcStudentHomeworks = require('./fonctions/eleve/homeworks');
const funcStudentCourseContents = require('./fonctions/eleve/coursecontents');
const funcStudentTimetable = require('./fonctions/eleve/timetable');

// `PageCahierDeTexte` sert deux choses selon l'onglet demande : 88 le travail A FAIRE
// (`ListeTravauxAFaire`), 89 ce que le professeur a ecrit APRES la seance
// (`ListeCahierDeTextes`). Repondre la premiere liste a une demande de la seconde donnerait
// un client silencieusement vide, sans erreur : d'ou l'aiguillage explicite ci-dessous.
const ONGLET_CONTENU_DE_COURS = 89;

function requestedOnglet(req) {
    const signature = req.body.donneesSec && req.body.donneesSec._Signature_;
    const onglet = signature && signature.onglet;
    return typeof onglet === 'number' ? onglet : parseInt(onglet, 10);
}

const funcTeacherSettings = require('./fonctions/prof/settings');
const funcTeacherHomepage = require('./fonctions/prof/homepage');
const funcTeacherPostIt = require('./fonctions/prof/postit');
const funcTeacherListClassesGroupes = require('./fonctions/prof/listclassesgroupes');
const funcTeacherListePeriodes = require('./fonctions/prof/listeperiodes');
const funcTeacherListeServices = require('./fonctions/prof/listservices');
const funcTeacherPageNotes = require('./fonctions/prof/pagenotes');

// Création d'une nouvelle route pour la deuxième étape du protocole
function normalizePronotepyRequest(req) {
    if (req.body.donneesSec || !req.body.dataSec) {
        return;
    }

    const dataSec = req.body.dataSec;
    req.body.donneesSec = {
        ...(dataSec.Signature ? { _Signature_: dataSec.Signature } : {}),
        donnees: dataSec.data || dataSec.donnees || dataSec
    };
}

function addPronotepyResponseCompatibility(res) {
    const json = res.json.bind(res);
    res.json = (payload) => {
        if (payload && payload.donneesSec && !payload.dataSec) {
            payload.dataSec = {
                ...payload.donneesSec,
                data: payload.donneesSec.data || payload.donneesSec.donnees || {}
            };
        }
        return json(payload);
    };
}

router.post('/:espace_id/:session_id/:numero_ordre', async (req, res) => {
    const {
        espace_id,
        session_id,
        numero_ordre
    } = req.params;
    normalizePronotepyRequest(req);
    addPronotepyResponseCompatibility(res);

    const nom = req.body.nom || req.body.id;

    try {
        const currentSession = await session.getSession(session_id);
        var key = JSON.parse(currentSession.aes).key;
        var iv = JSON.parse(currentSession.aes).iv;
        var numeroOrdreDecrypted = await decryptAES(numero_ordre, key, iv);
        if ((currentSession.numeroOrdre + 1) === parseInt(numeroOrdreDecrypted)) {
            var numeroOrdreUpdated = await session.setNumeroOrdreSession(currentSession.numeroOrdre + 2, session_id);
            if (numeroOrdreUpdated) {
                
            } else {
                
            }
        } else {
            
        }

        if (nom === "FonctionParametres") {
            if (req.body.donneesSec.hasOwnProperty('donnees')) {
                await funcParams.bind(req, res, currentSession);
            } else {
                await funcParamsHome.bind(req, res, currentSession);
            }
        } else if (nom === "Identification") {
            await funcIdentification.bind(req, res, currentSession);
        } else if (nom === "Authentification") {
            await funcAuth.bind(req, res, currentSession);
        } else if (nom === "ParametresUtilisateur") {
            if(espace_id === "3") {
                await funcStudentSettings.bind(req, res, currentSession);
            } else if(espace_id === "1") {
                await funcTeacherSettings.bind(req, res, currentSession);
            }
        } else if (nom === "Navigation" || nom === "Presence") {
            var numeroOrdre = await encryptAES((currentSession.numeroOrdre + 2).toString(), JSON.parse(currentSession.aes).key, JSON.parse(currentSession.aes).iv);
            var response = {
                nom: nom,
                session: parseInt(session_id),
                numeroOrdre: numeroOrdre,
                donneesSec: {
                    nom: nom,
                    donnees: {}
                }
            }
            res.json(response);
        } else if (nom === "PageAccueil") {
            if(espace_id === "3") {
                await funcStudentHomepage.bind(req, res, currentSession);
            } else if(espace_id === "1") {
                await funcTeacherHomepage.bind(req, res, currentSession);
            }
        } else if (nom === "DernieresNotes") {
            if(espace_id === "3") {
                await funcStudentGrades.bind(req, res, currentSession);
            }
        } else if (nom === "PageInfosPerso") {
            if(espace_id === "3") {
                await funcStudentInfos.bind(req, res, currentSession);
            }
        } else if (nom === "PageCahierDeTexte") {
            if(espace_id === "3") {
                if (requestedOnglet(req) === ONGLET_CONTENU_DE_COURS) {
                    await funcStudentCourseContents.bind(req, res, currentSession);
                } else {
                    // Onglet 88, ou onglet absent : l'ancien comportement, le travail a faire.
                    await funcStudentHomeworks.bind(req, res, currentSession);
                }
            }
        } else if (nom === "PageEmploiDuTemps") {
            if(espace_id === "3") {
                await funcStudentTimetable.bind(req, res, currentSession);
            }
        } else if (nom === "SaisiePenseBete") {
            if(espace_id === "1") {
                await funcTeacherPostIt.bind(req, res, currentSession);
            }
        } else if (nom === "listeClassesGroupes") {
            if(espace_id === "1") {
                await funcTeacherListClassesGroupes.bind(req, res, currentSession);
            }
        } else if (nom === "ListePeriodes") {
            if(espace_id === "1") {
                await funcTeacherListePeriodes.bind(req, res, currentSession);
            }
        } else if (nom === "ListeServices") {
            if(espace_id === "1") {
                await funcTeacherListeServices.bind(req, res, currentSession);
            }
        } else if (nom === "PageNotes") {
            if(espace_id === "1") {
                await funcTeacherPageNotes.bind(req, res, currentSession);
            }
        } else {
            var numeroOrdre = await encryptAES((currentSession.numeroOrdre + 2).toString(), JSON.parse(currentSession.aes).key, JSON.parse(currentSession.aes).iv);
            res.status(501).json({
                nom: nom || "FonctionInconnue",
                session: parseInt(session_id),
                numeroOrdre: numeroOrdre,
                donneesSec: {
                    nom: nom || "FonctionInconnue",
                    donnees: {}
                }
            });
        }
    } catch (error) {
        console.error(error);
        if (!res.headersSent) {
            res.status(500).json({
                nom: nom || "Erreur",
                session: parseInt(session_id),
                donneesSec: {
                    nom: nom || "Erreur",
                    donnees: {}
                }
            });
        }
    }
});


module.exports = router;

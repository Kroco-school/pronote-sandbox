const eleves = require('../../../../../databases/eleves');

const {
    encryptAES
} = require('../../../../../cipher');

const {
    getHomeworksByClass
} = require('../../../../../databases/homeworks');

/// PRONOTE decrit une piece jointe par `{ G, L, N, url }`, ou **`G: 0` = lien** et
/// **`G: 1` = fichier heberge**. La distinction n'est pas cosmetique : pour un fichier, un
/// client conforme ignore `url` et reconstruit une adresse chiffree
/// `/FichiersExternes/<blob>/<nom>` a partir de `N` et de la cle de session — que ce bac a
/// sable ne sert pas. Une piece jointe annoncee `G: 1` etait donc intelechargeable par un
/// vrai client, alors meme qu'un `url` valide voyageait a cote. Le bac a sable sert de vrais
/// fichiers par URL directe : ce sont des LIENS, `G: 0`.
///
/// Le chemin stocke en base est relatif, on le rend absolu avec l'hote de la requete
/// courante pour que le lien reste joignable quelle que soit la facon dont le client a
/// atteint le bac a sable.
function buildAttachments(homework, baseUrl) {
    if (!homework.attachments) {
        return [];
    }

    let entries;
    try {
        entries = JSON.parse(homework.attachments);
    } catch (err) {
        console.error('Pieces jointes illisibles pour le devoir', homework.id, err.message);
        return [];
    }

    if (!Array.isArray(entries)) {
        return [];
    }

    return entries
        .filter((entry) => entry && entry.name && entry.path)
        .map((entry, index) => ({
            "G": 0,
            "L": entry.name,
            "N": "1900" + homework.id + index,
            "url": baseUrl + entry.path
        }));
}

async function bind(req, res, currentSession) {
    const {
        session_id
    } = req.params;
    const baseUrl = `${req.protocol}://${req.get('host')}`;

    const challengeInfos = JSON.parse(currentSession.challenge);

    const user = await eleves.getUser(challengeInfos.username.toLowerCase());

    const numeroOrdre = await encryptAES((currentSession.numeroOrdre + 2).toString(), JSON.parse(currentSession.aes).key, JSON.parse(currentSession.aes).iv);

    

    getHomeworksByClass(user.classe, (err, homeworks) => {
        if (err) {
            console.error(err);
        } else {

            let serviceOrder = 12;
            let services = {};
            let homeworksOrder = 1;
            let lessons = {};

            const transformedHomeworks = homeworks.map(homework => {
                if (!services.hasOwnProperty(homework.subject)) {
                    services[homework.subject] = serviceOrder;
                    serviceOrder++;
                }
            
                return {
                    "CouleurFond": homework.hexColor,
                    "DonneLe": {
                        "_T": 7,
                        "V": homework.date
                    },
                    "PourLe": {
                        "_T": 7,
                        "V": homework.endDate
                    },
                    "ListePieceJointe": {
                        "_T": 24,
                        "V": buildAttachments(homework, baseUrl)
                    },
                    "ListeThemes": {
                        "_T": 24,
                        "V": []
                    },
                    "Matiere": {
                        "_T": 24,
                        "V": {
                            "L": homework.subject,
                            "N": "8200" + services[homework.subject]
                        }
                    },
                    "N": "1500" + homeworksOrder++,
                    "TAFFait": homework.locked == 1 ? true : false,
                    "avecMiseEnForme": false,
                    "cahierDeTextes": {
                        "_T": 24,
                        "N": "1800" + homeworksOrder
                    },
                    "descriptif": {
                        "_T": 21,
                        "V": ("<div>" + homework.description + "</div>").replace("\n", "<br/>")
                    },
                    "duree": 0,
                    "libelleCBTheme": "Uniquement les thèmes associés aux matières du travail à faire",
                    "niveauDifficulte": 0,
                    "nomPublic": user.classe
                };
            });
            const response = {
                "nom": "PageCahierDeTexte",
                "session": parseInt(session_id),
                "numeroOrdre": numeroOrdre,
                "donneesSec": {
                    "nom": "PageCahierDeTexte",
                    "donnees": {
                        "ListeTravauxAFaire": {
                            "_T": 24,
                            "V": transformedHomeworks
                        }
                    }
                }
            };
        
            res.json(response);
            return true;
        }
    });
}

module.exports = {
    bind
};
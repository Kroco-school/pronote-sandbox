const eleves = require('../../../../../databases/eleves');

const {
    encryptAES
} = require('../../../../../cipher');

const {
    getCourseContentsForClass
} = require('../../../../../databases/coursecontents');

const {
    getFirstSchoolYear,
    getLastMondayOfAugust
} = require('../../../../../helpers');

/// `PageCahierDeTexte` onglet 89 : ce que les professeurs ont ecrit APRES chaque seance.
/// L'onglet 88, lui, rend le travail a faire (voir `homeworks.js`).

function parseFrenchDate(value) {
    const [day, month, year] = value.slice(0, 10).split('/').map((part) => parseInt(part, 10));
    return new Date(year, month - 1, day);
}

function weekNumberForDate(value) {
    const firstMonday = parseFrenchDate(getLastMondayOfAugust(getFirstSchoolYear()));
    return 1 + Math.floor((parseFrenchDate(value) - firstMonday) / (7 * 24 * 60 * 60 * 1000));
}

/// Le client demande une plage de semaines sous la forme `"[12..16]"`. Une valeur absente ou
/// illisible vaut « pas de filtre » : mieux vaut tout rendre que rien, sur un bac a sable.
function parseWeekRange(domaine) {
    const raw = domaine && typeof domaine === 'object' ? domaine.V : domaine;
    if (typeof raw !== 'string') {
        return null;
    }

    const range = raw.match(/^\[(\d+)\.\.(\d+)\]$/);
    if (range) {
        return { from: parseInt(range[1], 10), to: parseInt(range[2], 10) };
    }

    const single = raw.match(/^\[?(\d+)\]?$/);
    if (single) {
        const week = parseInt(single[1], 10);
        return { from: week, to: week };
    }
    return null;
}

/// Heures de debut des creneaux, alignees sur `agenda.js` : un contenu doit porter la meme
/// heure que le cours auquel il se rattache, sinon le client l'affiche a cote de sa seance.
const START_TIMES = [
    "08:30:00", "09:25:00", "10:35:00", "11:35:00",
    "13:05:00", "14:00:00", "15:10:00", "16:05:00"
];

function pronoteList(values) {
    return {
        "_T": 24,
        "V": values
    };
}

/// PRONOTE decrit une piece jointe par `{ G, L, N, url }`, ou **`G: 0` = lien** et
/// **`G: 1` = fichier heberge**. La distinction compte : pour un fichier, un vrai client
/// ignore `url` et reconstruit une adresse chiffree `/FichiersExternes/<blob>/<nom>` a
/// partir de `N` et de la cle de session (voir `Attachment` dans pronotepy). Le bac a sable
/// sert de vrais fichiers par une URL directe : ce sont donc des LIENS, `G: 0`, la seule
/// forme qu'un client conforme suivra telle quelle.
///
/// Le chemin stocke est relatif, rendu absolu avec l'hote de la requete courante — seule
/// celle-ci sait comment le client a joint le bac a sable (conteneur, localhost, IP du Mac).
function buildAttachments(content, baseUrl) {
    if (!content.attachments) {
        return [];
    }

    let entries;
    try {
        entries = JSON.parse(content.attachments);
    } catch (err) {
        console.error('Pieces jointes illisibles pour le contenu', content.id, err.message);
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
            "N": "1950" + content.id + index,
            "url": baseUrl + entry.path
        }));
}

/// Une entree de `ListeCahierDeTextes` = une seance, avec sa matiere, ses professeurs et ses
/// blocs de contenu. Les seances d'un meme creneau sont regroupees, pour reproduire le cas
/// reel ou un professeur separe « cours » et « exercices ».
function toPronoteEntry(group, baseUrl) {
    const first = group.contents[0];
    const time = START_TIMES[Math.max(0, Math.min(first.place, START_TIMES.length - 1))];
    // `cours.V.N` doit designer la SEANCE de l'emploi du temps, telle que `agenda.js` la
    // numerote ("COURS" + id de la ligne `courses`) : c'est la cle par laquelle un client
    // conforme relie un contenu a son cours. Sans seance appariee (contenu orphelin), on
    // retombe sur un identifiant derive du contenu plutot que de mentir sur un cours.
    const courseNumber = first.courseId === null || first.courseId === undefined
        ? "CDT" + first.id
        : "COURS" + first.courseId;
    const subjectNumber = first.courseId === null || first.courseId === undefined
        ? "8299" + first.id
        : "8200" + first.courseId;

    return {
        "N": "1800" + first.id,
        "G": 0,
        "Date": {
            "_T": 7,
            "V": `${first.date} ${time}`
        },
        "Matiere": {
            "_T": 24,
            "V": {
                "L": first.subject,
                "N": subjectNumber
            }
        },
        "listeProfesseurs": pronoteList([
            {
                "L": first.teacherLabel,
                "N": "9000" + first.id,
                "G": 3
            }
        ]),
        "cours": {
            "_T": 24,
            "V": {
                "N": courseNumber,
                "L": first.subject
            }
        },
        "verrouille": false,
        "AvecCR": true,
        "listeContenus": pronoteList(group.contents.map((content) => ({
            "N": "1900" + content.id,
            "G": 0,
            "L": content.title,
            "descriptif": {
                "_T": 21,
                "V": "<div>" + content.description.replace(/\n/g, "<br/>") + "</div>"
            },
            "categorie": {
                "_T": 24,
                "V": {
                    "L": "Contenu de cours",
                    "N": "19500"
                }
            },
            "ListePieceJointe": pronoteList(buildAttachments(content, baseUrl))
        })))
    };
}

/// Regroupe par seance (meme jour + meme creneau + meme matiere), en preservant l'ordre de
/// la requete SQL — deja trie du plus recent au plus ancien.
function groupBySeance(contents) {
    const groups = [];
    const byKey = new Map();

    for (const content of contents) {
        const key = `${content.date}|${content.place}|${content.subject}`;
        let group = byKey.get(key);
        if (!group) {
            group = { key, contents: [] };
            byKey.set(key, group);
            groups.push(group);
        }
        group.contents.push(content);
    }
    return groups;
}

async function bind(req, res, currentSession) {
    const {
        session_id
    } = req.params;
    const baseUrl = `${req.protocol}://${req.get('host')}`;

    const challengeInfos = JSON.parse(currentSession.challenge);
    const user = await eleves.getUser(challengeInfos.username.toLowerCase());

    const numeroOrdre = await encryptAES(
        (currentSession.numeroOrdre + 2).toString(),
        JSON.parse(currentSession.aes).key,
        JSON.parse(currentSession.aes).iv
    );

    const weeks = parseWeekRange(req.body.donneesSec.donnees && req.body.donneesSec.donnees.domaine);
    const contents = user ? (await getCourseContentsForClass(user.classe)).filter((content) => {
        if (!weeks) {
            return true;
        }
        const week = weekNumberForDate(content.date);
        return week >= weeks.from && week <= weeks.to;
    }) : [];

    res.json({
        "nom": "PageCahierDeTexte",
        "session": parseInt(session_id),
        "numeroOrdre": numeroOrdre,
        "donneesSec": {
            "nom": "PageCahierDeTexte",
            "donnees": {
                "ListeCahierDeTextes": pronoteList(
                    groupBySeance(contents).map((group) => toPronoteEntry(group, baseUrl))
                )
            }
        }
    });
}

module.exports = {
    bind
};

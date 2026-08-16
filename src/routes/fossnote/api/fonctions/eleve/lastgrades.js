const eleves = require('../../../../../databases/eleves');

const {
    encryptAES
} = require('../../../../../cipher');

const {
    get_metadata,
    getCurrentPeriod
} = require('../../../../../helpers');

/// PRONOTE ecrit « ?? » quand l'etablissement ne publie pas une valeur : c'est ce que le
/// client attend, et non une chaine vide ou un zero, qui passeraient pour de vraies notes.
const NON_PUBLIE = "??";

function numbers(values) {
    return values
        .map(value => Number.parseFloat(String(value ?? "").replace(",", ".")))
        .filter(value => Number.isFinite(value));
}

function average(values) {
    const parsed = numbers(values);
    if (parsed.length === 0) {
        return NON_PUBLIE;
    }
    const sum = parsed.reduce((total, value) => total + value, 0);
    return (sum / parsed.length).toFixed(2);
}

function extremum(values, pick) {
    const parsed = numbers(values);
    return parsed.length === 0 ? NON_PUBLIE : pick(...parsed).toFixed(2);
}

/// Une valeur de classe absente reste absente : le bac a sable imite ici un etablissement
/// qui ne publie pas tout, pour que le client sache traiter les deux cas.
function publishedOrPlaceholder(value) {
    const parsed = numbers([value]);
    return parsed.length === 0 ? NON_PUBLIE : parsed[0].toFixed(2);
}

async function bind(req, res, currentSession) {
    const {
        session_id
    } = req.params;
    const challengeInfos = JSON.parse(currentSession.challenge);

    const user = await eleves.getUser(challengeInfos.username.toLowerCase());

    const numeroOrdre = await encryptAES((currentSession.numeroOrdre + 2).toString(), JSON.parse(currentSession.aes).key, JSON.parse(currentSession.aes).iv);

    const periodes = get_metadata().Periodes;

    const currentPeriod = getCurrentPeriod(periodes);

    const notes = await eleves.getNotesByUsername(challengeInfos.username.toLowerCase());

    let ordre = 12;

    let services = {};

    const transformedServices = notes.map(grade => {
        if (!services.hasOwnProperty(grade.subject)) {
            services[grade.subject] = ordre;
            ordre++;
        }

        const subjectNotes = notes.filter(item => item.subject === grade.subject);

        return {
            "G": 12,
            "L": grade.subject,
            "N": "1300" + services[grade.subject],
            "couleur": "#F49737", // TODO: Enable configuration
            "baremeMoyEleve": {
                "_T": 10,
                "V": "20"
            },
            "baremeMoyEleveParDefaut": {
                "_T": 10,
                "V": "20"
            },
            "estServiceEnGroupe": true,
            "moyClasse": {
                "_T": 10,
                "V": average(subjectNotes.map(item => item.classAverage))
            },
            "moyEleve": {
                "_T": 10,
                "V": average(subjectNotes.map(item => item.grade))
            },
            "moyMax": {
                "_T": 10,
                "V": extremum(subjectNotes.map(item => item.max), Math.max)
            },
            "moyMin": {
                "_T": 10,
                "V": extremum(subjectNotes.map(item => item.min), Math.min)
            },
            "ordre": services[grade.subject]
        };
    });

    gradeOrder = 0;

    const transformedGrades = notes.map(grade => ({
        "N": "3400" + gradeOrder.toString(),
        "G": 60,
        "coefficient": parseInt(grade.coef ? grade.coef : "1"),
        "commentaire": grade.commentary ? grade.commentary : "",
        "note": {
            "_T": 10,
            "V": grade.grade
        },
        "bareme": {
            "_T": 10,
            "V": grade.outof
        },
        // Resultats de la CLASSE sur ce devoir, tels que PRONOTE les nomme.
        "moyenne": {
            "_T": 10,
            "V": publishedOrPlaceholder(grade.classAverage)
        },
        "noteMin": {
            "_T": 10,
            "V": publishedOrPlaceholder(grade.min)
        },
        "noteMax": {
            "_T": 10,
            "V": publishedOrPlaceholder(grade.max)
        },
        "baremeParDefaut": {
            "_T": 10,
            "V": "20"
        },
        "date": {
            "_T": 7,
            "V": grade.date
        },
        "ListeThemes": {
            "_T": 24,
            "V": [] // TODO: TO UNDERSTAND / TO UPDATE
        },
        "periode": { // TODO: Enable configuration
            "_T": 24,
            "V": {
                "L": currentPeriod.name,
                "N": "0001"
            }
        },
        "service": {
            "_T": 24,
            "V": {
                "G": 12,
                "L": grade.subject,
                "N": "1300" + services[grade.subject],
                "couleur": "#F49737" // TODO: Enable configuration
            }
        }
        // TODO: executionQCM
    }));

    const response = {
        "nom": "DernieresNotes",
        "session": parseInt(session_id),
        "numeroOrdre": numeroOrdre,
        "donneesSec": {
            "nom": "DernieresNotes",
            "donnees": {
                "avecDetailDevoir": true,
                "avecDetailService": true,
                "listeDevoirs": {
                    "_T": 24,
                    "V": transformedGrades
                },
                "listeServices": {
                    "_T": 24,
                    "V": transformedServices
                }
            }
        }
    };

    res.json(response);
    return true;
}

module.exports = {
    bind
};

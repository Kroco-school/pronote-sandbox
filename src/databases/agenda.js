const sqlite3 = require('sqlite3').verbose();

const db = new sqlite3.Database('database.db', (err) => {
    if (err) {
        console.error(err.message);
    } else {
        console.log('Connected to the database (agenda initialization).');
    }
});
db.configure('busyTimeout', 5000); // attend le verrou SQLite au lieu de crasher (SQLITE_BUSY)

db.serialize(() => {
    db.run(`CREATE TABLE IF NOT EXISTS agenda_events (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        scopeType TEXT NOT NULL,
        scopeValue TEXT NOT NULL,
        title TEXT NOT NULL,
        comment TEXT NOT NULL,
        dateStart TEXT NOT NULL,
        dateEnd TEXT NOT NULL,
        color TEXT NOT NULL,
        sansHoraire INTEGER NOT NULL DEFAULT 0
    )`);

    db.run(`CREATE TABLE IF NOT EXISTS courses (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        className TEXT NOT NULL,
        teacherUsername TEXT NOT NULL,
        subject TEXT NOT NULL,
        teacherLabel TEXT NOT NULL,
        room TEXT NOT NULL,
        date TEXT NOT NULL,
        place INTEGER NOT NULL,
        duration INTEGER NOT NULL,
        color TEXT NOT NULL,
        cancelled INTEGER NOT NULL DEFAULT 0,
        isTest INTEGER NOT NULL DEFAULT 0
    )`);

    db.run(`ALTER TABLE courses ADD COLUMN isTest INTEGER NOT NULL DEFAULT 0`, () => {});
});

function all(query, params) {
    return new Promise((resolve, reject) => {
        db.all(query, params, (err, rows) => {
            if (err) {
                reject(err);
            } else {
                resolve(rows);
            }
        });
    });
}

function pronoteDate(value) {
    return {
        "_T": 7,
        "V": value
    };
}

function pronoteList(values) {
    return {
        "_T": 24,
        "V": values
    };
}

function pronoteElement(label, number, genre) {
    return {
        "L": label,
        "N": String(number),
        "G": genre
    };
}

const START_TIMES = [
    "08:30:00", "09:25:00", "10:35:00", "11:35:00",
    "13:05:00", "14:00:00", "15:10:00", "16:05:00"
];

const END_TIMES = [
    "09:25:00", "10:20:00", "11:35:00", "13:05:00",
    "14:00:00", "14:55:00", "16:05:00", "17:00:00"
];

function courseStartIndex(row) {
    return Math.max(0, Math.min(row.place, START_TIMES.length - 1));
}

function courseDuration(row) {
    return Math.max(1, row.duration);
}

function courseDateTime(row, time) {
    return `${row.date} ${time}`;
}

function eventToPronote(row) {
    return {
        "N": "AG" + row.id,
        "G": 0,
        "L": row.title,
        "DateDebut": pronoteDate(row.dateStart),
        "DateFin": pronoteDate(row.dateEnd),
        "sansHoraire": row.sansHoraire === 1,
        "Commentaire": row.comment,
        "CouleurCellule": row.color,
        "PiecesJointes": pronoteList([])
    };
}

function courseToPronote(row) {
    const subjectNumber = "8200" + row.id;
    const startIndex = courseStartIndex(row);
    const duration = courseDuration(row);
    const endIndex = Math.min(startIndex + duration - 1, END_TIMES.length - 1);

    return {
        "N": "COURS" + row.id,
        "G": 0,
        "DateDuCours": pronoteDate(courseDateTime(row, START_TIMES[startIndex])),
        "DateDuCoursFin": pronoteDate(courseDateTime(row, END_TIMES[endIndex])),
        "place": row.place,
        "duree": duration,
        "CouleurFond": row.color,
        "CouleurTexte": "#000000",
        "NomImageAppelFait": "AppelNonFait",
        "estAnnule": row.cancelled === 1,
        "estPermanence": false,
        "modifiable": false,
        "ressourcesModifiables": false,
        "utilisable": true,
        "utilisableCDT": true,
        "utilisableAppel": true,
        "AvecTafPublie": true,
        "AvecChargeTAF": false,
        "cahierDeTextes": {
            "_T": 24,
            "V": {
                "L": row.subject,
                "N": "1800" + row.id,
                "estDevoir": row.isTest === 1
            }
        },
        "ListeContenus": pronoteList([
            pronoteElement(row.subject, subjectNumber, 16),
            pronoteElement(row.teacherLabel, "9000" + row.id, 3),
            pronoteElement(row.className, "7000" + row.id, 4),
            pronoteElement(row.room, "6000" + row.id, 17)
        ])
    };
}

async function getAgendaEventsForClass(className) {
    const rows = await all(
        `SELECT * FROM agenda_events
         WHERE scopeType = 'global'
            OR (scopeType = 'class' AND scopeValue = ?)
         ORDER BY dateStart ASC, id ASC`,
        [className]
    );

    return rows.map(eventToPronote);
}

async function getAgendaEventsForTeacher(username) {
    const rows = await all(
        `SELECT * FROM agenda_events
         WHERE scopeType = 'global'
            OR (scopeType = 'teacher' AND scopeValue = ?)
         ORDER BY dateStart ASC, id ASC`,
        [username]
    );

    return rows.map(eventToPronote);
}

async function getCoursesForClass(className) {
    const rows = await all(
        `SELECT * FROM courses
         WHERE className = ?
         ORDER BY date ASC, place ASC, id ASC`,
        [className]
    );

    return rows.map(courseToPronote);
}

async function getCoursesForTeacher(username) {
    const rows = await all(
        `SELECT * FROM courses
         WHERE teacherUsername = ?
         ORDER BY date ASC, place ASC, id ASC`,
        [username]
    );

    return rows.map(courseToPronote);
}

module.exports = {
    getAgendaEventsForClass,
    getAgendaEventsForTeacher,
    getCoursesForClass,
    getCoursesForTeacher
};

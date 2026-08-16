const sqlite3 = require('sqlite3').verbose();

/**
 * Cahier de textes : ce que le professeur ecrit APRES une seance, pour dire ce qui a ete
 * traite en classe.
 *
 * A ne pas confondre avec `homeworks`, qui est le travail A FAIRE. PRONOTE sert les deux par
 * la meme fonction `PageCahierDeTexte`, distinguees par l'onglet : 88 rend
 * `ListeTravauxAFaire`, 89 rend `ListeCahierDeTextes`. C'est cette seconde liste que ce
 * module alimente.
 *
 * Une seance peut porter plusieurs contenus (« cours » puis « exercices ») : `place` les
 * rattache au creneau de l'emploi du temps, et `slot` les ordonne a l'interieur.
 */

const db = new sqlite3.Database('database.db', (err) => {
    if (err) {
        console.error(err.message);
    } else {
        console.log('Connected to the database (course contents initialization).');
    }
});

db.serialize(() => {
    db.run(`CREATE TABLE IF NOT EXISTS course_contents (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        className TEXT NOT NULL,
        subject TEXT NOT NULL,
        teacherLabel TEXT NOT NULL,
        date TEXT NOT NULL,
        place INTEGER NOT NULL DEFAULT 0,
        slot INTEGER NOT NULL DEFAULT 0,
        title TEXT NOT NULL,
        description TEXT NOT NULL,
        attachments TEXT
    )`, (err) => {
        if (err) {
            console.error(err.message);
        } else {
            console.log('Table "course_contents" initialized.');
        }
    });
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

/**
 * Les contenus d'une classe, du plus recent au plus ancien.
 *
 * La jointure sur `courses` n'est pas cosmetique. Dans un vrai PRONOTE, une entree de
 * `ListeCahierDeTextes` porte `cours.V.N`, l'identifiant de la SEANCE de l'emploi du temps
 * a laquelle elle se rattache — c'est par la que `Lesson.content` de pronotepy retrouve le
 * contenu d'un cours. Sans cet identifiant reel, un client conforme ne pourrait jamais
 * apparier les deux. `courseId` est donc l'id de la ligne `courses` correspondante, ou
 * `null` quand le contenu n'a pas de seance (cas que l'appelant traite a part).
 *
 * `date` est stockee en `JJ/MM/AAAA`, qui ne se trie pas lexicalement : le tri se fait donc
 * en SQL sur les trois morceaux remis dans l'ordre annee/mois/jour.
 */
async function getCourseContentsForClass(className) {
    return all(
        `SELECT content.*, course.id AS courseId
         FROM course_contents AS content
         LEFT JOIN courses AS course
                ON course.className = content.className
               AND course.date = content.date
               AND course.place = content.place
               AND course.subject = content.subject
         WHERE content.className = ?
         ORDER BY substr(content.date, 7, 4) DESC,
                  substr(content.date, 4, 2) DESC,
                  substr(content.date, 1, 2) DESC,
                  content.place DESC, content.slot ASC, content.id ASC`,
        [className]
    );
}

module.exports = {
    getCourseContentsForClass
};

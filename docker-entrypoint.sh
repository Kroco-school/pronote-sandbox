#!/bin/sh
set -eu

DB_PATH="${FOSSNOTE_DATABASE_PATH:-/data/database.db}"
DB_DIR="$(dirname "$DB_PATH")"

mkdir -p "$DB_DIR"
touch "$DB_PATH"
ln -sf "$DB_PATH" /app/database.db

if [ "${FOSSNOTE_SEED_ON_START:-1}" = "1" ]; then
  # Le seed est best-effort : une base déjà peuplée ou momentanément verrouillée ne doit pas
  # empêcher le serveur de démarrer (sinon `set -e` fait sortir l'entrypoint → le conteneur
  # meurt → boucle de redémarrage « s'arrête tout seul »).
  npm run seed || echo "[fossnote] seed échoué, démarrage du serveur quand même"
fi

exec "$@"

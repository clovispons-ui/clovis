#!/bin/sh
set -e

cd "$(dirname "$0")"

if [ ! -d node_modules ]; then
  npm install
fi

npm test
npm run seed:check:imposteur

echo
echo "→ http://localhost:${PORT:-4173}"
exec npm start
#!/bin/zsh
set -e
cd "$(dirname "$0")"

if ! command -v node >/dev/null 2>&1; then
  echo "É necessário instalar Node.js 22.13 ou mais recente."
  echo "Consulta https://nodejs.org/ e volta a abrir este ficheiro."
  read -r "?Carrega em Enter para fechar."
  exit 1
fi

if [ ! -d node_modules ]; then
  echo "A instalar dependências…"
  npm install
fi

echo "A preparar o Foco…"
npm run build
(sleep 1; open http://127.0.0.1:4188) &
npm start

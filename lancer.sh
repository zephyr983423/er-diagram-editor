#!/bin/bash

# Script de lancement automatique de l'éditeur E-A
# Détecte et utilise le serveur HTTP disponible

PORT=8000
URL="http://localhost:$PORT/index.html"

echo "🚀 Lancement de l'éditeur E-A..."
echo ""

# Fonction pour ouvrir le navigateur
open_browser() {
    sleep 2
    if command -v open &> /dev/null; then
        open "$URL"  # macOS
    elif command -v xdg-open &> /dev/null; then
        xdg-open "$URL"  # Linux
    elif command -v start &> /dev/null; then
        start "$URL"  # Windows Git Bash
    else
        echo "👉 Ouvrez manuellement: $URL"
    fi
}

# Tester Node.js / npx
if command -v npx &> /dev/null; then
    echo "✅ Node.js détecté - Utilisation de http-server"
    open_browser &
    npx http-server -p $PORT -c-1
    exit 0
fi

# Tester PHP
if command -v php &> /dev/null; then
    echo "✅ PHP détecté - Utilisation du serveur intégré"
    open_browser &
    php -S localhost:$PORT
    exit 0
fi

# Tester Python 3
if command -v python3 &> /dev/null; then
    echo "✅ Python 3 détecté - Utilisation du serveur HTTP"
    open_browser &
    python3 -m http.server $PORT
    exit 0
fi

# Tester Python 2
if command -v python &> /dev/null; then
    echo "✅ Python 2 détecté - Utilisation du serveur HTTP"
    open_browser &
    python -m SimpleHTTPServer $PORT
    exit 0
fi

# Aucun serveur trouvé
echo "❌ Aucun serveur HTTP trouvé!"
echo ""
echo "Veuillez installer l'un des suivants:"
echo "  • Node.js: https://nodejs.org/"
echo "  • PHP: https://www.php.net/downloads"
echo "  • Python: https://www.python.org/downloads/"
echo ""
echo "Ou utilisez l'extension 'Live Server' dans VS Code (recommandé)"
exit 1

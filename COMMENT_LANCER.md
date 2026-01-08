# Comment Lancer l'Éditeur E-A

## ⚠️ Important : Serveur HTTP requis

Les navigateurs modernes bloquent les modules ES6 (`import/export`) depuis `file://` pour des raisons de sécurité (CORS).
Vous **devez** utiliser un serveur HTTP local. Plusieurs options **sans Python** :

## Option 1 : Extension VS Code (Recommandé) ✅

Si vous utilisez **VS Code** :
1. Installer l'extension **"Live Server"** (Ritwick Dey)
2. Ouvrir le dossier du projet dans VS Code
3. Clic droit sur `index.html` → "Open with Live Server"
4. Le navigateur s'ouvre automatiquement sur http://localhost:5500

## Option 2 : Node.js (Si installé)

Si vous avez **Node.js** :
```bash
npx http-server -p 8000
# Puis ouvrir http://localhost:8000
```

Ou installer globalement :
```bash
npm install -g http-server
http-server -p 8000
```

## Option 3 : PHP (Si installé)

Si vous avez **PHP** :
```bash
php -S localhost:8000
# Puis ouvrir http://localhost:8000
```

## Option 4 : Python (En dernier recours)

**Python 3** (si déjà installé) :
```bash
python3 -m http.server 8000
# Puis ouvrir http://localhost:8000
```

**Python 2** :
```bash
python -m SimpleHTTPServer 8000
```

## Option 5 : Navigateur Firefox (Mode développement)

Firefox autorise parfois les modules locaux :
1. Ouvrir `about:config`
2. Chercher `security.fileuri.strict_origin_policy`
3. Le mettre à `false`
4. Ouvrir directement `index.html`

**⚠️ Attention** : Ceci réduit la sécurité, à utiliser uniquement en développement.

## ✅ Solution Recommandée

**VS Code + Live Server** est la solution la plus simple et la plus pratique pour le développement.
Pas besoin de ligne de commande, rechargement automatique à chaque modification.

## Pourquoi pas un fichier HTML unique ?

Pour revenir à un fichier unique (sans modules), il faudrait :
- Fusionner les 8 fichiers JS en un seul
- Perdre la modularité
- Rendre le code difficile à maintenir

Si vous le souhaitez vraiment, je peux créer une version "bundlée" en un seul fichier.

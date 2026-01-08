# Éditeur de Diagrammes Entité-Association (Merise/Chen)

Éditeur visuel de diagrammes E-A suivant la notation Merise/Chen, développé en JavaScript pur avec Konva.js.

## 🎯 Fonctionnalités principales

### Modélisation Entité-Association style Merise
- **Entités** (rectangles bleus) : objets métier avec attributs
- **Associations** (ellipses vertes) : liens entre entités, peuvent avoir leurs propres attributs
- **Connexions** : relient associations et entités avec cardinalités (0,1 / 1,1 / 0,n / 1,n)
- **Support des associations n-aires** : une association peut relier 2+ entités

### Édition complète des attributs via modale
- ✅ Ajouter, modifier, supprimer des attributs
- ✅ Définir : **PK** (clé primaire), **UQ** (unique), **NULL**, **DEFAULT**
- ✅ Choisir le type SQL via liste déroulante (INTEGER, VARCHAR, ENUM, etc.)
- ✅ Pour ENUM/SET : gérer les valeurs possibles avec tags/chips éditables
- ✅ Réordonner les attributs avec boutons ↑↓
- ✅ Validation : au moins 1 PK (optionnel avec warning), pas de doublons
- ✅ **Command Pattern** : un seul Command créé au clic "Confirmer", annuler ne modifie pas l'historique

### Command Pattern pour Undo/Redo
Toutes les actions passent par des Commands :
- `CreateEntityCommand` / `UpdateEntityCommand` / `DeleteEntityCommand`
- `CreateAssociationCommand` / `UpdateAssociationCommand` / `DeleteAssociationCommand`
- `CreateConnectionCommand` / `DeleteConnectionCommand`
- `MoveNodeCommand` (pour déplacements entités/associations)

**Undo/Redo** : Ctrl+Z / Ctrl+Y (historique de 50 actions)

### Rendu Canvas (Konva.js)
- **Entités** : rectangles avec header bleu + liste d'attributs (PK 🔑, UQ, NOT NULL)
- **Associations** : ellipses vertes (ratio 80x50)
- **Connexions** :
  - Ancrage automatique aux bords (ellipse/rectangle)
  - Cardinalités affichées près des entités
  - Étiquettes optionnelles sur les liens
  - Mise à jour temps réel lors des déplacements

### Navigation & Interaction
- **Pan** : cliquer-glisser sur zone vide
- **Zoom** : molette de souris (centré sur curseur) + boutons +/−
- **Grille** : affichage toggle + snap optionnel
- **Sélection multiple** : Shift+clic
- **Copier/Coller** : Ctrl+C / Ctrl+V
- **Menu contextuel** : clic droit (ajouter, dupliquer, aligner, supprimer)

### Sauvegarde
- **Automatique** : localStorage du navigateur
- **Export/Import JSON** : format clair avec `entities`, `associations`, `connections`

## 🚀 Installation & Lancement

**⚠️ Important**: À cause des modules ES6, vous devez utiliser un serveur HTTP local (pas de `file://`).

### Option 1 : Script automatique (Le plus simple) ✅

**Mac/Linux** :
```bash
./lancer.sh
```

**Windows** :
```cmd
lancer.bat
```

Le script détecte automatiquement le serveur disponible (Node.js, PHP, ou Python) et ouvre le navigateur.

### Option 2 : VS Code + Live Server (Recommandé pour dev)
1. Installer l'extension **"Live Server"** dans VS Code
2. Ouvrir le dossier du projet
3. Clic droit sur `index.html` → "Open with Live Server"

### Option 2 : Serveur local
```bash
# Python 3
python3 -m http.server 8000

# Python 2
python -m SimpleHTTPServer 8000

# Node.js (avec http-server)
npx http-server

# Puis ouvrir : http://localhost:8000
```

## 📖 Mode d'emploi

### Créer un diagramme

1. **Créer une entité**
   - Cliquer sur "Entité" (ou touche `E`)
   - Cliquer sur le canvas à l'emplacement souhaité
   - Double-cliquer sur l'entité pour éditer

2. **Créer une association**
   - Cliquer sur "Association" (ou touche `A`)
   - Cliquer sur le canvas
   - Double-cliquer pour éditer (nom, attributs)

3. **Créer une connexion**
   - Cliquer sur "Connexion" (ou touche `C`)
   - Cliquer sur une association
   - Cliquer sur une entité
   - Les cardinalités sont éditables via le panneau de droite ou la modale

### Éditer les attributs (modale complète)

Double-cliquer sur une entité/association ouvre la modale d'édition :

**Champs disponibles :**
- **Nom** : nom de l'attribut
- **Type** : sélection parmi types SQL standards
- **PK** : cocher si clé primaire
- **UQ** : cocher si unique
- **NULL** : cocher si nullable
- **DEFAULT** : valeur par défaut
- **ENUM/SET** : si type = ENUM/SET, liste de valeurs éditables

**Actions :**
- ↑↓ : réordonner les attributs
- 🗑 : supprimer un attribut
- **+ Ajouter un attribut** : ajouter une nouvelle ligne
- **Confirmer** : valide et crée 1 seul Command (Undo en une fois)
- **Annuler** : restaure l'état d'origine (pas d'historique)

### Raccourcis clavier

| Touche | Action |
|--------|--------|
| `V` | Mode Sélection |
| `E` | Mode Entité |
| `A` | Mode Association |
| `C` | Mode Connexion |
| `Delete` | Supprimer sélection |
| `Ctrl+Z` | Annuler |
| `Ctrl+Y` ou `Ctrl+Shift+Z` | Rétablir |
| `Ctrl+C` | Copier |
| `Ctrl+V` | Coller |
| `Shift+Clic` | Sélection multiple |
| `Échap` | Annuler action / Désélectionner |

### Menu contextuel (clic droit)

- Ajouter une entité / association
- Dupliquer la sélection
- Supprimer
- Aligner (gauche, droite, haut, bas) pour multi-sélection

## 📊 Format de données

### Structure JSON

```json
{
  "entities": [
    {
      "id": "entity_xxx",
      "name": "User",
      "x": 100,
      "y": 100,
      "type": "entity",
      "attributes": [
        {
          "id": "attr_xxx",
          "name": "id",
          "type": "INTEGER",
          "isPK": true,
          "isUQ": false,
          "isNull": false,
          "defaultValue": "",
          "enumValues": []
        }
      ]
    }
  ],
  "associations": [
    {
      "id": "assoc_xxx",
      "name": "Possède",
      "x": 300,
      "y": 200,
      "type": "association",
      "attributes": [
        {
          "id": "attr_yyy",
          "name": "date_acquisition",
          "type": "DATE",
          "isPK": false,
          "isUQ": false,
          "isNull": true,
          "defaultValue": "CURRENT_DATE",
          "enumValues": []
        }
      ]
    }
  ],
  "connections": [
    {
      "id": "conn_xxx",
      "associationId": "assoc_xxx",
      "entityId": "entity_xxx",
      "cardinality": "1,n",
      "label": "propriétaire"
    }
  ]
}
```

### Types SQL supportés

INTEGER, BIGINT, SMALLINT, TINYINT, VARCHAR, CHAR, TEXT, LONGTEXT, DECIMAL, FLOAT, DOUBLE, DATE, DATETIME, TIMESTAMP, TIME, BOOLEAN, BIT, ENUM, SET, JSON, BLOB

## 🏗️ Architecture technique

### Structure modulaire (ES6 Modules)

Le projet est organisé en modules distincts pour une meilleure maintenabilité :

```
/Users/zephyrsui/Downloads/er/
├── index.html              # Structure HTML avec modales
├── style.css               # Styles CSS (variables, composants)
├── README.md               # Documentation
└── js/
    ├── config.js           # Configuration et constantes
    ├── utils.js            # Fonctions utilitaires
    ├── models.js           # Classes de données
    ├── commands.js         # Pattern Command
    ├── state.js            # Gestion de l'état
    ├── renderer.js         # Rendu Konva.js
    ├── modals.js           # Gestion des modales
    └── app.js              # Contrôleur principal
```

### Détail des modules

#### config.js
Centralise toutes les constantes :
- Dimensions (grille, entités, associations)
- Couleurs et styles
- Types SQL disponibles
- Options de cardinalité
- Offsets pour positionnement des labels

#### utils.js
Fonctions utilitaires réutilisables :
- `generateId()` : génération d'identifiants uniques
- `formatAttribute()` : formatage d'affichage
- `calculateAngle()` : calculs géométriques
- `getPerpendicularOffset()` : positionnement intelligent des labels

#### models.js
Classes du domaine :
- `Attribute` : attributs avec type, contraintes, ENUM
- `Entity` : entités avec attributs
- `Association` : associations avec attributs
- `Connection` : connexions avec cardinalité

#### commands.js
Implémentation du Pattern Command :
- Toutes les opérations CRUD pour entities/associations/connections
- Chaque commande a `execute()` et `undo()`

#### state.js
Classe `DiagramState` :
- Gestion des collections (entities, associations, connections)
- Historique de commandes (max 50)
- Sélection et presse-papiers
- Sérialisation JSON
- Sauvegarde automatique localStorage

#### renderer.js
Classe `CanvasRenderer` :
- Création des formes Konva
- Gestion du drag & drop
- **Affichage des attributs d'association** (rectangles arrondis dynamiques)
- **Positionnement intelligent des labels** (offsets perpendiculaires)
- Calcul des points d'ancrage

#### modals.js
Classe `ModalManager` :
- Modales d'édition complètes
- Éditeur d'attributs avancé
- Validation des données
- Mode transactionnel (Cancel/Confirm)

#### app.js
Contrôleur principal `ERDiagramApp` :
- Initialisation de Konva
- Coordination des modules
- Gestion des événements
- Raccourcis clavier
- Import/Export

### Technologies
- **Konva.js** (via CDN) : rendu canvas et gestion des interactions
- **JavaScript ES6+** : modules, classes, async/await
- **CSS3** : variables CSS, flexbox, grid
- **LocalStorage API** : sauvegarde automatique

### Choix de Konva.js
- API intuitive pour formes complexes
- Gestion native du drag & drop
- Système de layers performant
- Events riches (click, dblclick, dragmove, contextmenu)
- Calculs géométriques facilitent ancrage aux bords

### Patterns utilisés
- **ES6 Modules** : séparation des responsabilités
- **Command Pattern** : toutes les actions sont des Commands (execute/undo)
- **State Management** : classe `DiagramState` centralisée
- **Observer Pattern** : listeners d'événements Konva
- **Factory Pattern** : création d'entités/associations via constructeurs

## 🎨 Personnalisation

Les couleurs et configurations sont centralisées dans `js/config.js` :

```javascript
export const CONFIG = {
    GRID_SIZE: 20,
    ENTITY_WIDTH: 220,
    ASSOCIATION_MIN_WIDTH: 160,
    ASSOCIATION_MIN_HEIGHT: 100,
    ASSOCIATION_PADDING: 12,
    ASSOCIATION_ATTRIBUTE_HEIGHT: 24,
    CARDINALITY_OFFSET: 35,    // Distance depuis le nœud
    LABEL_OFFSET: 15,           // Offset perpendiculaire
    COLORS: {
        entity: '#ffffff',
        entityStroke: '#2563eb',
        association: '#d1fae5',
        associationStroke: '#10b981',
        connection: '#64748b',
        // ...
    },
    SQL_TYPES: [...],
    CARDINALITY_OPTIONS: [
        { value: '0,1', label: '0,1 (Zéro ou un)' },
        { value: '1,1', label: '1,1 (Exactement un)' },
        { value: '0,n', label: '0,n (Zéro ou plusieurs)' },
        { value: '1,n', label: '1,n (Un ou plusieurs)' }
    ]
};
```

Modifiez simplement `js/config.js` pour ajuster l'apparence et le comportement.

## ✨ Nouvelles fonctionnalités (v2.0)

### Modularisation complète (ES6 Modules)
- Code divisé en 8 modules distincts pour meilleure maintenabilité
- Séparation claire des responsabilités
- Plus facile à étendre et personnaliser

### Affichage des attributs d'association
- Les associations affichent maintenant leurs attributs directement sur le diagramme
- Taille dynamique selon le nombre d'attributs
- Forme en rectangle arrondi (au lieu d'ellipse) pour mieux afficher les attributs

### Positionnement intelligent des labels
- **Cardinalités** : positionnées avec offset perpendiculaire pour éviter les chevauchements
- **Étiquettes de connexion** : placées au milieu du lien avec offset intelligent
- **Recalcul automatique** : lors du déplacement des éléments

## 🐛 Limitations connues

- Le routage des connexions est simple (ligne droite), pas d'évitement avancé
- Les cardinalités sont textuelles (pas de symboles crow's foot graphiques)
- Pas de validation de cohérence du modèle (cardinalités incompatibles, etc.)
- Export uniquement en JSON (pas de PNG/SVG/SQL)
- Zoom et pan non implémentés (prévus pour v2.1)

## 📝 Licence

Code libre, pas de licence spécifique. Utilisez et modifiez comme vous voulez.

## 🙏 Crédits

- **Konva.js** : bibliothèque canvas HTML5
- **Notation Merise/Chen** : méthodologie de modélisation conceptuelle de données

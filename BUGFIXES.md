# Corrections des Bugs - Éditeur E-A

## Problèmes Identifiés et Corrigés

### 1. Double Initialisation du Stage Konva ❌→✅
**Problème:** `app.js` et `renderer.js` créaient tous les deux un stage Konva, causant des conflits.

**Solution:**
- Supprimé `initializeCanvas()` dans `app.js`
- `app.js` récupère maintenant le stage depuis `renderer.stage`
- Un seul stage créé dans `CanvasRenderer`

```javascript
// AVANT (app.js)
this.initializeCanvas();
this.renderer = new CanvasRenderer(this.stage, this.state);

// APRÈS (app.js)
this.renderer = new CanvasRenderer('canvas-container', this.state);
this.stage = this.renderer.stage;
```

### 2. Gestionnaires d'Événements en Conflit ❌→✅
**Problème:** `renderer.js` et `app.js` géraient tous les deux les clics sur le stage.

**Solution:**
- `renderer.js` gère uniquement le zoom (wheel)
- `app.js` gère tous les clics (création, sélection, outils)
- Séparation claire des responsabilités

### 3. Manque d'Attributs d'Identification sur les Formes ❌→✅
**Problème:** Les groupes Konva n'avaient pas d'attributs pour les identifier.

**Solution:**
- Ajout de `itemType` et `itemId` sur tous les groupes
- Permet à `app.js` de savoir quel élément a été cliqué

```javascript
const group = new Konva.Group({
    x: entity.x,
    y: entity.y,
    draggable: true,
    id: entity.id,
    name: 'entity',
    itemType: 'entity',    // NOUVEAU
    itemId: entity.id      // NOUVEAU
});
```

### 4. Outil Connexion Non Fonctionnel ❌→✅
**Problème:** `handleConnectionTool` utilisait des attributs qui n'existaient pas.

**Solution:**
- Parcours de l'arbre Konva pour trouver le groupe parent
- Utilisation des nouveaux attributs `itemType` et `itemId`
- Messages console pour feedback utilisateur

```javascript
handleConnectionTool(e) {
    const target = e.target;
    let clickedGroup = target;
    while (clickedGroup && clickedGroup.getType() !== 'Group') {
        clickedGroup = clickedGroup.getParent();
    }
    // Puis utilisation de clickedGroup.attrs.itemType
}
```

### 5. Clics sur Entités/Associations Interfèrent avec l'Outil Connexion ❌→✅
**Problème:** Les gestionnaires de clic dans `renderer.js` capturaient tous les clics.

**Solution:**
- Vérification de `window.app.currentTool` avant de gérer les clics
- Si l'outil connexion est actif, laisser `app.js` gérer

```javascript
group.on('click', (e) => {
    if (window.app && window.app.currentTool === 'connection') {
        return; // Laisser app.js gérer
    }
    // Sinon, gérer la sélection normalement
});
```

### 6. Calcul de Position Incorrect pour la Création ❌→✅
**Problème:** Les positions des éléments créés ne tenaient pas compte du zoom/pan.

**Solution:**
- Ajout de `getRelativePointerPosition()` qui transforme les coordonnées
- Utilise la transformation inverse du stage

```javascript
getRelativePointerPosition() {
    const pos = this.stage.getPointerPosition();
    const transform = this.stage.getAbsoluteTransform().copy().invert();
    return transform.point(pos);
}
```

### 7. Stage Draggable Bloquait les Clics ❌→✅
**Problème:** `draggable: true` sur le stage interceptait certains clics.

**Solution:**
- Stage mis en `draggable: false`
- Pan/zoom géré explicitement par événements wheel et drag

### 8. Références Modales Incorrectes ❌→✅
**Problème:** `app.js` appelait `this.openEntityModal()` mais la méthode était dans `modalManager`.

**Solution:**
- Utilisation correcte de `this.modalManager.openEntityModal()`
- Même correction pour les associations

### 9. Menu Contextuel Non Fonctionnel ❌→✅
**Problème:** Menu contextuel utilisait des attributs inexistants.

**Solution:**
- Même logique de parcours d'arbre que l'outil connexion
- Trouve le groupe parent et utilise ses attributs

## Tests Recommandés

1. ✅ **Créer une entité** : Cliquer sur "Entité" puis sur le canvas
2. ✅ **Créer une association** : Cliquer sur "Association" puis sur le canvas
3. ✅ **Créer une connexion** :
   - Cliquer sur "Connexion"
   - Cliquer sur une association
   - Cliquer sur une entité
4. ✅ **Sélectionner** : Cliquer sur une entité/association en mode sélection
5. ✅ **Éditer** : Double-cliquer sur une entité/association
6. ✅ **Déplacer** : Drag & drop d'une entité/association
7. ✅ **Menu contextuel** : Clic droit sur une entité/association
8. ✅ **Undo/Redo** : Ctrl+Z / Ctrl+Y après création/modification

## Fichiers Modifiés

- ✅ `/js/app.js` - Contrôleur principal
- ✅ `/js/renderer.js` - Rendu canvas
- ✅ `/js/config.js` - Configuration (déjà correct)
- ✅ `/index.html` - Structure HTML (déjà correct)
- ✅ `/style.css` - Styles (déjà correct)

## État Actuel

🟢 **Toutes les corrections sont appliquées**
🟢 **Code prêt pour les tests**
🟢 **Architecture modulaire préservée**

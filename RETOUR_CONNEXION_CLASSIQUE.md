# Retour au Comportement Classique pour les Connexions

## ✅ Modification Effectuée

Le système de création de connexion en 2 clics a été **supprimé** et le comportement **original** a été restauré.

---

## 🔄 Comportement Actuel (Restauré)

### Pour Créer une Connexion

**Méthode UNIQUE** : Utiliser l'outil "Connexion"

1. **Cliquer sur le bouton "Connexion"** dans la barre d'outils à gauche
2. **Cliquer sur une association**
3. **Cliquer sur une entité**
4. La connexion est créée

→ **3 clics** requis (1 pour l'outil + 2 pour les éléments)

### Comportement des Clics Simple

- **Clic sur entité** : Sélectionne l'entité (aucune connexion)
- **Clic sur association** : Sélectionne l'association (aucune connexion)
- **Double-clic sur entité** : Ouvre la modal d'édition de l'entité
- **Double-clic sur association** : Ouvre la modal d'édition de l'association

---

## 📝 Modifications Techniques

### Fichier: `js/renderer.js`

**Imports nettoyés** :
```javascript
// AVANT (avec connexion automatique)
import { generateId } from './utils.js';
import { Connection } from './models.js';
import { CreateConnectionCommand } from './commands.js';

// APRÈS (simplifié)
// Ces imports ont été retirés car non utilisés
```

**Fonction `attachEntityEvents()`** :
- ✅ Supprimé : Logique de mémorisation d'entité dans `tempConnection`
- ✅ Supprimé : Logique de création automatique de connexion
- ✅ Restauré : Simple sélection au clic

**Fonction `attachAssociationEvents()`** :
- ✅ Supprimé : Logique de mémorisation d'association dans `tempConnection`
- ✅ Supprimé : Logique de création automatique de connexion
- ✅ Restauré : Simple sélection au clic

---

## 🎯 Workflow de Création de Connexion

### Étape par Étape

```
1. Cliquer sur "⟷ Connexion" (barre d'outils gauche)
   └─> Le curseur devient une croix
   └─> Le bouton "Connexion" est surligné

2. Cliquer sur une association
   └─> Console: "Association sélectionnée, cliquez sur une entité"

3. Cliquer sur une entité
   └─> Console: "Connexion créée"
   └─> La connexion apparaît sur le diagramme
   └─> L'outil revient automatiquement en mode "Sélection"
```

### Pour Créer une Auto-Association

```
1. Cliquer sur "⟷ Connexion"
2. Cliquer sur une association
3. Cliquer sur une entité
4. Cliquer à nouveau sur "⟷ Connexion"
5. Cliquer sur la même association
6. Cliquer sur la même entité
   └─> Deux courbes distinctes apparaissent (auto-association)
```

---

## 💡 Avantages du Comportement Actuel

✅ **Clarté** : L'utilisateur sait exactement quand il crée une connexion (outil actif)
✅ **Contrôle** : Pas de création accidentelle de connexion
✅ **Sélection simple** : Cliquer sur un élément le sélectionne sans effet de bord
✅ **Comportement standard** : Conforme aux éditeurs de diagrammes classiques

---

## 🧪 Test du Comportement

### Test 1 : Sélection Simple

1. Créez une entité et une association
2. Cliquez sur l'entité
   - ✅ L'entité est sélectionnée (bordure rouge)
   - ✅ Aucune connexion n'est créée
3. Cliquez sur l'association
   - ✅ L'association est sélectionnée
   - ✅ Aucune connexion n'est créée

### Test 2 : Création de Connexion

1. Cliquez sur "⟷ Connexion" dans la barre d'outils
2. Cliquez sur une association
3. Cliquez sur une entité
   - ✅ La connexion est créée
   - ✅ L'outil revient en mode "Sélection"

### Test 3 : Double-Clic

1. Double-cliquez sur une entité
   - ✅ La modal d'édition s'ouvre
2. Double-cliquez sur une association
   - ✅ La modal d'édition s'ouvre

---

## 📊 Comparaison

| Fonctionnalité | Version 2 Clics (Supprimée) | Version Actuelle (Restaurée) |
|---|---|---|
| **Clics pour connexion** | 2 | 3 (1 outil + 2 éléments) |
| **Clarté de l'intention** | Ambiguë | Claire |
| **Sélection simple** | Mémorise pour connexion | Sélectionne seulement |
| **Contrôle utilisateur** | Moyen | Total |
| **Risque d'erreur** | Élevé | Faible |

---

## ✨ État Actuel du Projet

### Fonctionnalités Actives

✅ Création d'entités et associations
✅ Création de connexions via l'outil "Connexion"
✅ Auto-associations avec courbes distinctes
✅ Cardinalités et remarques au milieu des courbes
✅ Distances uniformisées (15px cardinalités, 25px remarques)
✅ Cardinalités et remarques sur côtés opposés
✅ Double-clic pour éditer entités/associations
✅ Drag & drop pour déplacer les éléments
✅ Formatage avancé des attributs (PK gras/souligné, UQ avec préfixe)
✅ Undo/Redo
✅ Export/Import JSON

### Interface

✅ Panneau gauche : Outils
✅ Zone centrale : Canvas avec grille
✅ Pas de panneau droit (épuré)

---

## 🚀 Lancer l'Application

```bash
./lancer.sh
```

**Workflow recommandé** :
1. Créer des entités avec le bouton "▭ Entité"
2. Créer des associations avec le bouton "⬭ Association"
3. Créer des connexions avec le bouton "⟷ Connexion"
4. Double-cliquer sur les éléments pour les éditer

---

## 📌 Résumé

- ✅ Le système de connexion en 2 clics a été **retiré**
- ✅ Le comportement **classique avec l'outil Connexion** est **restauré**
- ✅ Les clics simples **sélectionnent** seulement (pas de mémorisation)
- ✅ **Seul l'outil "Connexion"** permet de créer des liens
- ✅ Interface **claire et prévisible**

L'application fonctionne maintenant avec le **workflow classique** des éditeurs de diagrammes ! 🎯

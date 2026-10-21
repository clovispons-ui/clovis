# À couvert — jeu de l'imposteur

Jeu de bluff en français, à jouer à plusieurs sur un seul appareil. L'interface utilise React et Vite ; les règles, le stockage local et les données restent dans le navigateur sans backend applicatif.

## Lancer l'application

Prérequis : Node.js 18 ou plus récent et npm. L'application est développée avec React et Vite ; il n'y a pas de backend applicatif, et les données restent dans le navigateur. Les commandes se lancent depuis la racine du dépôt. Si nécessaire, installer d'abord les dépendances avec `npm install`.

```sh
npm start
```

Ouvrir ensuite <http://localhost:4173> et choisir « À couvert » sur la page d'accueil, ou ouvrir directement <http://localhost:4173/imposteur/>. Pour choisir un autre port :

```sh
PORT=8080 npm start
```

Par défaut, le serveur n'écoute que sur `127.0.0.1`. Pour accéder à l'application depuis un autre appareil du même réseau local, il est possible de définir `HOST=0.0.0.0` ; cela expose toutefois l'application aux appareils du réseau et ne chiffre pas le trafic.

Créer et prévisualiser la version de production depuis la racine :

```sh
npm run build
npm run preview
```

## Tester et vérifier les données

Depuis la racine du dépôt :

```sh
npm test
npm run seed:check:imposteur
```

La banque initiale contient **300 mots simples** avec un indice et son niveau de précision, ainsi que **100 paires de mots associés mais plus distincts** (par exemple « chat / souris » ou « train / rail »), réparties dans 10 catégories.

## Règles disponibles

- **Mister White** : les civils reçoivent un mot commun ; les Mister White n'ont aucun mot et peuvent deviner le mot civil après leur élimination.
- **Indice** : l'imposteur reçoit une piste (et son niveau de précision) à la place du mot.
- **Mot proche** : les civils et imposteurs reçoivent deux termes associés. Mister White peut occuper une place du quota d'imposteurs ; cette option n'est disponible qu'à partir de cinq joueurs et d'au moins deux imposteurs.
- Un joueur civil est désigné au hasard pour commencer la discussion ; il n'y a pas de tour de parole affiché. Le groupe touche ensuite directement le nom du joueur à éliminer.
- La discussion est libre, sans compte à rebours. Le groupe passe au choix de la personne à éliminer quand il est prêt.
- Les imposteurs gagnent dès qu'ils sont aussi nombreux que les civils encore actifs. Pour éviter qu'une partie ne soit déjà gagnée au premier écran, leur nombre est limité à moins de la moitié des joueurs (arrondi vers le bas).
- En mode Mister White, une mauvaise réponse de dernière chance donne la victoire aux civils. En mode mot proche, Mister White est éliminé après une mauvaise réponse et la partie continue si les conditions de victoire ne sont pas atteintes.

## Protection des secrets

Les rôles et les mots ne sont rendus dans l'interface qu'après le bouton « Révéler ». Le contenu de la révélation est supprimé de l'écran lors du masquage, du changement d'onglet ou de la perte de focus. L'application n'enregistre pas les rôles, les mots distribués ou l'état d'une manche ; seules les données de jeu et l'historique du dernier tirage sont persistés dans IndexedDB.

Comme toute application web dans un navigateur partagé, elle ne peut pas empêcher une personne déterminée d'inspecter la mémoire JavaScript ou les outils développeur. La protection vise à éviter les révélations accidentelles pendant le passage de l'appareil.

## Stockage et historique

Au premier chargement, `data/seed.json` est importé dans IndexedDB. Les catégories, mots, paires et historique sont locaux au navigateur. L'application évite de rejouer immédiatement le même mot ou la même paire pour la même sélection de catégories, sauf si le pool ne contient qu'un contenu. Effacer les données du site efface aussi l'historique.

## Structure

```text
imposteur/
├── index.html
├── styles.css
├── data/seed.json
├── scripts/validate-seed.mjs
├── src/
│   ├── config.js
│   ├── database.js
│   ├── game.js
│   ├── main.jsx
│   ├── repository.js
│   └── ...
└── tests/
    ├── game.test.mjs
    └── seed.test.mjs
```

Les éléments partagés avec les autres mini-jeux viennent de `common/` à la racine du dépôt : styles de base et de formulaires (`common/styles/`), chronomètre (`common/src/timer.js`), promesses IndexedDB (`common/src/indexeddb.js`) et normalisation des pseudos (`common/src/players.js`).

- `src/game.js` contient les fonctions de jeu indépendantes de l'interface, notamment le choix d'une personne civile pour commencer et l'élimination directe.
- `src/database.js` crée les magasins IndexedDB et importe le seed.
- `src/repository.js` filtre et tire les mots/paires en consultant l'historique.
- `src/main.jsx` contient l'interface React et relie les écrans aux règles.
- `styles.css` applique le thème clair/sombre et les dispositions adaptées au téléphone.
- `scripts/validate-seed.mjs` contrôle les quantités et références du fichier seed.

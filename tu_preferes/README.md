# Tu préfères

Jeu de dilemmes à jouer à plusieurs sur un seul appareil : un dilemme s'affiche, chacun choisit son camp et le débat commence. Répondre « aucun » ou « les deux » est interdit. L'interface utilise React et Vite ; il n'y a aucun backend, et seules les données de jeu restent dans le navigateur.

## Lancer l'application

Prérequis : Node.js 18 ou plus récent et npm. Les commandes se lancent depuis la racine du dépôt. Si nécessaire, installer d'abord les dépendances avec `npm install`.

```sh
npm start
```

Ouvrir <http://localhost:4173/tu_preferes/>. Pour choisir un autre port :

```sh
PORT=8080 npm start
```

Par défaut, le serveur n'écoute que sur `127.0.0.1`. Pour accéder à l'application depuis un autre appareil du même réseau local, il est possible de définir `HOST=0.0.0.0` ; cela expose toutefois l'application aux appareils du réseau et ne chiffre pas le trafic.

## Modes de jeu

- **Soft** : des dilemmes classiques, pour tous les publics (absurde, quotidien, voyage, nourriture, super-pouvoirs, vie sociale, technologie, nature et animaux).
- **Hot** : des dilemmes plus provocateurs, sur la vie intime, les soirées, les drogues et la délinquance. Le mode porte un avertissement **18+** et suppose un groupe exclusivement adulte et consentant.

Le mode se choisit en début de partie et peut être changé à tout moment. Les dilemmes s'enchaînent jusqu'à ce que le groupe décide d'arrêter : il n'y a ni score, ni vote, ni écran de fin.

## Règles

1. Le groupe lit le dilemme à voix haute.
2. Chacun choisit l'option A ou B — il est interdit de répondre « aucun » ou « les deux ».
3. Chacun défend son choix ; le débat dure autant que le groupe le souhaite.
4. Un bouton tire le dilemme suivant, en évitant de répéter immédiatement le précédent.

Un **chrono de débat optionnel** peut être activé avant de lancer la partie : il couvre chaque dilemme, et à la sonnerie le groupe peut continuer le débat ou passer au dilemme suivant. Le passage n'est jamais automatique.

Aucune réponse ni préférence n'est enregistrée : seul l'historique de tirage est conservé localement dans IndexedDB pour éviter les répétitions immédiates au sein d'un même mode.

## Tester et vérifier les données

Depuis la racine du dépôt :

```sh
npm test
node tu_preferes/scripts/validate-seed.mjs
```

La banque initiale contient **100 dilemmes soft** répartis sur 8 sous-thèmes et **50 dilemmes hot** répartis sur 6 sous-thèmes (Vie intime, Situations osées, Soirées, Drogues, Illégal, Aveux).

## Structure

```text
tu_preferes/
├── index.html
├── styles.css
├── data/seed.json
├── scripts/validate-seed.mjs
├── src/
│   ├── config.js        # modes Soft/Hot, validation de la sélection
│   ├── database.js      # magasins IndexedDB et import du seed
│   ├── game.js          # tirage aléatoire sécurisé et sélection des dilemmes
│   ├── repository.js    # tirage en évitant la répétition immédiate
│   └── main.jsx         # interface React : choix du mode, jeu, erreurs
└── tests/
    ├── game.test.mjs
    └── seed.test.mjs
```

Les éléments partagés avec les autres mini-jeux viennent de `common/` à la racine du dépôt : styles de base et de formulaires (`common/styles/base.css`, `common/styles/forms.css`), chronomètre (`common/src/timer.js`) et promesses IndexedDB (`common/src/indexeddb.js`).

- `src/config.js` définit les modes et la validation de la sélection.
- `src/database.js` crée les magasins IndexedDB (`categories`, `dilemmas`, `playedDilemmas`, `meta`) et importe le seed.
- `src/repository.js` tire un dilemme du mode choisi en consultant l'historique.
- `src/main.jsx` relie les écrans (choix du mode, dilemme, erreur) à la logique de tirage.
- `scripts/validate-seed.mjs` contrôle les quantités, les références et l'unicité des dilemmes du fichier seed.
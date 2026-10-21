# clovis

Une collection de mini-jeux à jouer à plusieurs sur un seul appareil. Chaque mini-jeu vit dans son propre dossier à la racine ; les éléments partagés (design et utilitaires) sont regroupés dans `common/`. Les mini-jeux « À couvert » et « Tu préfères » utilisent React et Vite ; le hub reste une page statique.

## Lancer

Prérequis : Node.js 18 ou plus récent et npm.

Installer les dépendances une première fois :

```sh
npm install
```

```sh
npm start
```

Ouvrir <http://localhost:4173> : la page d'accueil liste les mini-jeux disponibles. Vite sert le hub et l'application React. Pour choisir un autre port :

```sh
PORT=8080 npm start
```

Par défaut, Vite n'écoute que sur `127.0.0.1`. Pour accéder au serveur de développement depuis un autre appareil du réseau local, il est possible de définir `HOST=0.0.0.0` ; cela expose toutefois le serveur de développement aux appareils du réseau.

Créer la version de production et la prévisualiser localement :

```sh
npm run build
npm run preview
```

La compilation génère le hub et le jeu dans `dist/`, prêts à être hébergés comme des fichiers statiques. Aucun backend applicatif ni serveur distant n'est requis.

## Mini-jeux

- [`imposteur/`](./imposteur/README.md) — **À couvert, le jeu de l'imposteur** : un jeu de bluff en français, de 3 à 12 joueurs, quelques minutes par manche.
- [`tu_preferes/`](./tu_preferes/README.md) — **Tu préfères** : des dilemmes soft ou hot (18+) à débattre, sans score ni fin de partie.

## Tester et vérifier

```sh
npm test
npm run seed:check:imposteur
npm run seed:check:tu-preferes
```

`npm test` lance tous les tests de la collection : ceux des modules communs (`common/tests/`) et ceux de chaque mini-jeu (par exemple `imposteur/tests/` ou `tu_preferes/tests/`).

## Structure

```text
.
├── index.html            page d'accueil (hub)
├── vite.config.js        configuration de développement et build
├── package.json          scripts et dépendances
├── common/
│   ├── src/              modules JS partagés (chronomètre, IndexedDB, pseudos)
│   ├── styles/           styles partagés (base, formulaires, hub)
│   └── tests/            tests des modules communs
├── imposteur/            mini-jeu React « À couvert » (voir son README)
│   ├── index.html
│   ├── styles.css
│   ├── data/seed.json
│   ├── scripts/
│   ├── src/
│   │   └── main.jsx      interface et composants React
│   └── tests/
└── tu_preferes/          mini-jeu React « Tu préfères » (voir son README)
    ├── index.html
    ├── styles.css
    ├── data/seed.json
    ├── scripts/
    ├── src/
    │   └── main.jsx      interface et composants React
    └── tests/
```

## Ajouter un mini-jeu

1. Créer un dossier à la racine, nommé en minuscules (par exemple `memory/`), avec `index.html`, ses styles, son code dans `src/`, ses données éventuelles dans `data/` et ses tests dans `tests/`.
2. Lier les styles communs avant ceux du jeu : `../common/styles/base.css`, puis ajouter les styles du jeu.
3. Importer les modules communs nécessaires (par exemple `../../common/src/timer.js`) ; tout nouveau module réutilisable est placé dans `common/src/`.
4. Ajouter une carte pour le jeu dans `index.html` à la racine, et si le jeu a des données à valider, un script `seed:check:<jeu>` dans `package.json`.
5. Ajouter toute nouvelle page HTML à `vite.config.js` si elle doit faire partie du build multi-page.
6. Lancer `npm test` depuis la racine : `node --test` découvre tous les fichiers `*.test.mjs` de la collection.
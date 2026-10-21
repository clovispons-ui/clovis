# clovis

Une collection de mini-jeux à jouer à plusieurs sur un seul appareil. Chaque mini-jeu vit dans son propre dossier à la racine ; les éléments partagés (serveur, design, utilitaires) sont regroupés dans `common/`. Le projet n'utilise que des modules natifs Node.js, HTML, CSS et JavaScript ; aucun paquet npm externe n'est nécessaire.

## Lancer

Prérequis : Node.js 18 ou plus récent.

```sh
npm start
```

Ouvrir <http://localhost:4173> : la page d'accueil liste les mini-jeux disponibles. Pour choisir un autre port :

```sh
PORT=8080 npm start
```

Par défaut, le serveur n'écoute que sur `127.0.0.1`. Pour accéder à l'application depuis un autre appareil du même réseau local, il est possible de définir `HOST=0.0.0.0` ; cela expose toutefois l'application aux appareils du réseau et ne chiffre pas le trafic.

## Mini-jeux

- [`imposteur/`](./imposteur/README.md) — **À couvert, le jeu de l'imposteur** : un jeu de bluff en français, de 3 à 12 joueurs, quelques minutes par manche.

## Tester et vérifier

```sh
npm test
npm run seed:check:imposteur
```

`npm test` lance tous les tests de la collection : ceux des modules communs (`common/tests/`) et ceux de chaque mini-jeu (par exemple `imposteur/tests/`).

## Structure

```text
.
├── index.html            page d'accueil (hub)
├── server.mjs            serveur de fichiers statiques
├── package.json          scripts racine
├── common/
│   ├── src/              modules JS partagés (chronomètre, IndexedDB, pseudos)
│   ├── styles/           styles partagés (base, formulaires, hub)
│   └── tests/            tests des modules communs
└── imposteur/            mini-jeu « À couvert » (voir son README)
    ├── index.html
    ├── styles.css
    ├── data/seed.json
    ├── scripts/
    ├── src/
    └── tests/
```

## Ajouter un mini-jeu

1. Créer un dossier à la racine, nommé en minuscules (par exemple `memory/`), avec `index.html`, ses styles, son code dans `src/`, ses données éventuelles dans `data/` et ses tests dans `tests/`.
2. Lier les styles communs avant ceux du jeu : `../../common/styles/base.css`, puis `../../common/styles/forms.css` si le jeu contient des formulaires.
3. Importer les modules communs nécessaires (par exemple `../../common/src/timer.js`) ; tout nouveau module réutilisable est placé dans `common/src/`.
4. Ajouter une carte pour le jeu dans `index.html` à la racine, et si le jeu a des données à valider, un script `seed:check:<jeu>` dans `package.json`.
5. Lancer `npm test` depuis la racine : `node --test` découvre tous les fichiers `*.test.mjs` de la collection.
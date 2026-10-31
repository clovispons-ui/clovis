# Le Loup-Garou

Mini-jeu de rôles cachés à jouer de 4 à 12 joueurs sur un seul téléphone, avec un maître du jeu extérieur facultatif. Les rôles et la partie restent en mémoire dans le navigateur ; aucun compte ni serveur applicatif n'est nécessaire.

## Lancer

Depuis la racine du dépôt :

```sh
npm start
```

Ouvrir <http://localhost:4173/loup-garou/> ou choisir le jeu depuis le hub. Pour vérifier le projet :

```sh
npm test
npm run build
```

## Déroulement

- Choisir les joueurs, puis ajuster la composition proposée : Villageois, Loups-Garous, Voyante, Sorcière, Chasseur, Petite Fille et Cupidon. Les Loups et les Villageois doivent être représentés, et le nombre de cartes doit correspondre aux joueurs.
- Distribuer les cartes à tour de rôle. Chaque révélation présente une illustration stylisée et explique brièvement l'objectif et le pouvoir du rôle ; l'écran se masque aussi au changement d'onglet ou à la perte de focus. Une fois toutes les cartes vues, chaque joueur peut revoir son rôle en privé avant que le bouton de démarrage lance la nuit et demande à tout le monde de fermer les yeux.
- Choisir entre les consignes parlées par la synthèse vocale du navigateur ou un narrateur extérieur. Le narrateur peut masquer son script ; s'il l'affiche, il suit les étapes, confirme chaque action et dispose d'un récapitulatif privé de nuit. Avec la narration à l'écran, chaque réveil est précédé de 10 secondes de silence ; avec un narrateur humain, il passe à l'étape suivante manuellement, sans compte à rebours.
- Recueillir les actions nocturnes sur le téléphone. Les joueurs concernés prennent l'appareil à tour de rôle, les autres ferment les yeux. Une information destinée à un joueur (Voyante, amoureux) est révélée en grand sur un écran privé. La Petite Fille peut ouvrir les yeux discrètement pendant le réveil des Loups et les observer dans la pièce ; elle n'est pas appelée par l'application.
- Le vote du jour se fait en discussion réelle, à voix haute, hors de l'application. Une fois le groupe d'accord, sélectionnez dans l'application la personne éliminée ; son rôle est alors annoncé avec son nom. Le matin, le rôle de chaque personne éliminée pendant la nuit est également annoncé. Si le groupe ne se met pas d'accord, choisissez « Personne n'est éliminé ».
- Une personne éliminée en tant que Chasseur peut riposter. Les rôles sont révélés à la fin de la partie.

## Règles retenues

- **Loups-Garous** : choisissent une victime par nuit et gagnent quand ils sont au moins aussi nombreux que les autres joueurs vivants.
- **Voyante** : découvre le rôle d'une autre personne vivante chaque nuit.
- **Sorcière** : dispose d'une potion de vie et d'une potion de mort, chacune utilisable une fois dans la partie. Les deux peuvent être utilisées la même nuit.
- **Chasseur** : peut emporter une personne lorsqu'il est éliminé.
- **Petite Fille** : peut ouvrir les yeux discrètement pendant le réveil des Loups pour les observer ; l'application ne la réveille pas et ne lui révèle pas leurs identités.
- **Cupidon** : lie deux personnes lors de la première nuit. La mort de l'une entraîne celle de l'autre. Si les amoureux de camps opposés sont les deux derniers survivants, ils gagnent seuls.
- Les Villageois gagnent lorsque tous les Loups ont été éliminés. Les amoureux mixtes n'ont de victoire spécifique que s'ils sont les deux derniers.

Les règles du Loup-Garou varient selon les éditions ; cette version met en œuvre les variantes listées ci-dessus et ne prétend pas reproduire une édition précise. Les compositions sont généralement plus équilibrées à partir de six joueurs.

## Limites du téléphone partagé

Les actions nocturnes peuvent être saisies sur un appareil partagé, mais l'application ne peut pas empêcher un joueur de regarder par-dessus l'épaule d'un autre, ni de vérifier l'état JavaScript avec les outils développeur. La révélation individuelle et le masquage visent à éviter les découvertes accidentelles. Ne pas quitter l'application en affichant une information secrète.

Le narrateur à l'écran utilise la synthèse vocale native du navigateur si elle est disponible. Les consignes restent visibles en cas d'indisponibilité ou d'absence de voix française.

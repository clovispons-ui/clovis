# Famille en Or

Jeu de plateau oral pour deux équipes, à jouer en présentiel sur un seul écran partagé. Après la composition des équipes, puis entre les manches, un écran prêt-à-jouer affiche le score et un grand bouton Start avant de révéler la question. Pendant la manche, l'écran montre la question et les scores, sans le tableau ; les réponses sont révélées à la fin. Les buzzers sont volontairement très grands pour être utilisés à distance. Pas de Maître du jeu, de vue mobile, de backend ou de WebSocket.

## Règles

- Une partie comporte cinq manches.
- Chaque nouvelle question est précédée d'un écran Start avec les scores ; le bouton révèle la question et lance le duel.
- Au duel initial, une équipe buzze et propose une réponse ; l'autre équipe saisit ensuite directement la sienne, sans rebuzzer. La meilleure réponse trouvée au tableau donne la main ; si aucune équipe ne trouve de réponse, la manche se termine sans point et le récapitulatif révèle toutes les réponses avec les scores et le bouton pour continuer.
- Après le premier buzzer, le tableau masqué reste visible à côté du formulaire de réponse, qui occupe une colonne plus étroite.
- L'équipe en contrôle propose des réponses à l'oral ; son saisisseur les entre sur l'écran. Les accents, la ponctuation et la casse sont ignorés. Seuls les libellés et alias préparés dans la banque sont reconnus.
- Une réponse trouvée révèle sa case et alimente le pot de la manche. Une mauvaise réponse ajoute une croix ; une case déjà trouvée n'ajoute ni point ni croix.
- À la troisième croix, l'équipe adverse a une tentative pour voler. Une réponse reconnue lui attribue la somme des points de tout le tableau, y compris les réponses cachées. Si elle échoue, l'équipe qui jouait garde le pot déjà trouvé.
- Quand toutes les réponses sont trouvées, l'équipe en contrôle reçoit les points trouvés. Après cinq manches, l'équipe avec le meilleur score gagne ; une égalité est déclarée ex æquo.

## Lancer et vérifier

Depuis la racine du dépôt :

```sh
npm start
```

Ouvrir <http://localhost:4173/FamilleEnOr/>. Vérifier la banque et lancer les tests ciblés :

```sh
npm run seed:build:famille-en-or
npm run seed:check:famille-en-or
node --test FamilleEnOr/tests/game.test.mjs
```

## Données et limites

La banque française contient 200 questions adaptées de ProtoQA : 24 questions initiales et 176 questions supplémentaires sélectionnées dans `family_feud_en.json`. La source contient 9 761 questions en anglais ; son indicateur `fiable` signale seulement un total de points plausible, pas une traduction de qualité ou une pertinence française. Les entrées trop spécifiques, ambiguës ou difficiles à adapter ne sont pas importées automatiquement.

Les questions sélectionnées ont été réécrites en français et des alias de réponses ont été ajoutés. Cette adaptation éditoriale reste à tester avec des joueurs en France. Les points viennent de données de source principalement américaine : ils servent de classement pour le jeu, et ne représentent pas les réponses d'un sondage français.

Sources et licence :

- [ProtoQA — questions et réponses Family Feud](https://github.com/iesl/protoqa-data)
- Sources de transcriptions indiquées pour chaque question dans `data/questions.fr.json` : `familyfeudinfo.com` et `familyfeudfriends.arjdesigns.com`
- Licence source : CC-BY-4.0 — Boratko, Li, O'Gorman, Das, Le et McCallum (2020), ProtoQA.

`data/adaptations.fr.json` conserve les 176 adaptations éditoriales. `scripts/build-french-seed.mjs` retrouve les réponses anglaises par identifiant de source, reprend leurs points et régénère `data/questions.fr.json`. Pour ajouter une question, sélectionner et traduire sa question et toutes ses réponses dans le fichier d'adaptations, puis lancer `npm run seed:build:famille-en-or`. Le validateur contrôle la structure, les doublons et les collisions de saisie ; il ne remplace pas une relecture éditoriale.

# Sons et récompenses de points de chaîne

Cette page explique la soundboard et les récompenses de points de chaîne qui jouent des sons, et les deux onglets qui les règlent.

## Les deux mots

- Un son est un fichier audio avec un titre et un volume.
- Une récompense est celle de la chaîne sur Twitch : un titre, un coût, un cooldown. Elle joue le son qu'on lui choisit.
- Un même son peut servir à plusieurs récompenses. Une récompense peut n'avoir aucun son.

## Dans OBS

Les sons se jouent dans une page vide, sans image.

- Source OBS : `http://localhost:4747/sounds`, taille libre, fond transparent.
- Le son sort par Windows. La case « Contrôler l'audio via OBS » reste décochée, et OBS le capte par « Audio PC » ([obs](obs.md)).
- Un seul son joue à la fois. Le serveur donne le son à la page `/sounds` connectée depuis le plus longtemps, qui répond « fini » ou « raté ».
- Un son que la page n'a pas fini au bout de 10 min est tenu pour raté.
- Quand la dernière page `/sounds` se ferme, les sons en attente sont retirés et comptés comme ratés.
- `server.log` écrit chaque son envoyé, fini, raté ou coupé.

## L'onglet Sons

L'onglet Sons gère les fichiers. Il n'appelle jamais Twitch : supprimer un son laisse toutes les récompenses où elles sont.

Ajouter un son :

1. Cliquer « Choisir un fichier audio » : un mp3, un wav ou un ogg de 5 Mo au plus.
2. Écrire un « Titre du son » : 45 caractères au plus, unique parmi les sons.
3. Régler le « Volume », de 0 à 100 % (80 par défaut).
4. Cliquer « Ajouter le son ».

Le format se lit dans les premiers octets du fichier, jamais dans son extension.

Sur chaque ligne :

- « Écouter » joue le son dans la page des réglages, sans passer par OBS.
- « Jouer dans OBS » l'envoie à la page `/sounds`. Sans page connectée, le serveur refuse et le dit.
- Le crayon modifie le titre et le volume. Le fichier est facultatif : sans lui, le fichier en place reste.
- Le bouton de suppression demande une confirmation.
- « Couper le son », en tête de liste, arrête le son en cours dans OBS et vide la file.

Chaque son dit qui l'utilise : « Joué par « Prout. » », « Rires de 3 clips » ou « Pas utilisé ». La confirmation de suppression le redit. Un clip dont le son est supprimé saute ce rire.

## L'onglet Points de chaîne

L'onglet Points de chaîne montre les récompenses de la chaîne, lues sur Twitch. Il demande la connexion à Twitch ([twitch](twitch.md)).

Une ligne par récompense :

- Le titre, le coût et le cooldown.
- Un badge : « Créée par l'application » ou « Faite sur Twitch ».
- Le menu « Son » : « Aucun » ou un son de l'onglet Sons.
- « Phrases de Jean-Renard » avec « Tester ».
- Pour une récompense créée par l'application : le crayon et la suppression, avec confirmation.

« Rafraîchir » relit la liste. Un refus de Twitch (ou une connexion absente) s'affiche avec la raison que Twitch donne.

Créer une récompense :

1. Dans la carte « Créer une récompense », écrire le « Titre de la récompense » : 45 caractères au plus.
2. Régler le « Coût » (100 points par défaut, 1 au moins) et le « Cooldown global » (30 s par défaut, 0 pour aucun).
3. Choisir un « Son », facultatif.
4. Cliquer « Créer la récompense ».

La récompense est créée sur Twitch, puis enregistrée. Si le disque échoue, elle est retirée de Twitch. Elle ne saute pas la file de Twitch.

## Créée par l'application ou faite sur Twitch

Twitch ne laisse gérer une récompense qu'à l'application qui l'a créée. Une récompense faite à la main ne se pilote pas.

| | Créée par l'application | Faite sur Twitch |
|---|---|---|
| Titre, coût, cooldown | Modifiables ici | Lecture seule, « Se règle sur Twitch » |
| Son et phrases | Oui | Oui |
| Supprimer | Oui, depuis ici | Seulement sur Twitch |
| Après le son | Le rachat est marqué : points gardés ou rendus | Aucun statut demandé |
| Son qui ne joue pas | Points rendus (voir plus bas) | Points non rendus, seul `server.log` le dit |
| Pause à l'arrêt, remboursement au démarrage | Oui | Non |

## Ce qui se passe à un rachat

1. Le rachat arrive par EventSub.
2. Si la récompense a un son, il entre dans la file et joue, l'un après l'autre.
3. Le son joue jusqu'au bout : le rachat passe à `FULFILLED`, le viewer garde ses points dépensés.
4. Jean-Renard dit ensuite une phrase de la récompense, s'il en a une.

Deux cas où le son ne joue pas jusqu'au bout :

- Le son est coupé par « Couper le son » : le rachat passe à `CANCELED`, Twitch rend les points, aucune phrase n'est dite.
- Le son rate : aucune page `/sounds` connectée, fichier absent ou illisible, page fermée en plein son. La phrase de la récompense prend sa place. Si Jean-Renard la dit, les points sont gardés. Sinon le rachat passe à `CANCELED`.

Une récompense sans son, avec des phrases : Jean-Renard dit sa phrase tout de suite. Une récompense sans son et sans phrase est laissée de côté.

Supprimer un son ou une récompense rend d'abord les points de ses rachats en attente.

## Les phrases d'une récompense

Chaque récompense peut avoir des phrases de Jean-Renard, une par ligne. La seule variable permise est `{user}`.

- La phrase est tirée au hasard, sans répéter la dernière.
- Elle passe devant les messages du tchat, n'expire jamais, et se dit même quand « Lire le tchat » est décoché.
- S'il est parti, Jean-Renard revient pour la dire.
- « Tester » la dit tout de suite, avec « Fenysk » pour `{user}`.
- Les récompenses « Clasher Fenysk » et « Réveiller Jean-Renard » ont leurs phrases dans l'onglet Renard, pas ici ([renard](renard.md)).
- Une récompense qui choque Jean-Renard (`foxFlinchRewards`) garde son son et ses phrases ici.

## Pause et remboursement

Le serveur du stream (port 4747) tient les récompenses qu'il gère.

- Au démarrage, quand le jeton peut gérer les récompenses : elles sortent de pause et leurs rachats `UNFULFILLED` sont remboursés.
- À l'arrêt (OBS se ferme, ou signal d'arrêt) : elles sont mises en pause, avec 5 s d'attente au plus.
- Un arrêt brutal ne met rien en pause. Les rachats en attente sont remboursés au démarrage suivant.
- Un serveur de preuve sur un autre `PORT` ne lit pas les rachats et ne touche pas aux récompenses. Sinon il rendrait des points que le vrai serveur joue.

## Limites connues

- Le client id Twitch est celui de LivePlace. Une récompense créée par LivePlace est donc gérable par ce serveur. Lui choisir un son l'enregistre comme gérée : pause à l'arrêt et remboursement au démarrage. À éviter.
- Une récompense supprimée à la main sur Twitch n'est pas recréée. Elle reste en fin de liste, « N'existe plus sur Twitch », et on peut lui retirer son son.
- Twitch rend 50 rachats au plus par page. Au-delà de 50 rachats en attente pour une récompense, le reste est remboursé au démarrage suivant.
- Une page `/sounds` muette ou bloquée garde la file jusqu'à 10 min.

## Pour coder

Fichiers clés :

- `src/usecase/sound.usecase.ts` : la bibliothèque des sons. `sound-queue.usecase.ts` : la file et les statuts des rachats.
- `src/usecase/reward.usecase.ts` : les récompenses, la pause et le remboursement.
- `src/usecase/reward-phrase.usecase.ts` et `fox-reward.usecase.ts` : les phrases et le sursaut.
- `src/domain/sound.rules.ts`, `reward.rules.ts` : formats, limites, titres.
- `src/ui/use-sound-screen.ts`, `sound-screen.ts` : la page `/sounds`.
- `src/ui/settings/sounds-settings-tab.tsx`, `rewards-settings-tab.tsx`.

Fichiers de données, hors de git :

- `data/sounds/<id>/` : `sound.json` (écrit en dernier) et `audio.mp3`, `audio.wav` ou `audio.ogg`. Le nom du dossier ne change jamais, car les rires des clips confirmés le désignent.
- `data/rewards.json` : le son de chaque récompense, et celles que l'application gère.
- `data/reward-phrases.json` : les phrases de chaque récompense.

Routes utiles :

- `GET /api/sounds/events` : le flux de la page `/sounds`. `POST /api/sounds/played` : la page dit « fini » ou « raté ».
- `POST /api/sounds/:id/play` : jouer dans OBS. `POST /api/sounds/stop` : couper.
- `GET /api/rewards` : les récompenses de la chaîne, jointes à `data/rewards.json`.

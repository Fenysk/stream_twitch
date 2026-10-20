# Stream Deck

Le plugin `com.fenysk.stream-twitch` met 8 touches sur le Stream Deck pour piloter le serveur. Cette page liste les touches, l'installation et les pièges.

Le plugin vit dans `streamdeck/`. Il demande Stream Deck 7.1 ou plus, Windows 10 ou plus, et Node 20. Il parle au serveur sur `127.0.0.1:4747`.

## Les touches

Les 8 touches sont dans la catégorie « Stream Twitch ».

| Touche | Ce qu'elle montre | Un appui |
|---|---|---|
| Viewers | Le nombre de viewers, « Hors ligne » ou « ? ». Relu toutes les 10 s. | Relit tout de suite. |
| Interrupteur | Le nom du réglage et ON ou OFF. | Inverse le réglage. |
| Cycle de valeurs | Le nom du réglage et sa valeur. | Passe à la valeur suivante de la liste. |
| Préréglage | Son nom. Elle est active quand le serveur applique déjà toutes ses valeurs. | Applique toutes ses valeurs d'un coup. |
| Phrase | Son nom. | Fait dire une phrase à Jean-Renard, ou le bilan du live. |
| Fin du live +10 | « +10 min » et l'heure de fin, ou `--:--`. | Repousse la fin de 10 min. |
| Fin du live −10 | « −10 min » et l'heure de fin, ou `--:--`. | Avance la fin de 10 min. |
| Image | Qui est au Plan : « PC », « Caméra 1 » ou « Tête ». | Passe au membre suivant. |

Les touches Interrupteur, Cycle, Préréglage et Phrase se règlent dans un panneau, à l'ajout de la touche.

### Interrupteur, Cycle et Préréglage

Ces trois touches changent des réglages du serveur.

Interrupteur, six réglages possibles :

- « Lire le tchat » et « Lire mes messages ».
- « Bilan à la fin prévue ».
- « Remercier les follows, subs et cheers ».
- « Accueillir les habitués ».
- « Afficher les commandes et les bots ».
Cycle de valeurs, sept réglages possibles. Le panneau choisit les valeurs du cycle.

- Quatre réglages numériques du tchat : « Taille du texte », « Opacité du fond », « Durée d'affichage », « Messages à l'écran ».
- « Style » du tchat.
- « Animation d'apparition » du tchat.
- « Expression » de la tête.
Préréglage : des paires réglage et valeur, parmi les mêmes réglages. Sans paire, la touche ne fait rien et n'est jamais active.

Les touches suivent le serveur en direct, par un flux de réglages. Une relecture de secours passe toutes les 10 s.

### Phrase

La touche Phrase a deux types : « Texte » et « Bilan du live ».

- Texte : Jean-Renard dit le texte du panneau.
- Bilan du live : Jean-Renard dit le bilan ([renard](renard.md)).
- Une coche confirme. Une alerte signale un refus du serveur, par exemple pendant une émission.

### Fin du live

Les touches +10 et −10 règlent la fin prévue du live par crans de 10 min, à l'heure locale.

- Un appui fait un cran. +10 amène la fin au multiple de 10 min suivant. −10 l'amène au multiple précédent.
- +10 ne descend jamais sous la dizaine qui suit maintenant.
- Maintenir fait défiler, de plus en plus vite. L'heure est envoyée au serveur une seule fois, au relâché.
- Pendant l'appui, toutes les touches de fin montrent la valeur qui défile.
- Sous l'heure actuelle, il n'y a plus de fin prévue. La fin ne dépasse pas maintenant + 24 h.

### Image

La touche Image montre qui est au Plan de la place caméra d'OBS. Le téléphone appelle cela le Plan ([telephone](telephone.md)).

- L'appui passe au membre suivant : PC, les caméras disponibles par numéro, Tête, puis PC.
- L'image décide du micro : une caméra prend le sien, le PC prend celui du PC, la Tête n'y touche pas. En Muet, aucun micro ne s'ouvre.
- Avant le premier message du serveur, la touche écrit « Image … ».
- Sans place caméra dans OBS, elle écrit « Place inconnue ». Quand personne n'est au Plan, « Image – ».
- Un refus ou un serveur éteint fait clignoter l'alerte de la touche. Un succès ne dit rien, car le titre change.

### Quand le serveur ne répond pas

Toutes les touches disent pourquoi.

- « Serveur éteint » : le serveur ne répond pas sur le port, ou trop lentement (3 s).
- « Serveur à relancer » : le serveur répond autre chose que ce que le plugin attend, par exemple une route qu'il n'a pas.

## Installer

À faire une fois, depuis le dossier principal du dépôt, resté sur `main`.

1. Activer le mode développeur : `pnpm exec streamdeck dev`. Sans lui, l'application ignore un plugin lié.
2. Construire : `pnpm streamdeck:build`. Le port 4747 est figé à la construction. `PORT=4748 pnpm streamdeck:build` en choisit un autre.
3. Lier : `pnpm exec streamdeck link streamdeck/com.fenysk.stream-twitch.sdPlugin`.
4. Quitter puis relancer l'application Stream Deck. C'est obligatoire pour un plugin neuf.
5. Poser les touches de la catégorie « Stream Twitch » sur le Stream Deck.

Le lien pointe vers un dossier. Il se refait toujours depuis le dossier principal, jamais depuis un worktree.

Si `link` refuse parce que l'identifiant existe déjà : `pnpm exec streamdeck unlink com.fenysk.stream-twitch`, puis `link`. Changer le lien avant de relancer l'application, sinon elle recharge la version déjà liée.

## Mettre à jour

Le geste dépend de ce qui change.

| Ce qui change | Geste |
|---|---|
| Le code du plugin | `pnpm streamdeck:build`, puis arrêter le processus du plugin. L'application le relance seule en quelques secondes. |
| Une action ajoutée au manifest | Quitter puis relancer l'application Stream Deck. |
| Une clé de réglage ajoutée au serveur | Rien : le plugin écarte les clés qu'il ne connaît pas. |
| Une clé retirée, renommée ou retypée | `pnpm streamdeck:build` depuis le dossier principal, puis arrêter le processus du plugin. |

Relancer l'application coupe toutes les touches pendant environ 15 s. OBS n'est pas touché.

Arrêter le processus du plugin, dans PowerShell :

1. Chercher le processus : `Get-CimInstance Win32_Process | Where-Object { $_.CommandLine -like '*stream-twitch*' }`.
2. L'arrêter : `Stop-Process -Id <ProcessId>`.
3. Relire la liste. La `CreationDate` du processus relancé doit être récente.

La commande `pnpm exec streamdeck restart com.fenysk.stream-twitch` peut répondre « Restarted » sans relancer le processus. Le même identifiant de processus veut dire que le plugin n'a pas été relancé.

## Pièges

- Le manifest demande Node 20 : `%APPDATA%\Elgato\StreamDeck\NodeJS\` ne contient que des versions 20.x. Un manifest qui demande une autre version ne démarre jamais, sans aucune erreur.
- Une `Category` sans `CategoryIcon` est rejetée par l'application, alors que `streamdeck validate` passe. La raison est seulement dans `%APPDATA%\Elgato\StreamDeck\logs\StreamDeck.log` : « Plugin invalid … category icon not defined ».
- `StreamDeck.log` reste vide pendant les premières minutes après le lancement de l'application.
- Le plugin d'une branche avec le serveur de `main` donne « Serveur à relancer » dès que le schéma des réglages diffère.
- Un worktree d'où le plugin a été lié ne se supprime qu'après la relance suivante de l'application, car le processus tourne encore depuis ce dossier.

## Limites connues

- Le plugin n'a pas de touche micro. Une touche Elgato qui coupe « Micro PC » agit sur OBS sans passer par la régie. Le serveur suit la coupure, mais la règle « un seul micro ouvert » n'est pas appliquée.
- Une touche Elgato qui change la source visible de la place caméra agit aussi sans la régie. Le serveur suit : l'image décide du micro, sauf si ce micro est déjà ouvert ou en Muet.
- Les touches de fin écrivent une heure absolue au relâché. Un changement fait ailleurs pendant l'appui, par exemple depuis le téléphone, est écrasé.
- Le plugin parle à n'importe quel serveur sur le port 4747, donc aussi à un serveur de branche.

## Pour coder

Fichiers clés :

- `streamdeck/src/plugin.ts` : enregistre les actions.
- `streamdeck/src/settings-feed.ts`, `picture-feed.ts`, `sse-follower.ts` : les flux du serveur. Le Node 20 du Stream Deck n'a pas d'`EventSource` : le plugin lit les flux avec `fetch`.
- `streamdeck/src/key-behaviours.ts`, `end-time-keys.ts`, `phrase-request.ts` : les touches.
- `streamdeck/src/inspector/` : le panneau, construit en React par `pnpm streamdeck:build`.
- `streamdeck/com.fenysk.stream-twitch.sdPlugin/manifest.json` : les 8 actions.
- `src/domain/deck.rules.ts` et `deck.schema.ts` : les réglages qu'une touche peut lier.

Le dossier `streamdeck/` est hors de `src/` : le gate ne contrôle ni son lexique ni ses couches.

Routes utiles :

- `GET /api/settings/events` : le flux des réglages. `PUT /api/settings` : un changement de réglage.
- `GET /api/obs/picture/events` : le flux du Plan. `POST /api/obs/picture/next` : le membre suivant.
- `POST /api/fox/speak` et `POST /api/fox/review` : la touche Phrase.
- `GET /api/twitch/viewers` : la touche Viewers.

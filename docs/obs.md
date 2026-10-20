# OBS

Cette page dit comment OBS lance le serveur, et ce qu'il faut régler dans OBS : les sources, les entrées audio, les scènes.

## Le serveur lancé par OBS

OBS charge le script `obs/start-server.lua`. Le script lance le serveur ; il ne l'arrête pas, le serveur s'arrête seul.

À faire une fois : OBS, Outils, Scripts, `+`, puis `obs/start-server.lua`.

À chaque ouverture d'OBS :

1. Le script lance `pnpm start --open` sans fenêtre. La sortie va dans `server.log`, à la racine du dépôt. Un `pnpm start` lancé à la main écrit sur sa console.
2. `tools/start.mjs` construit le serveur (`vite build`), puis le sert sur `127.0.0.1:4747`.
3. Quand le port répond, `--open` ouvre `http://localhost:4747/` dans le navigateur par défaut. Cette adresse mène à la page Direct.

Le serveur s'arrête :

- quand OBS se ferme ;
- 30 s après une perte de connexion à OBS sans retour (il réessaie toutes les 2 s).

Au démarrage sans OBS, il réessaie sans limite. Le tchat marche déjà.

Si le port 4747 répond déjà, le lancement s'arrête et l'autre serveur continue.

Le mot de passe du WebSocket d'OBS est `OBS_PASSWORD` dans `.env`. L'adresse est `obsAddress` dans `settings.json` (`ws://127.0.0.1:4455`). Mot de passe refusé : `server.log` écrit « Mot de passe OBS refusé, voir .env (OBS_PASSWORD) ».

`server.log` grossit sans limite. Le vider quand le serveur est arrêté.

## Pendant un live

Pendant un live, le port 4747 ne sert que `main`. Un serveur lancé depuis une branche prend sa place et change ce que les pages et les téléphones chargent.

Relancer le serveur pendant un live a des effets :

- Toutes les sources navigateur qui pointent vers lui sont rafraîchies : 10 à 20 s de coupure.
- L'émission repart de l'ouverture si la source `/show` est visible.
- Le Plan se replie sur la Tête au bout de 3 s, si un téléphone n'a pas rouvert sa liaison.

Pour tester sans toucher au live, lancer un serveur de preuve sur un autre port :

```sh
OBS_PASSWORD=invalid-test-only PORT=4748 node tools/start.mjs
```

- Le mot de passe est faux exprès : le serveur ne pilote pas l'OBS en direct.
- Ne jouer aucun son pendant l'essai (voix, lecture audio, navigateur ouvert) : il perturbe Fenysk.
- Il ne lit pas les rachats et ne touche pas aux récompenses.
- Il ne peut pas finir la connexion à Twitch : l'adresse de retour est fixe, sur 4747.
- Il ne rafraîchit que les sources qui pointent vers son port.
- Tant qu'il tourne, le journal d'OBS se remplit de « Authentication failed », toutes les 2 s.
- L'arrêter dès la vérification finie, `node` enfant compris.

## Les sources OBS

Toutes sont des sources navigateur. L'adresse est exacte, hôte compris.

| Source OBS | Adresse | Taille | « Contrôler l'audio via OBS » |
|---|---|---|---|
| SouthPark | `http://localhost:4747/head` | 800 × 700 | décochée |
| Tchat | `http://localhost:4747/chat` | 480 × 640 | décochée |
| Jean-Renard | `http://localhost:4747/fox` | 648 × 920 | décochée |
| Soundboard | `http://localhost:4747/sounds` | libre | décochée |
| Show | `http://127.0.0.1:4747/show` | 1920 × 1080 | décochée |
| Countdown | `http://countdown.localhost:4747/countdown` | environ 800 × 100 | décochée |
| Image caméra N | `http://camera-N.localhost:4747/camera/N` | 1920 × 1080 | décochée |
| Micro caméra N | `http://camera-N.localhost:4747/camera/N/mic` | libre | cochée |

Toutes ont un fond transparent et aucune marge.

Une caméra a deux sources. OBS ne mixe pas le son d'un élément de scène caché, ni celui d'une scène absente du programme. Une même source dans deux scènes double le son : OBS additionne les copies.

- L'image va dans la scène « Master - Webcam », la place caméra. Elle ne joue aucun son.
- Le micro va dans une scène « Master - Micros », ajoutée à chaque scène. Sa page est vide et joue la piste audio du téléphone.
- Les deux se reconnaissent à leur adresse, jamais à leur nom : les renommer dans OBS ne change rien.

La règle de la case audio :

- Une page qui joue un son (Jean-Renard, sons, émission) a la case décochée. Le son sort par Windows, et OBS le capte une fois par l'entrée « Audio PC ».
- Cochée sur ces pages, la case coupe le son au casque, et un monitoring le doublerait dans le stream.
- L'image d'une caméra n'a pas de son : la case reste décochée.
- Le micro d'une caméra a la case cochée, et le monitoring audio désactivé. Le serveur coupe et rouvre son son pour le micro entendu.
- Chaque micro de caméra a son curseur dans le mélangeur d'OBS, sous le nom de sa source.

## Les hôtes et la limite de 6 connexions

Le navigateur d'OBS ouvre au plus 6 connexions vers un même hôte. Toutes les sources navigateur se les partagent.

- `localhost:4747` : `/head`, `/chat`, `/fox`, `/sounds`. Chacune ouvre un flux, soit 4 des 6.
- `127.0.0.1:4747` : `/show`, qui ouvre 3 flux.
- `countdown.localhost:4747` : `/countdown`, un flux.
- `camera-N.localhost:4747` : une caméra par hôte, deux flux (la page image et la page mic).

`127.0.0.1`, `countdown.localhost` et `camera-N.localhost` comptent comme d'autres hôtes pour OBS. Tous mènent au même serveur.

Toute nouvelle page OBS ouvre un seul flux SSE. Si `localhost` est plein, la mettre sur `127.0.0.1`.

Symptôme d'une 7e connexion : la page est connectée mais figée, sans vidéo ni voix, alors qu'elle marche dans un navigateur normal. La 7e requête attend sans fin.

Diagnostic dans PowerShell :

```powershell
Get-NetTCPConnection -RemotePort 4747 -State Established
```

Regrouper par processus (`obs-browser-page`) montre combien de connexions chaque page tient.

## Le rafraîchissement des sources

À chaque connexion à OBS, le serveur rafraîchit les sources navigateur dont l'adresse pointe vers lui :

- `localhost:4747`, `127.0.0.1:4747` ;
- tout sous-domaine sur le même port, donc `countdown.localhost` et `camera-N.localhost`.

Un autre port ou un autre site n'est jamais rafraîchi. Une source restée sur une page en erreur se reconnecte.

## Les entrées audio

Le serveur écoute deux entrées d'OBS. Leur nom est écrit dans `settings.json`.

| Entrée | Clé | Nom |
|---|---|---|
| Le micro de Fenysk | `micName` | « Micro PC » |
| Le son du PC | `desktopName` | « Audio PC » |

- Le serveur lit leur niveau toutes les 50 ms. La tête et Jean-Renard écoutent l'entrée du micro ouvert.
- Une entrée coupée dans OBS garde un niveau de -100 dB.
- La balance du son et le sursaut du jeu lisent « Audio PC » seulement ([renard](renard.md)).
- La source mic d'une caméra (`/camera/N/mic`) est l'entrée audio de ce téléphone.
- OBS garde la coupure d'une entrée d'une session à l'autre. Un live peut donc commencer micro coupé.

Une entrée absente des évènements d'OBS 5 s après la connexion fait écrire à `server.log` « Attention : l'entrée « … » n'est dans aucun évènement reçu depuis 5 s ». Cet avertissement ne vient qu'à la connexion ou à un changement de nom.

## Le suivi par identifiant

Quatre réglages nomment une entrée ou une scène d'OBS : `micName`, `desktopName`, `cameraSlotScene` et `showEndScene`. Leur nom ne sert qu'à trouver la source la première fois.

- Le serveur retient alors l'identifiant OBS de la source dans `data/obs-ids.json`, hors de git.
- Il suit ensuite le nom que lui donne OBS, relu à chaque connexion. Renommer l'entrée ou la scène dans OBS ne casse rien, et le serveur ne se relance pas.
- `server.log` le dit : « Entrée du micro renommée dans OBS : « Mic/Aux » → « Micro PC », suivie. ».
- Un nom changé à la main dans `settings.json` l'emporte : le serveur cherche alors la source de ce nom.
- Une source supprimée dans OBS ramène au nom de `settings.json`. `server.log` le dit une fois.
- Une scène de fin renommée dans OBS met à jour `showEndScene` dans `settings.local.json`. `settings.json` n'est jamais réécrit.

Les sources de caméra et les membres de la place n'ont pas ce suivi. Le serveur les reconnaît à leur adresse et à leur genre.

## Les scènes

- La place caméra est la scène imbriquée `cameraSlotScene` (« Master - Webcam »). Elle contient les sources PC, Tête et image des caméras ([telephone](telephone.md)).
- La scène « Master - Micros » contient les sources mic des caméras. Elle est ajoutée à chaque scène, pour que le micro entendu s'entende partout.
- Les scènes dont le nom commence par « Master » sont des scènes imbriquées. La liste Scène du téléphone ne les montre pas.
- L'émission commence quand la source `/show` est visible dans la scène du programme. Le mode studio ne change rien.
- `showEndScene` est la scène où OBS passe à la fin normale d'une émission ([emission](emission.md)).
- `cameraSlotScene` et `showEndScene` sont suivies par identifiant : renommées dans OBS, elles restent trouvées.
- Le tampon de relecture d'OBS fournit les clips bruts.
- Le serveur lit l'état du live d'OBS. L'application ne démarre jamais le live. « Arrêter le live » du téléphone envoie `StopStream`.

## Relancer le serveur sans fermer OBS

Ne jamais fermer OBS pour relancer le serveur. Dans PowerShell :

1. Trouver le processus qui écoute : `Get-NetTCPConnection -LocalPort 4747 -State Listen`. Noter `OwningProcess`.
2. L'arrêter : `Stop-Process -Id <OwningProcess>`. La chaîne `pnpm` se ferme avec lui.
3. Depuis un autre dossier que le dossier principal, recopier avant `settings.local.json` et `data/`.
4. Relancer caché, depuis le dossier du dépôt :

```powershell
Start-Process $env:ComSpec -ArgumentList '/d /s /c "pnpm start >> server.log 2>&1"' -WorkingDirectory <dossier du dépôt> -WindowStyle Hidden
```

5. Attendre le rafraîchissement des sources navigateur, environ 10 s.

Pour lire `server.log` : `Get-Content server.log -Tail 50 -Encoding UTF8`.

Un serveur lancé dans un terminal qui se ferme s'arrête avec lui. Pour le serveur du live, utiliser la commande ci-dessus.

## Limites connues

- Une entrée `micName` ou `desktopName` supprimée dans OBS ramène le serveur au nom de `settings.json`. Si aucune entrée ne porte ce nom, la tête et Jean-Renard ne réagissent plus, sans alerte à l'écran : `server.log` le dit une fois. Recréer une entrée à ce nom, ou changer `micName` ou `desktopName` dans `settings.json`, puis relancer.
- Si OBS ne répond pas pendant 30 s, le serveur s'arrête. Le script ne le relance qu'au chargement du script : recharger le script dans OBS, ou rouvrir OBS.
- Le serveur ne règle aucun décalage audio ou vidéo dans OBS. Il lit les niveaux d'OBS en direct.
- Les noms des sources et des scènes écrits dans `settings.json` sont lus au démarrage seulement.

## Pour coder

Fichiers clés :

- `obs/start-server.lua` : le script OBS.
- `tools/start.mjs` : le lanceur (`pnpm start`).
- `src/infra/obs.client.ts` : tout le client OBS (niveaux, scènes, sources, filtres, diffusion).
- `src/app/server/runtime.ts` : le câblage du serveur, dont `isStreamServer` (port 4747).
- `src/usecase/shutdown.usecase.ts` : l'arrêt du serveur et la pause des récompenses.
- `src/domain/camera.rules.ts`, `picture.rules.ts` : l'adresse des sources de caméra (image et mic), les membres de la place.
- `src/usecase/obs-ids.usecase.ts`, `src/domain/obs-ids.rules.ts`, `src/infra/obs-ids.repository.ts` : le suivi par identifiant (`data/obs-ids.json`).
- `src/app/server/obs-names.ts` : envoie le nom suivi à la régie, au boost et à l'émission.

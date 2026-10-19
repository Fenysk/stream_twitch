# stream_twitch

Serveur local qui anime le stream Twitch de Fenysk. Il tourne sur le PC, et OBS le lance.
Il sert les sources OBS : tête South Park, tchat, Jean-Renard, sons, émission de clips, caméras de téléphone.
Il sert aussi les réglages, la régie du téléphone (`/mobile`) et un plugin Stream Deck.

## Démarrer un live

À faire une fois : `pnpm install`, copier `.env.example` en `.env` (`OBS_PASSWORD`, `TWITCH_CLIENT_ID`, `TWITCH_CLIENT_SECRET`), puis ajouter `obs/start-server.lua` dans OBS (Outils, Scripts).

1. Ouvrir OBS. Le script lance le serveur sans fenêtre (`pnpm start`, sortie dans `server.log`).
2. Attendre environ 10 s : le serveur se construit, puis écoute sur `127.0.0.1:4747`.
3. Les réglages s'ouvrent sur `http://localhost:4747/` (page Direct).
4. Sur la page Direct, vérifier trois choses. Le niveau du micro bouge. Twitch dit « Connecté en tant que … ». Jean-Renard dit « Source OBS ouverte ».
5. Sur le téléphone, scanner un QR code de l'onglet Mobile.
6. Choisir la scène dans OBS, puis démarrer le live dans OBS. L'application ne démarre jamais le live.

Fermer OBS arrête le serveur. Pour tester sans OBS, lancer `pnpm start`.

## Les sources OBS

Chaque source est une source navigateur. L'adresse est exacte, hôte compris.

| Source OBS | Adresse | « Contrôler l'audio via OBS » |
|---|---|---|
| SouthPark | `http://localhost:4747/head` | décochée |
| Tchat | `http://localhost:4747/chat` | décochée |
| Jean-Renard | `http://localhost:4747/fox` | décochée |
| Soundboard | `http://localhost:4747/sounds` | décochée |
| Show | `http://127.0.0.1:4747/show` | décochée |
| Countdown | `http://countdown.localhost:4747/countdown` | décochée |
| Caméra N | `http://camera-N.localhost:4747/camera/N` | cochée |

- Une page qui joue un son (Jean-Renard, sons, émission) a la case décochée. Le son sort par Windows, et OBS le capte une fois par « Audio PC ».
- Les caméras de téléphone ont la case cochée : le serveur coupe et rouvre leur son.
- OBS ouvre 6 connexions au plus vers un même hôte. `127.0.0.1`, `countdown.localhost` et `camera-N.localhost` comptent comme d'autres hôtes. Toute nouvelle page OBS ouvre un seul flux SSE.

## Où se règle quoi

Les réglages sont sur `http://localhost:4747/`. Un changement s'applique tout de suite et va dans `settings.local.json`. `settings.json` garde les valeurs par défaut.

| Onglet | Ce qu'on y règle | Page |
|---|---|---|
| Direct | État du live, fin prévue, expression de la tête, « Faire parler » | [renard](docs/renard.md) |
| Tête South Park | Expression et six curseurs de la tête | [tete-et-tchat](docs/tete-et-tchat.md) |
| Découpe | Créer une expression à partir d'une image | [tete-et-tchat](docs/tete-et-tchat.md) |
| Tchat | L'allure du tchat dans OBS | [tete-et-tchat](docs/tete-et-tchat.md) |
| Renard | Voix, corps, écoute, évènements et réactions de Jean-Renard | [renard](docs/renard.md) |
| Sons | Les fichiers audio de la soundboard | [sons-et-recompenses](docs/sons-et-recompenses.md) |
| Points de chaîne | Les récompenses, leur son et leurs phrases | [sons-et-recompenses](docs/sons-et-recompenses.md) |
| Émission | Clips, phrases, scène de fin | [emission](docs/emission.md) |
| Mobile | QR codes, sources de caméra, téléphones connectés | [telephone](docs/telephone.md) |
| Twitch | La connexion du compte de Fenysk | [twitch](docs/twitch.md) |

Ce qui n'est pas dans l'interface s'écrit à la main dans `settings.json` (`micName`, `desktopName`, `obsAddress`, `cameraSlotScene`, `mobileOrigin`, `chatChannel`, `delay`…). Ensuite, relancer le serveur.

## Quand ça casse

Chaque ligne donne un symptôme et le geste à faire. Le détail est dans [docs/obs.md](docs/obs.md).

| Symptôme | Geste |
|---|---|
| Pages OBS blanches, touches « Serveur éteint », téléphone qui « n'arrive pas à se connecter » | Le serveur est arrêté, souvent car OBS a été fermé. Rouvrir OBS, puis lire la fin de `server.log`. Pour relancer sans fermer OBS : voir `docs/obs.md`. |
| Touches « Serveur à relancer » | Le serveur sur 4747 ne connaît pas une route ou un réglage du plugin. Le relancer depuis `main` ([stream-deck](docs/stream-deck.md)). |
| La tête et Jean-Renard ne réagissent plus à la voix | Le serveur n'entend plus « Micro PC » : entrée renommée ou coupée dans OBS. Remettre le nom exact, puis relancer le serveur. |
| Une page OBS reste figée ou vide | Actualiser la page de la source dans OBS. Si elle reste vide, la passer de `localhost` à `127.0.0.1`. |
| Le téléphone affiche « Connexion perdue » ou « OBS non joint » | Vérifier Tailscale sur le téléphone, qu'OBS est ouvert, et `OBS_PASSWORD`. |
| Son en double, coupé au casque ou absent | Vérifier la case « Contrôler l'audio via OBS » de chaque source, et l'entrée « Audio PC ». |
| « Reconnecte-toi » dans l'onglet Twitch | Cliquer « Se reconnecter à Twitch » ([twitch](docs/twitch.md)). |

## Pour coder

- Règles de travail : `AGENTS.md`. Décisions : `.agent/project/JOURNAL.md`. Un changement est fini quand `pnpm gate` sort avec le code 0.
- Il faut Windows, Node 22 ou plus et pnpm. Le code est dans `src/` : `domain`, `usecase`, `infra`, `ui`, `app`.
- Un serveur de preuve tourne sans OBS ni son, sur un autre port. Il faut l'arrêter ensuite.

```sh
OBS_PASSWORD=invalid-test-only PORT=4748 node tools/start.mjs
```

## Les branches et les worktrees

Un chantier = une branche = un worktree. Le dossier principal reste sur `main`.

- Les branches s'appellent `feat/…`, `fix/…` ou `chore/…`.
- `sh tools/worktree.sh add feat/nom` crée `.claude/worktrees/feat-nom` depuis `main` en local. Il copie `.env`, `settings.local.json` et `data/`, puis lance `pnpm install`.
- `sh tools/worktree.sh status` liste les worktrees et dit pour chaque branche « en cours » ou « déjà sur main : à supprimer ».
- `main` ne reçoit qu'un squash ou un `git revert`. Dans le dossier principal : `git merge --squash feat/nom`, puis `git commit`.
- `sh tools/worktree.sh remove feat/nom` supprime le worktree et la branche, aussi sur `origin` s'il y en a une. Il refuse tant que le contenu n'est pas sur `main`.
- Le hook `tools/git-hooks/pre-commit` refuse un commit sur `main` hors squash ou revert, et sur une branche hors `feat/`, `fix/`, `chore/`. Il ne voit pas une fusion en avance rapide : toujours `--squash`.

## Les pages de docs/

- [tete-et-tchat](docs/tete-et-tchat.md) : la tête South Park, les expressions, le tchat.
- [renard](docs/renard.md) : tout ce que fait Jean-Renard.
- [twitch](docs/twitch.md) : la connexion, les droits, ce qui marche sans elle.
- [sons-et-recompenses](docs/sons-et-recompenses.md) : la soundboard et les points de chaîne.
- [emission](docs/emission.md) : l'émission de clips, `/show` et `/countdown`.
- [telephone](docs/telephone.md) : `/mobile`, la caméra et la régie.
- [stream-deck](docs/stream-deck.md) : les 8 touches, l'installation, les pièges.
- [obs](docs/obs.md) : le serveur lancé par OBS, les sources, les entrées audio.

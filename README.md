# stream_twitch

Un serveur local qui anime le stream Twitch (widgets OBS) et tourne sur le PC.

```sh
pnpm install
pnpm gate
```

## La tête dans OBS

- Lancer : `pnpm start` (construit puis sert `http://localhost:4747/head`, port 4747), ou dans OBS : Outils, Scripts, +, `obs/start-server.lua` (journal : `server.log`) ; il ouvre aussi les réglages dans le navigateur par défaut, et le serveur s'arrête avec OBS.
- Source navigateur OBS : URL `http://localhost:4747/head`, taille conseillée 800 × 700.
- Réglages en direct : `http://localhost:4747/` (menu, vumètre du micro) ; ils restent dans `settings.local.json`, `settings.json` garde les valeurs par défaut.
- Mot de passe du WebSocket d'OBS : copier `.env.example` en `.env`, remplir `OBS_PASSWORD`.
- Six curseurs dans l'interface : seuil du micro (`threshold`), pivot (`tilt`), ouverture (`opening`), effet de la voix (`voiceEffect`), penché au repos (`idleAngle`), penché en parlant (`talkAngle`). Tout le reste (micro, délais, niveaux, extrêmes de l'effet…) se règle dans `settings.json`, relu au démarrage.
- Expressions : l'onglet « Découpe » coupe une image en deux moitiés et l'enregistre dans `data/heads/` (hors de git) ; une vignette de l'onglet « Tête South Park » la montre aussitôt dans OBS.

## Le tchat dans OBS

- Le même serveur lit le tchat de la chaîne `fenysk` (`chatChannel` dans `settings.json`) avec ComfyJS, **sans jeton** : il rejoint la chaîne comme un visiteur. Il marche sans OBS ; le journal (`server.log`) écrit « Tchat : #fenysk rejoint ».
- Source navigateur OBS : URL `http://localhost:4747/chat`, taille conseillée 480 × 640. Elle est séparée de la tête : à placer où l'on veut. La page a un fond transparent, les messages récents sont en bas.
- Réglages en direct : l'onglet « Tchat » (aperçu où défilent des messages de test, un toutes les 2,5 s, seulement dans l'onglet : jamais dans OBS). Sept réglages : style (`chatStyle` : `pill`, `text`, `panel`), opacité du fond en % (`chatOpacity`), taille du texte en px (`chatTextSize`), durée d'affichage en secondes, 0 pour « Toujours » (`chatDuration`), nombre de messages (`chatMaxMessages`), animation (`chatAnimation` : `rise`, `pop`, `side`, `fade`), commandes et bots (`chatShouldShowHidden`). Ils restent dans `settings.local.json`, `settings.json` garde les valeurs par défaut.
- Masqués par défaut : les commandes (`!lurk`…) et les bots de `chatBots` dans `settings.json` ; la case de l'onglet les affiche. Un message supprimé par un modo, et tous ceux d'un viewer banni ou mis en timeout, disparaissent de l'écran.
- Ne sont pas affichés : les badges, les évènements (subs, follows, raids).
- Limite de ComfyJS 1.1.29 : un message réduit à une seule mention (`@pseudo` seul) lève une erreur dans ComfyJS et n'arrive pas ; le journal écrit « ComfyJS signale une erreur ». Une commande affichée perd sa casse (`!Lurk` devient `!lurk`).

## Les branches et les worktrees

- `main` ne reçoit qu'un squash validé ou un `git revert`.
- Les branches s'appellent `feat/…`, `fix/…` ou `chore/…`.
- Un chantier, un worktree : `sh tools/worktree.sh add|status|remove <branche>`.
- Le dossier principal reste sur `main`.

Les règles de travail sont dans `AGENTS.md`, les décisions dans `.agent/project/JOURNAL.md`.

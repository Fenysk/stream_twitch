# stream_twitch

Un serveur local qui anime le stream Twitch (widgets OBS) et tourne sur le PC.

```sh
pnpm install
pnpm gate
```

## La tête dans OBS

- Lancer : `pnpm start` (construit puis sert `http://localhost:4747/head`, port 4747), ou dans OBS : Outils, Scripts, +, `obs/start-server.lua` (journal : `server.log`) ; le serveur s'arrête avec OBS.
- Source navigateur OBS : URL `http://localhost:4747/head`, taille conseillée 800 × 700.
- Réglages en direct : `http://localhost:4747/` (menu, vumètre du micro) ; ils restent dans `settings.local.json`, `settings.json` garde les valeurs par défaut.
- Mot de passe du WebSocket d'OBS : copier `.env.example` en `.env`, remplir `OBS_PASSWORD`.
- Cinq curseurs dans l'interface : seuil du micro (`threshold`), pivot (`tilt`), ouverture (`opening`), effet de la voix (`voiceEffect`), penché au repos (`idleAngle`). Tout le reste (micro, délais, niveaux, extrêmes de l'effet…) se règle dans `settings.json`, relu au démarrage.

## Les branches et les worktrees

- `main` ne reçoit qu'un squash validé ou un `git revert`.
- Les branches s'appellent `feat/…`, `fix/…` ou `chore/…`.
- Un chantier, un worktree : `sh tools/worktree.sh add|status|remove <branche>`.
- Le dossier principal reste sur `main`.

Les règles de travail sont dans `AGENTS.md`, les décisions dans `.agent/project/JOURNAL.md`.

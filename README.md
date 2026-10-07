# stream_twitch

Un serveur local qui anime le stream Twitch (widgets OBS) et tourne sur le PC.

```sh
pnpm install
pnpm gate
```

## Les branches et les worktrees

- `main` ne reçoit qu'un squash validé ou un `git revert`.
- Les branches s'appellent `feat/…`, `fix/…` ou `chore/…`.
- Un chantier, un worktree : `sh tools/worktree.sh add|status|remove <branche>`.
- Le dossier principal reste sur `main`.

Les règles de travail sont dans `AGENTS.md`, les décisions dans `.agent/project/JOURNAL.md`.

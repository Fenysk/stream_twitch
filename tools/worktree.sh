#!/bin/sh
# Un chantier = une branche = un worktree (JOURNAL 2026-10-07). Se lance depuis le dossier principal, resté sur `main`.
#
#   sh tools/worktree.sh add feat/renard     .claude/worktrees/feat-renard, branche existante ou neuve (partie de la base)
#   sh tools/worktree.sh status              les worktrees et les branches, et celles déjà sur main
#   sh tools/worktree.sh remove feat/renard  le worktree et la branche, ici et sur le remote s'il y en a un, une fois sur main
#
# La base est origin/main si un remote `origin` existe, sinon `main` en local.
set -e

root=$(git rev-parse --show-toplevel)
# Le préfixe reste dans le nom du dossier : feat/x et fix/x n'ont jamais le même worktree.
dir_of() { echo "$root/.claude/worktrees/$(echo "$1" | tr / -)"; }

has_origin() { git remote get-url origin > /dev/null 2>&1; }

if has_origin; then base=origin/main; else base=main; fi

# Vrai si les changements de la branche sont déjà sur la base : la fusion squash en a fait un commit au contenu identique.
is_on_main() {
  merge_base=$(git merge-base "$base" "$1")
  want=$(git diff "$merge_base" "$1" | git patch-id --stable | cut -d' ' -f1)
  [ -z "$want" ] && return 0
  git log -p --format='commit %H' "$merge_base..$base" | git patch-id --stable | cut -d' ' -f1 | grep -qx "$want"
}

case "$1" in
add)
  branch="$2"
  case "$branch" in feat/* | fix/* | chore/*) ;; *) echo "Une branche feat/…, fix/… ou chore/…" >&2; exit 1 ;; esac
  dir=$(dir_of "$branch")
  if has_origin; then git fetch -q origin; fi
  if git show-ref --verify --quiet "refs/heads/$branch"; then
    git -c core.longpaths=true worktree add -q "$dir" "$branch"
  elif git show-ref --verify --quiet "refs/remotes/origin/$branch"; then
    git -c core.longpaths=true worktree add -q --track -b "$branch" "$dir" "origin/$branch"
  else
    git -c core.longpaths=true worktree add -q --no-track -b "$branch" "$dir" "$base"
  fi
  if [ -f "$root/.env" ]; then cp "$root/.env" "$dir/.env"; fi
  if [ -f "$root/settings.local.json" ]; then cp "$root/settings.local.json" "$dir/settings.local.json"; fi
  (cd "$dir" && pnpm install --frozen-lockfile --prefer-offline > /dev/null)
  echo "$dir"
  ;;
status)
  if has_origin; then git fetch -q --prune origin; fi
  git worktree list
  for branch in $(git for-each-ref --format='%(refname:short)' refs/heads); do
    [ "$branch" = main ] && continue
    if is_on_main "$branch"; then state="déjà sur main : à supprimer"; else state="en cours"; fi
    echo "$branch — $state"
  done
  ;;
remove)
  branch="$2"
  if has_origin; then git fetch -q origin; fi
  if ! is_on_main "$branch"; then echo "$branch n'est pas sur main : rien n'est supprimé" >&2; exit 1; fi
  dir=$(dir_of "$branch")
  [ -d "$dir" ] && git -c core.longpaths=true worktree remove "$dir"
  git branch -D "$branch"
  if has_origin && git ls-remote --exit-code --heads origin "$branch" > /dev/null; then git push -q origin --delete "$branch"; fi
  ;;
*)
  echo "Usage : sh tools/worktree.sh add|status|remove <branche>" >&2
  exit 1
  ;;
esac

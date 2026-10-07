# JOURNAL

Append-only. On ajoute en haut, on ne réécrit jamais, on ne supprime jamais.

Une entrée existe pour **une seule raison** : une décision a changé ce que le gate accepte
(architecture.json, lexique.json, un seuil, une règle désactivée). Tout le reste — ce qui a
été fait, ce qui marche — se lit dans le code et dans le gate. Un journal qui raconte le
travail devient un doublon du dépôt, et un doublon dérive.

Format : 5 lignes maximum. Si ça demande plus, la décision n'est pas mûre.

---

## 2026-10-07 — La convention reprise de LivePlace

**Contexte.** LivePlace a éprouvé cette convention de branches ; ce dépôt la reprend à l'identique.
**Décision.** Hook `pre-commit` : branches `feat/…`, `fix/…` ou `chore/…`, un worktree par chantier
(`tools/worktree.sh`), `main` reçoit un squash validé ou un `git revert`. Le premier commit passe.
**Renoncement.** Pas de remote pour l'instant : la base des branches est `main` en local.

## 2026-10-07 — Adoption du socle 1.2.0, branche A, sur un dépôt vide

**Contexte.** Aucun code : branche A du skill `installer-les-rails`, rien à mesurer.
**Décision.** Six couches du gabarit, lexique sans noms, pas de baseline ; `tsconfig` en ligne,
car TS 7 refuse les clés `_` du gabarit (TS5023).
**Renoncement.** Pas d'architecture sur mesure ni de noms du domaine avant la séance 1.

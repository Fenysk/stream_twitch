# JOURNAL

Append-only. On ajoute en haut, on ne réécrit jamais, on ne supprime jamais.

Une entrée existe pour **une seule raison** : une décision a changé ce que le gate accepte
(architecture.json, lexique.json, un seuil, une règle désactivée). Tout le reste — ce qui a
été fait, ce qui marche — se lit dans le code et dans le gate. Un journal qui raconte le
travail devient un doublon du dépôt, et un doublon dérive.

Format : 5 lignes maximum. Si ça demande plus, la décision n'est pas mûre.

---

## 2026-10-11 — `idle` entre au lexique : la tête bouge par à-coups quand Alexis ne parle pas

**Contexte.** Alexis veut une tête qui vit un peu pendant les silences, discrète, dans l'esprit de South Park.
**Décision.** `lexique.json` : nouveau nom `idle` (tant qu'elle ne parle pas, la tête entière change de pose de repos toutes les 2 à 5 s) ; `pose` couvre aussi ces poses de repos. Synonymes bannis : repos, rest, resting, calm, still.
**Renoncement.** Un mouvement continu (respiration, balancement) : le rendu reste fait d'à-coups, comme la bouche.

## 2026-10-11 — L'ouverture de la tête suit le level de la voix (écart à la décision A2 du plan)

**Contexte.** Le plan avait écarté une ouverture proportionnelle au volume ; Alexis la reprend en gardant les poses par à-coups.
**Décision.** Chaque pose garde son tirage ; son angle et sa levée sont multipliés par un `scale`, linéaire en dB, borné : `quietScale` au `quietLevel` (par défaut le `threshold`), `loudScale` au `loudLevel`. `quietScale`, `loudScale`, `loudLevel` vont ensemble (absents : scale 1). `lexique.json` : nouveau nom `scale`.
**Renoncement.** Une bouche qui s'ouvre en continu avec le volume : la règle fermée/ouverte (`toNextMouth`) ne change pas.

## 2026-10-11 — `tilt` entre au lexique, `opening` ne règle plus que la levée

**Contexte.** Après son test dans OBS, Alexis veut une moitié haute qui pivote moins et se soulève plus : l'angle et la levée doivent se régler séparément.
**Décision.** `lexique.json` : nouveau nom `tilt` (facteur de l'angle des poses), `opening` devient le facteur de la levée seule. Sans `tilt` dans `settings.json`, il vaut `opening` : le rendu reste celui de l'outil.
**Renoncement.** Un second champ dans `tete.json` : le format de l'outil ne change pas, `amplitude` reste la valeur de départ des deux.

## 2026-10-11 — Un fichier de test garde le nom de son sujet, suivi de `.test`

**Contexte.** Le `filename` des couches domain, usecase, infra et ui refuse `mouth.rules.test.ts` : le nom attendu finit par `.rules.ts`. Les tests du jalon 1 vivent à côté de leur sujet.
**Décision.** `architecture.json` : les quatre `filename` acceptent un `.test` optionnel avant l'extension. Rien d'autre ne change : mêmes suffixes, mêmes couches.
**Renoncement.** Ranger les tests dans la couche `app` (aucune contrainte de nom) : un test de la règle de la bouche n'a rien à y faire.

## 2026-10-11 — Le lanceur `tools/start.mjs` a le droit d'importer les modules système

**Contexte.** `pnpm start` doit sortir sans rien reconstruire si le port 4747 est pris (un `vite build` écraserait `.output/` sous le serveur qui tourne), puis construire et démarrer.
**Décision.** `biome.json` : l'override qui lève `noRestrictedImports` (infra, app, `*.config.ts`) couvre aussi `tools/**`. Le lanceur vit hors de `src/`, donc hors des couches.
**Renoncement.** Un script `package.json` en ligne de commande : le test du port et le chargement de `.env` n'y sont pas portables entre shells.

## 2026-10-11 — Les noms du domaine de la tête entrent au lexique

**Contexte.** Le jalon 1 anime la tête d'Alexis selon le micro ; `src/` n'avait aucun nom du domaine.
**Décision.** `lexique.json` : `nouns` reçoit head, mouth, mic, level, pose, hinge, cut, threshold, delay, rhythm, opening, settings. Le code est en anglais ; les synonymes anglais et français évidents sont bannis. `pivot` reste libre : c'est le champ de `tete.json`.
**Renoncement.** Pas de nom pour les moitiés de la tête (`top`, `bottom` restent des mots courants) : un mot de plus ne réduirait aucune dérive observée.

## 2026-10-11 — TanStack Start, Nitro, Vite et React dans la couche app

**Contexte.** La tête s'affiche par une page web servie en local : il faut un serveur de production Node et des routes.
**Décision.** Dépendances : `@tanstack/react-start`, `@tanstack/react-router`, `react`, `react-dom`, `obs-websocket-js`, `zod` (lecture des fichiers JSON), `vite`, `@vitejs/plugin-react`, `nitro`. `srcDirectory` de Start = `src/app` : routes, routeur et `routeTree.gen.ts` restent dans la couche `app`. `tsconfig.json` : `jsx: react-jsx` et `lib` + `DOM`, `DOM.Iterable` (le composant utilise `EventSource`).
**Renoncement.** `architecture.json` inchangé pour les routes ; TypeScript 7 gardé tant qu'aucun outil n'exige son API classique.

## 2026-10-11 — Les fichiers de l'outil « Découpe de tête » sortent de Biome

**Contexte.** `tete-south-park/` est produit par un outil externe et remplacé tel quel ; son `tete.json` n'a pas de ligne vide finale.
**Décision.** `biome.json` : `!tete-south-park` dans `files.includes`. Les 4 fichiers entrent dans git sans être modifiés.
**Renoncement.** Reformater `tete.json` : le prochain export l'écraserait et le diff bruiterait.

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

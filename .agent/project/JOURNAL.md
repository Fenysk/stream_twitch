# JOURNAL

Append-only. On ajoute en haut, on ne réécrit jamais, on ne supprime jamais.

Une entrée existe pour **une seule raison** : une décision a changé ce que le gate accepte
(architecture.json, lexique.json, un seuil, une règle désactivée). Tout le reste — ce qui a
été fait, ce qui marche — se lit dans le code et dans le gate. Un journal qui raconte le
travail devient un doublon du dépôt, et un doublon dérive.

Format : 5 lignes maximum. Si ça demande plus, la décision n'est pas mûre.

---

## 2026-10-12 — `comfy.js` en dépendance : le tchat de `fenysk` se lit sans jeton, derrière le port `ChatSource`

**Contexte.** Le jalon 3 affiche le tchat dans OBS. Essai réel de la v1.1.29 : `Init` sans mot de passe rejoint #fenysk en lecture anonyme (tmi.js, IRC) ; messages, commandes, suppressions, bans et timeouts arrivent par `onChat`, `onCommand`, `onMessageDeleted`, `onBan`, `onTimeout`. EventSub ne démarre qu'avec un jeton : `useEventSub` reste à `true`.
**Décision.** Dépendance `comfy.js`. Le port `ChatSource` est déclaré dans `src/usecase/chat.usecase.ts`, `src/infra/chat.client.ts` l'implémente (seul fichier qui connaît ComfyJS), `src/app/server/runtime.ts` câble. `architecture.json` ne change pas.
**Renoncement.** `tmi.js` seul : plus léger, mais le même paquet doit servir aux évènements (subs, raids) des jalons suivants.

## 2026-10-12 — Les noms du tchat entrent au lexique

**Contexte.** Le jalon 3 introduit les concepts du tchat ; `src/` n'a aucun de ces noms. `timeout` est déjà banni (synonyme de `delay`), alors que Twitch l'emploie pour un viewer écarté un moment.
**Décision.** `lexique.json` : nouveaux noms `chat`, `message`, `viewer`, `nickname`, `emote`, `fragment`, `command`, `bot`, avec leurs synonymes bannis (tchat, msg, pseudo, username, spectator, chatter, emoticon, smiley, segment, piece, cmd, robot…). Un ban et un timeout s'écrivent pareil dans le code : `viewer-messages-deleted`, les messages du viewer sortent de l'écran.
**Renoncement.** Bannir `user` ou `chunk` : `userId` est le mot de Twitch, et `CHUNK` existe déjà dans `base64.ts`.

## 2026-10-11 — Marge du haut de la scène : 9 % de la hauteur au lieu de 31 %

**Contexte.** Les poses de la bouche, normalisées sur la hauteur du haut, lèvent la moitié haute ~3 fois moins sur les avatars : la marge du haut calée sur leur pire cas était trop grande.
**Décision.** `toStageLayout` : 17 % de la largeur de chaque côté (inchangé, calé sur la photo), 9 % de la hauteur en haut, 6 % en bas (inchangé). Les plus petites marges qui gardent les 7 expressions dans la source 800 × 700 au pire cas de chaque curseur. Les avatars regagnent 19 % de taille ; la photo ne change pas.
**Renoncement.** Garder 31 % en haut : une tête plus petite pour rien.

## 2026-10-11 — Les poses de la bouche partent de la position fermée et se mesurent sur la hauteur du haut

**Contexte.** Sur les avatars la bouche s'ouvrait environ 3 fois trop : la levée et l'écart suivent la longueur de la coupe (0,86 à 0,90 de la hauteur du haut, contre 0,31 pour la photo), et chaque pose ajoutait la bande dessinée.
**Décision.** `head.rules.ts` : toutes les poses partent de la position fermée (le closing s'ajoute à la pose). La longueur de référence est celle de la photo (coupe de 104,8 px pour un haut de 333,7 px, rapport 0,314) mise à l'échelle de la hauteur du haut ; levée et angle comme si la coupe avait cette longueur. Géométrie : champ optionnel `hauteurHaut`, mesuré par la Découpe (à défaut, du haut de l'image au milieu de la coupe). La photo ne change pas ; les poses de la tête entière non plus.
**Renoncement.** Un opening réglé à la main pour chaque avatar : chaque nouvelle expression aurait eu son réglage.

## 2026-10-11 — Les expressions se listent par nom, pas par date de création

**Contexte.** Copier `data/heads/` (vers le dossier principal, ou par `tools/worktree.sh add`) ne garde pas les dates de création : les vignettes changeaient d'ordre.
**Décision.** `expression.repository.ts` liste par nom (ordre français), puis par identifiant. « Photo » reste première.
**Renoncement.** Écrire la date de création dans `geometry.json` : un champ de plus pour un ordre qu'Alexis ne règle pas.

## 2026-10-11 — La Découpe propose un closing de la bande + 2 px

**Contexte.** Avec le closing égal à la hauteur de la bande, la moitié haute frôlait la mâchoire : écart médian de 1 à 2 px sur les 6 avatars, 7 px au plus.
**Décision.** `toCutSuggestion` propose la hauteur de la bande plus 2 px : la moitié haute mord un peu sur la mâchoire. Écart médian de -1 à 0 px, 5 px au plus. Les 6 avatars déjà importés sont passés de +2 px par l'API.
**Renoncement.** Garder la hauteur de la bande : l'écart restait visible sur une tête fermée.

## 2026-10-11 — Marges de la scène fixes sur quatre côtés, `talkAngle` plafonné à 8°

**Contexte.** À 800 × 700, la tête entière qui tourne autour de son bas-centre sortait de la source (les avatars, dès 3 à 6°), et plus encore au pire cas des curseurs.
**Décision.** `toStageLayout` : 17 % de la largeur de chaque côté, 31 % de la hauteur en haut, 6 % en bas, pour toutes les expressions : les plus petites qui gardent les 7 expressions dans la source au pire cas (pivot ×2, ouverture ×3, voix ×2, bouche ouverte, parole 8° × 2, repos 15°). La tête rétrécit de 13,5 % au plus. « Penché en parlant » va de 0 à 8°, « Penché au repos » reste à 15°.
**Renoncement.** Baisser les maximums des curseurs : la perte de taille reste sous les 25 % fixés.

## 2026-10-11 — La tête entière bouge aussi quand elle parle : `talkMin`, `talkMax`, `talkAngle`

**Contexte.** Quand Alexis parle, seule la moitié haute bouge ; la tête entière reste figée, alors qu'elle bouge au repos.
**Décision.** `settings.schema.ts` : trois réglages qui vont ensemble (`talkMin`, `talkMax`, `talkAngle`). En parlant, la tête reprend les quatre poses du repos (levée de `idleLift`) toutes les 600 à 1500 ms, jamais deux fois la même, avec l'angle `talkAngle` multiplié par le facteur de voix. `talkAngle` est le sixième curseur ; à 0° la tête reste neutre.
**Renoncement.** Des poses de parole à part : les quatre poses du repos suffisent, seuls l'angle et l'intervalle changent.

## 2026-10-11 — L'onglet « Découpe » devine la coupe d'une image déjà découpée

**Contexte.** Les avatars d'Alexis arrivent coupés en deux, avec une bande transparente d'environ 11 px à la bouche.
**Décision.** `cut.rules.ts` cherche une bande de lignes transparentes entre 30 % et 85 % de la hauteur du personnage : coupe au milieu, charnières aux bords les plus larges autour de la bande, closing égal à sa hauteur, lèvres décochées. Sans bande : coupe à 70 % de la hauteur, lèvres de 10 px.
**Renoncement.** « Dans la moitié basse de l'image » : les six avatars ont leur bande à 49-52 % de la hauteur.

## 2026-10-11 — L'API des expressions remplace `/api/head/image/:part`

**Contexte.** Le serveur servait deux images fixes ; les expressions en ajoutent, retouchables en direct.
**Décision.** `/api/expressions` (liste, création), `/api/expressions/:id` (détail, mise à jour, suppression) et `/api/expressions/:id/image/:part` (`?v=` = version, cache longue durée). L'expression active est le réglage `expression` de `settings.local.json`. `/head` ne montre une expression qu'une fois ses deux images chargées.
**Renoncement.** Garder `/api/head/image/:part` : une seule URL par moitié casse le cache d'OBS à chaque retouche.

## 2026-10-11 — `expression` et `closing` entrent au lexique : la tête a plusieurs visages

**Contexte.** Alexis veut changer l'expression de la tête en direct, et en créer d'autres dans l'onglet « Découpe » (ses avatars sont déjà coupés).
**Décision.** `lexique.json` : nouveaux noms `expression` (une image d'origine, ses deux moitiés et sa géométrie ; synonymes bannis : avatar, mood, humeur, emotion) et `closing` (de combien la moitié haute descend, bouche fermée, pour toucher la mâchoire ; banni : fermeture). Les expressions vivent dans `data/heads/<id>/`, hors de git.
**Renoncement.** Ranger les expressions dans `tete-south-park/` (suivi par git) : des fichiers modifiés depuis l'interface bloqueraient les fusions, comme `settings.local.json`.

## 2026-10-11 — Le design system de LivePlace entre dans `src/ui/design/`

**Contexte.** La première interface de stream_twitch (réglages de la tête) doit avoir le style d'Alexis, celui de LivePlace.
**Décision.** Copie des fichiers génériques de `apps/web/src/ui/design/` (tokens, composants, CSS, hooks, tests qui tournent sous node), sans le jeu ni la langue : interface en français seulement. Deux dépendances : `@fontsource-variable/nunito`, `lucide-react`. Apparence retenue sous `stream-twitch:theme`.
**Renoncement.** Un package partagé entre les deux dépôts : LivePlace reste en lecture seule, les deux copies divergeront.

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

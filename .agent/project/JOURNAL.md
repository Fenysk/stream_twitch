# JOURNAL

Append-only. On ajoute en haut, on ne réécrit jamais, on ne supprime jamais.

Une entrée existe pour **une seule raison** : une décision a changé ce que le gate accepte
(architecture.json, lexique.json, un seuil, une règle désactivée). Tout le reste — ce qui a
été fait, ce qui marche — se lit dans le code et dans le gate. Un journal qui raconte le
travail devient un doublon du dépôt, et un doublon dérive.

Format : 5 lignes maximum. Si ça demande plus, la décision n'est pas mûre.

---

## 2026-10-15 — Un plugin Stream Deck affiche le nombre de viewers : `streamdeck/`, `@elgato/streamdeck` et `@elgato/cli` entrent au dépôt

**Contexte.** La touche « Viewers » de BarRaider marchait mal ; Alexis veut le nombre lu sur `/api/twitch/viewers`, sans confondre zéro, hors ligne et inconnu. Aucun connecteur ne règle une touche, aucun plugin installé ne lit une URL.
**Décision.** Le plugin vit dans `streamdeck/` : source `streamdeck/src/`, dossier `com.fenysk.stream-twitch.sdPlugin/`, sortie `bin/` construite, hors de git et de Biome. `@elgato/streamdeck` tourne sur le Node 20 de l'appli, le seul installé ici (Node 22 suffit pour construire) ; `@elgato/cli` sert à `link`, `validate` et `restart`. Le Vite du dépôt fait le bundle pour `node20` (`streamdeck/vite.config.ts`, SDK et zod dedans). Le manifest vise le SDK 3, Stream Deck 7.1 au moins (comportement des réglages du SDK 3) et Node 20. La lecture de la réponse et le texte de chaque état connu vivent dans `src/domain` (`viewers.schema.ts`, `viewers.rules.ts`), sous tout le gate ; `tsconfig.json` et `vitest.config.ts` couvrent aussi `streamdeck/src/` (types, lint, tests), mais architecture, lexique et duplication ne lisent que `src/`. Les textes « Serveur éteint » et « Serveur à relancer » vivent dans `streamdeck/src/viewers-title.ts`. Le port se fixe à la construction (`PORT`, 4747 par défaut, comme pour `pnpm start`) et entre par `define` sous le nom `serverPortAtBuild`.
**Renoncement.** Node 24 : l'appli de ce poste ne l'a pas installé, et un plugin qui l'exige ne démarre pas (aucun processus, aucun `logs/`). API Ninja : rien de lisible pour `offline` ni `unknown`. Le Rollup du gabarit Elgato : cinq dépendances pour ce que Vite fait déjà. Un inspecteur de propriétés pour le port : une page de plus pour un réglage qui ne bouge pas.

---

## 2026-10-15 — Jean-Renard parle contre des points de chaîne : toute récompense de la chaîne peut recevoir des phrases, gardées dans `data/reward-phrases.json`

**Contexte.** Alexis a fait « À boire ! » et « Étirement ! » sur Twitch (l'app ne les gère pas) et veut que le renard dise « Bois un coup de la part de {user} ! » quand un viewer les dépense. Une récompense a un son, des phrases, ou les deux.
**Décision.** Un seul fichier `data/reward-phrases.json` (hors de git) garde, par id de récompense, ses phrases (une par ligne, `{user}` = le nickname, « quelqu'un » si le filtre d'insultes le refuse) et son dernier titre connu de Twitch, de quoi la reconnaître si elle disparaît (badge « Pas sur Twitch », phrases gardées). `sound.json` ne change pas : le sound « Prout. » (`isManaged: false`) marche tel quel. Au rachat (serveur du stream seulement), `fox-reward.usecase.ts` tire une phrase (`pick.rules.ts`, jamais deux fois la même de suite) et la pousse en urgent dans la file du renard comme un remerciement : devant le chat, sans expirer, même si « Lire le tchat » est désactivé, indépendante de la case « Remercier » (une récompense sans phrases est le seul interrupteur). Avec un sound, elle part quand le sound se termine, fini ou raté ; « Couper le son » ou supprimer le sound ne la dit pas. Statuts, pour une récompense créée par l'app seulement : FULFILLED dès que le sound a joué ou que la phrase est dite, CANCELED seulement si ni l'un ni l'autre n'a pu ; une récompense que l'app ne gère pas n'a aucun statut. Une récompense dont le titre est dans `foxClashRewards` ou `foxWakeRewards` garde son mécanisme et ne reçoit pas de phrases ici. Routes : `GET /api/reward-phrases`, `PUT /api/reward-phrases/:id`, `POST /api/reward-phrases/:id/test` (une phrase au hasard avec Fenysk pour `{user}`, dite comme « Faire parler »). `lexique.json` : `reward` couvre aussi les phrases du renard.
**Renoncement.** Les phrases dans `settings.json` ou `settings.local.json` : une liste par récompense n'a pas sa place dans des clés fixes, et le serveur ne doit pas réécrire le fichier d'Alexis. Les phrases dans `sound.json` : une récompense sans sound n'en aurait pas. Dire la phrase d'un sound coupé : « Couper le son » demande le silence.

## 2026-10-15 — Une récompense déjà faite sur Twitch peut recevoir un son : l'app la lit, ne la gère pas

**Contexte.** Alexis a déjà des récompenses de points de chaîne faites à la main (dont celles du renard) et veut leur associer un son. Twitch ne laisse gérer une récompense qu'à l'application qui l'a créée : pour les autres, l'app ne peut ni changer le statut d'un rachat, ni les mettre en pause, ni les modifier ou les supprimer.
**Décision.** `sound.json` garde `isManaged` (vrai : l'app a créé la récompense et la gère ; absent, donc pour un son d'avant, vrai). L'onglet liste les récompenses de la chaîne à son ouverture et sur « Rafraîchir » (`GET /api/rewards` : Helix `custom_rewards`, puis `only_manageable_rewards=true` pour savoir lesquelles l'app gère) ; celles déjà reliées à un son n'y sont pas. Un son relié à une récompense existante lit son titre, son coût et sa pace sur Twitch (relus à chaque liste, en lecture seule dans l'onglet) ; seuls son fichier et son fader se modifient. Pour elle : le sound joue au rachat, jamais de `FULFILLED`/`CANCELED`, de pause, de remboursement au démarrage ni de modification ; s'il ne peut pas jouer, seul `server.log` le dit, et l'onglet écrit « Points non rendus si le son ne joue pas ». Supprimer le son ne supprime pas la récompense. Une récompense disparue de Twitch : le son reste, badgé « Pas sur Twitch ». `lexique.json` : `reward` couvre aussi la récompense existante.
**Renoncement.** Rendre les points d'une récompense faite à la main : Twitch répond 403 (le client-id n'est pas celui de l'app). La recréer sous le nom de l'app pour la gérer : Alexis perdrait ses réglages et le renard, qui la reconnaît par son titre, aurait deux récompenses.

## 2026-10-15 — Fusion de `main` : un seul abonnement aux récompenses, son droit devient `channel:manage:redemptions`, `redemption` s'efface devant `reward`

**Contexte.** `main` a généralisé EventSub en `TWITCH_TOPIC_SPECS` (follow, reward, prediction) et banni `redemption` au profit de `reward` ; la branche soundboard avait son propre abonnement aux rachats (`FollowFeed`, `onRedemption`) et un statut `reconnect`.
**Décision.** Un seul abonnement : le topic `reward` de `main`, dont le droit passe de `channel:read:redemptions` à `channel:manage:redemptions` (il couvre la lecture ; la soundboard en a besoin pour créer, modifier, supprimer ses récompenses et marquer un rachat). Un jeton qui n'a que `channel:read:redemptions` voit `reward` dans `missing` (`toMissingTopics`) : l'onglet Renard dit « Reconnecte-toi », sans second mécanisme ; la soundboard ne démarre pas (`getRewardsToken` rend `null`). L'évènement `reward` du live gagne `id` (le rachat) et `rewardId` : la queue des sons le lit, le renard continue de n'y lire que le titre et le pseudo, jamais le texte joint. `lexique.json` : un seul `reward` (celui de `main`, étendu à la soundboard), `redemption` n'existe plus et reste banni ; `RedemptionStatus` devient `RewardStatus`. La queue ne touche que les récompenses reliées à un sound : celles qu'Alexis a faites à la main pour le renard n'ont aucun appel de statut, de pause ni de remboursement.
**Renoncement.** Un second abonnement aux rachats pour la soundboard : deux évènements pour un même rachat. Un statut `reconnect` à côté de `missing` : deux façons de dire la même chose.

## 2026-10-14 — Les récompenses de points de chaîne : l'app les crée sur Twitch, un rachat joue le son puis garde ou rend les points ; `reward` et `redemption` entrent au lexique

**Contexte.** Chaque `sound` a sa récompense. Twitch ne laisse gérer une récompense qu'à l'application (client id) qui l'a créée : celles qu'Alexis ferait à la main ne seraient pas pilotables, donc l'app crée les siennes (Helix `custom_rewards`).
**Décision.** Le droit `channel:manage:redemptions` s'ajoute à `moderator:read:followers` ; un jeton qui n'a pas les deux met le statut Twitch à « reconnect » (les follows marchent toujours, les récompenses attendent). Ajouter, modifier (titre, coût, cooldown) ou supprimer un sound le fait d'abord sur Twitch : un refus (chaîne non affiliée, titre pris, 50 récompenses) se dit en clair et rien n'est gardé. Les `redemption` arrivent par EventSub (`channel.channel_points_custom_reward_redemption.add` v1) sur la MÊME session WebSocket que `channel.follow`, en évènement générique (le renard s'en servira). La récompense ne saute pas la file de Twitch : un sound joué jusqu'au bout marque le rachat FULFILLED ; aucune page /sounds, fichier absent ou illisible, coupure : CANCELED, les points sont rendus (un son dont le fichier manque reste donc dans la liste : son reward existe chez Twitch). Au démarrage les récompenses de l'app sont dépausées et leurs rachats UNFULFILLED remboursés ; à l'arrêt (fin d'OBS) elles sont mises en pause. Seul le serveur du stream (port 4747) lit les rachats et fait ces trois choses : un serveur d'essai avec un jeton copié rendrait les points d'un son que le vrai serveur joue. `lexique.json` : `reward` (bannis : recompense, prize), `redemption` (bannis : rachat, claim).
**Renoncement.** Piloter des récompenses faites à la main : Twitch répond 403. « Sauter la file » : Twitch marque alors FULFILLED d'office, aucun point ne serait rendu à un son raté. Renommer `FollowFeed…` en flux d'évènements : quatre fichiers touchés pour un nom ; le flux garde ses noms et son commentaire dit qu'il porte aussi les rachats.

## 2026-10-14 — La soundboard : des sons importés dans `data/sounds/`, joués l'un après l'autre par une page `/sounds` ; `sound` et `fader` entrent au lexique

**Contexte.** Alexis veut des sons déclenchés par les points de chaîne, réglés depuis l'onglet « Points de chaîne » (jusqu'ici grisé) et joués dans OBS comme la voix du renard. Cette tranche n'a pas Twitch : elle pose le son, sa lecture et son onglet ; les récompenses viennent ensuite.
**Décision.** Un `sound` est un dossier `data/sounds/<id>/` (`sound.json` écrit en dernier, `audio.mp3|wav|ogg`, 5 Mo au plus, type lu dans les premiers octets et jamais dans l'extension) avec un titre (45 caractères, unique), un coût en points, une `pace` en secondes (0 = aucune) et un `fader` de 0 à 100 %. Le serveur tient la queue (`sound-queue.usecase.ts`) : il donne UN son à la fois à UNE seule page `/sounds` (la plus ancienne connectée), qui répond « fini » ou « raté » (`POST /api/sounds/played`) ; une page qui se ferme ou « Couper le son » arrête le son et vide la queue. « Écouter » joue dans la page des réglages, sans le serveur. `lexique.json` : nouveaux noms `sound` (bannis : son, sfx) et `fader` (banni : volume) ; `queue` couvre aussi les sons en attente, `pace` aussi le temps en secondes avant qu'un son soit rejouable (cooldown est déjà son synonyme banni).
**Renoncement.** La queue dans la page `/sounds` : le serveur ne saurait pas quand un son finit, donc quand rendre les points (tranche suivante). Nommer `fader` « volume » : `volume` est déjà un synonyme banni de `level` (des dB, pas un pourcentage). Un nom `gap` ou `cooldown` pour la `pace` : le lexique a déjà son mot.

## 2026-10-14 — Le renard démarre caché et une page `/fox` qui se connecte ne change plus sa présence : l'évènement `reset` disparaît

**Contexte.** Visible au démarrage et rendu visible (3 min de plus) à chaque connexion d'OBS, il se montrait sans raison dès qu'Alexis rafraîchissait la source.
**Décision.** `toStartPresence` donne `away` (serveur, `createFox` et page : hors de l'écran, sans animation de départ). `/api/fox/events` envoie l'état courant sans rien changer ; `PresenceEvent` et le contrôleur perdent `reset`. La relance compte son silence depuis le démarrage, comme depuis un départ ; il revient par les chemins de H (message accepté, « Faire parler », remerciement, pique ou rappel, annonce de l'horloge).
**Renoncement.** Garder `reset` pour une page qui se connecte : une source OBS rafraîchie le ferait réapparaître. Démarrer visible puis partir tout de suite : on le verrait plonger à chaque démarrage.

---

## 2026-10-14 — Une prédiction résolue donne une phrase aux perdants : `channel.prediction.end` rejoint le flux EventSub, le droit `channel:read:predictions` s'ajoute ; `prediction` entre au lexique

**Contexte.** Alexis veut que le renard commente la fin d'une prédiction (les points perdus par une partie du chat) ; EventSub `channel.prediction.end` est le seul moyen de la voir, avec le jeton d'Alexis, comme les follows et les récompenses.
**Décision.** `prediction` est un `TwitchTopic` de plus (type, version 1, droit `channel:read:predictions`, condition : la chaîne seule) : le flux s'y abonne si le jeton le permet, sinon le journal dit une fois de se reconnecter et l'état des pages porte `missing`, comme pour les récompenses. Seul le statut `resolved` compte (`canceled` est ignoré). Les perdants sont la somme des `users` des issues autres que la gagnante, l'issue citée la plus suivie d'entre elles ; c'est un `LiveEvent` (`prediction`, avec `losers` et `outcome`) remercié sous la case des remerciements, par une phrase de `foxThanksPrediction` (`{perdants}` écrit « 1 personne », « 12 personnes », et `{issue}`), ou de `foxThanksPredictionNoLoser` quand personne n'a perdu. Aucune animation avant la phrase. `lexique.json` : `prediction`.
**Renoncement.** Annoncer le gagnant ou les points : Alexis ne veut que le coup de griffe sur les perdants, et un chiffre de points dit à voix haute se trompe vite. Écouter `channel.prediction.lock` ou `.progress` : ils tombent avant le résultat, et une prédiction annulée y aurait déjà parlé.

---

## 2026-10-14 — Deux récompenses de points de chaîne agissent sur le renard : le flux EventSub n'est plus celui des follows seuls, le droit `channel:read:redemptions` s'ajoute ; `reward`, `clash` et `wake` entrent au lexique

**Contexte.** Alexis veut que ses viewers dépensent des points pour faire piquer Fenysk (« Clasher Fenysk ») ou réveiller le renard (« Réveiller Jean-Renard ») ; EventSub `channel.channel_points_custom_reward_redemption.add` est le seul moyen de les voir, avec le jeton d'Alexis.
**Décision.** `twitch-follows.client.ts` devient `twitch-events.client.ts` (`createEventFeed`, `EventFeedPort`) : une table de `TwitchTopic` (`follow`, `reward`) donne le type, la version et le droit de chaque abonnement, et le flux s'abonne à ceux que le jeton permet ; il ne perd la connexion que si AUCUN abonnement n'a réussi (un refus de la récompense ne coupe pas les follows). Il rend des `LiveEvent` (`onEvent`). `TWITCH_SCOPE` demande les deux droits ; un jeton gardé sans `channel:read:redemptions` écoute les follows, le journal dit une fois de se reconnecter, et l'état des pages porte `missing` (les `TwitchTopic` sans droit), que le bloc « Connexion à Twitch » lit. Le titre de la récompense (`foxClashRewards`, `foxWakeRewards`, une liste, sans casse) choisit ; les autres sont ignorées, le texte joint n'est jamais lu. `clash` : une pique de `foxJabs` (même tirage), tournée vers Fenysk, précédée d'une phrase de `foxClashIntros` (`{user}`), tout de suite, coupée comme la pique, hors de l'écart et du compte de la relance. `wake` : une phrase tournée vers le chat, de `foxThanksWakeAsleep` s'il n'était pas visible (il revient en sautant), sinon de `foxThanksWakeAwake`. Les deux suivent la case des remerciements et leurs règles (pseudo refusé : « quelqu'un »). `lexique.json` : `reward` (banni : redemption), `clash`, `wake`.
**Renoncement.** Un second flux EventSub pour les récompenses : deux WebSocket, deux reconnexions et deux migrations pour le même jeton. Une récompense par réglage (un seul titre) : une liste se règle avec le même champ que les phrases, et permet plusieurs titres. Perdre la connexion dès qu'un abonnement est refusé : une récompense refusée couperait les follows en boucle.

---

## 2026-10-14 — Un raid fait un long coucou puis une phrase au tchat : il vient du tchat (ComfyJS `onRaid`), `raid` entre au lexique

**Contexte.** Un raid entrant est un évènement du live qu'aucun remerciement ne couvre ; Alexis veut que le renard fasse un long coucou puis accueille la bande, avec le nombre de viewers.
**Décision.** Le raid arrive par le tchat : le message `USERNOTICE` `raid` de l'IRC, que ComfyJS donne à `onRaid(user, viewers)` même sans jeton, comme les subs et les cheers. C'est un `LiveEvent` de plus (`raid`, avec `viewers`), remercié sous la case « Remercier les follows, subs et cheers », par une phrase de `foxThanksRaid` (`{user}`, `{viewers}` écrit « 1 personne », « 12 personnes »), ou de `foxThanksRaidGeneric` (`{viewers}`) quand le pseudo est refusé. Avant la phrase : le mode `raid`, les deux images du coucou qui alternent `foxRaidDuration` (3 s), à la place du sourire. `toCount` (pluriel d'un compte) passe de `review.rules.ts` à `phrase.rules.ts` : le bilan, le raid et la prédiction l'écrivent. `lexique.json` : `raid`.
**Renoncement.** EventSub `channel.raid` : il demande la connexion d'Alexis et un abonnement de plus, alors que l'IRC donne le même raid sans jeton et même déconnecté. Réutiliser `wave` avec une durée : sa durée est celle de `foxReactionDuration`, que les réactions et le sursaut partagent.

---

## 2026-10-14 — Son humeur suit le tchat : `attitude` (ordinaire, joyeux, boudeur) change ses regards au repos, la `resume` ouvre le premier message après un long silence ; `attitude` et `resume` entrent au lexique

**Contexte.** Le renard est le même que le chat soit en feu ou mort ; Alexis veut qu'il le montre, sans que cela change autre chose que ses regards et une phrase.
**Décision.** Le serveur décide l'`attitude` à chaque pas de 100 ms et l'envoie aux pages (évènement `attitude`, aussi à la connexion). `cheerful` : `foxCheerfulCount` messages acceptés en `foxCheerfulPeriod` (15 en 5 min) → `front-smile-rest` entre dans la rotation des regards de B, une fois sur trois, jamais deux de suite. `sulking` : le renard est visible et le chat se tait depuis `foxSulkAfter` (90 s, compté depuis le démarrage du serveur) → ses regards se limitent à `right-closed-rest` et `front-closed-rest` ; le silence l'emporte sur la joie. Le chat se tait quand aucun viewer n'écrit, message accepté ou non : le compte de la chaîne et les bots ne comptent pas. La `resume` : le premier message accepté après `foxResumeAfter` (5 min) de silence reçoit la phrase de `foxResumePhrases` (« Ah, maintenant vous parlez ? »), tournée vers le chat, au plus une par 30 min, avant le `welcome` (une seule phrase avant un message). `lexique.json` : `attitude`, `resume` (banni : reprise).
**Renoncement.** `mood` pour `attitude` : déjà banni pour `expression`, le visage de la tête, un autre concept. Ne compter que les messages acceptés pour le silence : un chat qui n'écrit que des emotes n'est pas un chat qui se tait. Une image pour la joie ou la bouderie : les 12 images suffisent.

---

## 2026-10-14 — Des emotes changent la tête du renard : la liste `foxEmoteReactions` rejoint les mots-clés de `reaction`

**Contexte.** Les mots-clés de E sont fixes dans le code ; Alexis veut qu'une emote du chat (LUL, WutFace, Kappa…) donne aussi une réaction, et qu'un message qui n'est fait que d'emotes (rien à lire) ne soit plus muet pour le renard.
**Décision.** `foxEmoteReactions` : une ligne `nom = sourire | choc | clin` par emote (nom exact, majuscules comprises, mot entier), éditable dans l'onglet Renard ; une emote de la liste vaut un mot-clé de sa réaction et suit l'ordre de E (sourire, choc, clin d'œil). Un message d'emotes seules (raison « il ne reste que des emotes » du filtre) montre sa réaction de lui-même (`flash`, comme le sursaut du jeu) : seulement visible, sans rien dans la file, au plus une par 5 s, et il ne fait pas revenir le renard caché. Les mots-clés de E comptent aussi dans ce cas (« <3 » seul). `lexique.json` : le sens de `reaction` s'élargit aux emotes, rien de nouveau.
**Renoncement.** Une liste fixe dans le code : les emotes de la chaîne changent. Réagir à un message d'emotes seules en le lisant : il n'y a rien à lire, et le filtre l'ignore à raison.

---

## 2026-10-14 — Le bilan du live : « Faire le bilan » à la demande, et tout seul après l'annonce de la fin prévue ; `review` entre au lexique

**Contexte.** Alexis veut finir un live sur un résumé de ce qui s'est passé dans le chat, sans compter à la main ; le `tally` a déjà tout ce qu'il faut.
**Décision.** Le `review` se lit dans le `tally` (ses viewers dans l'ordre d'arrivée) : « Ce live : N messages, de M personnes. Le plus bavard : X, avec N messages. Premier arrivé : Y. » ; une partie vide est sautée, un pseudo refusé par le filtre d'insultes n'est jamais dit, personne n'a écrit : rien à dire. Il passe par la file (urgent, jamais coupé, tourné vers le chat) comme une annonce de l'heure du live. Le bouton « Faire le bilan » de l'onglet Renard (`POST /api/fox/review`) le dit à la demande ; l'heure du live le lance une fois par diffusion quand l'annonce de la fin prévue est finie (case `foxShouldReviewAtEnd`, activée). `lexique.json` : `review` (banni : bilan).
**Renoncement.** Passer par « Faire parler » : il parle sans attendre le silence de Fenysk ni la file. Une liste de phrases réglable pour le bilan : ses parties sont fixes, ce qui varie, ce sont les comptes.

---

## 2026-10-14 — Un viewer très impliqué est remercié à 50 messages : `tally` et `talkative` entrent au lexique

**Contexte.** Un viewer qui écrit beaucoup n'a droit qu'au coucou ; Alexis veut le remercier une fois, comme un lurk, sans jamais faire de classement entre les viewers.
**Décision.** Le `tally` compte, par `viewerId`, les messages acceptés (qui passent le filtre, pace et file compris) depuis le démarrage du serveur, en mémoire (comme les lurkers) ; ni le compte de la chaîne ni un bot n'y entrent. Il notifie ses abonnés à chaque message ; les remerciements remercient le viewer `talkative` au premier compte à `foxTalkativeMessages` (50) ou plus, une fois (`foxThanksTalkative`, `{user}` et `{messages}`), sous la case des remerciements, avec les règles des autres (devant les messages, jamais coupé, fait revenir). Un seul seuil, aucun classement. `lexique.json` : `tally`, `talkative` (banni : bavard).
**Renoncement.** Compter dans le fichier des habitués : un redémarrage du serveur est un nouveau live, et 50 messages de la veille ne remercieraient personne. Compter aussi les messages que le filtre ignore : un lien, du spam ou un bot ne sont pas de l'implication.

---

## 2026-10-14 — Le renard reconnaît ses habitués : data/viewers.json garde leur venue, une phrase d'accueil précède leur premier message ; `regular` et `welcome` entrent au lexique

**Contexte.** Le coucou (G) est le même pour tous ; Alexis veut que le renard sache qui revient, qui fête son 25e live et qui est nouveau, sans jamais affirmer ce qu'il ne peut pas prouver.
**Décision.** `data/viewers.json` (hors de git, écrit au plus toutes les 5 s et à l'arrêt, un fichier illisible mis de côté en `.invalid`) garde par login en minuscules `firstSeen`, `lastSeen` et `lives` (jamais un message). Un live de plus = le premier message accepté après `foxWelcomeLiveGap` (6 h) sans message de ce viewer. À ce moment, une phrase tirée sans répéter, dite d'une traite avant le message (après le coucou), dans cet ordre : palier de lives (`foxWelcomeLiveCounts`), retour après `foxWelcomeReturnAfter` (14 jours), la veille (jour calendaire à Paris), tout premier message. Les 14 premiers jours du fichier, ni « nouveau » ni « de retour ». Au plus une phrase par 30 s, pas pour un pseudo refusé par le filtre d'insultes, pas pour le compte de la chaîne ; le fichier se met à jour case décochée. `lexique.json` : `regular` (banni : habitue), `welcome` (banni : accueil).
**Renoncement.** Une entrée de file à part pour la phrase : elle expirerait, se retirerait et se compterait séparément du message qu'elle précède. Un compteur gardé en mémoire : un redémarrage du serveur effacerait tout ce que le renard « sait ».

---

## 2026-10-14 — Le jeu fait sursauter le renard : un pic soudain du son du PC (`spike`) donne le mode `startle` ; `spike` et `startle` entrent au lexique

**Contexte.** Dans un jeu d'action, une explosion ou un cri fait exploser le son du PC ; le renard visible doit sursauter avec Fenysk, sans rien dire. N donne déjà le level du `desktop`.
**Décision.** Un `spike` est un level du desktop qui monte d'au moins `foxStartleRise` (20 dB) en moins de `foxStartleWithin` (300 ms) et dépasse `foxStartleLevel` (-15 dB) ; il se mesure sur les pics bruts de 50 ms (aucun lissage : il est soudain par définition). Le renard prend alors `left-large-rest` le temps d'une réaction (`foxReactionDuration`), tourné vers le tchat (pas de miroir) : mode `startle`, montré de lui-même comme `flinch` (`flash`). Seulement visible, et quand la file est vide (il ne parle pas, ne va pas parler) ; au plus un par `foxStartleGap` (30 s), qu'il ait sursauté ou non. Aucune phrase. `lexique.json` : `spike`, `startle`.
**Renoncement.** Lisser le level comme N : le lissage retombe lentement, il aplatirait la hausse que l'on cherche. Une phrase après le sursaut : le sursaut est un réflexe, le jeu en produit trop.

## 2026-10-14 — Un `!lurk` est remercié comme un follow : `lurk` entre au lexique

**Contexte.** Un viewer qui écrit `!lurk` dit qu'il regarde sans parler ; le renard ne lit jamais une commande, et ne lui répondait donc rien.
**Décision.** Un message dont le premier mot est `!lurk` (majuscules ignorées) devient un remerciement de plus, sous la case « Remercier les follows, subs et cheers » : 1 s de sourire, puis une phrase de `foxThanksLurk` (`{user}`), ou de `foxThanksLurkGeneric` quand le pseudo est refusé par le filtre d'insultes. Il passe par les mêmes règles que les autres remerciements (devant les messages, attend le silence de Fenysk, jamais coupé, fait revenir). Un seul par viewer (`viewerId`) depuis le démarrage du serveur, gardé en mémoire. Le message reste une commande : jamais lu. `lexique.json` : `lurk`.
**Renoncement.** Garder les lurkers dans un fichier : un redémarrage du serveur vaut un nouveau live, et un viewer qui relurke est remercié de nouveau. Un nouvel évènement `LiveEvent` : il vient du tchat, pas d'un service de Twitch, et n'a ni message joint ni paramètre.

## 2026-10-14 — Les rappels dans les silences : la relance alterne pique et rappel, et lit le planning Twitch ; `reminder`, `timetable` et `slot` entrent au lexique

**Contexte.** Le silence de la relance (caché, 3 min sans Fenysk ni tchat) ne donnait que des piques ; Alexis veut aussi y rappeler LivePlace et son prochain live.
**Décision.** Le silence donne tour à tour une pique puis un `reminder` (même écart `foxJabGap`, coupé si Fenysk parle plus d'1 s, mais tourné vers le tchat). Il se tire dans `foxReminders` plus, s'il existe, la phrase du prochain `slot` de la `timetable` (Helix `GET /schedule?broadcaster_id=`, jeton d'application, relue toutes les 30 min ; 404, créneau annulé ou en vacances, pas d'application Twitch ou erreur : pas de créneau, une ligne au journal). Le jeton d'application sort de `twitch-viewers.client.ts` vers `twitch-app-token.client.ts`, partagé avec `twitch-timetable.client.ts` (le même code ne vit qu'à un endroit). `lexique.json` : `reminder` (banni : rappel), `timetable` (banni : planning), `slot` (banni : creneau) ; `timetable` et non `schedule`, qui nomme déjà le minuteur partout.
**Renoncement.** Une seconde relance à part : deux délais et deux files de silence pour la même absence. Dire le planning à chaque rappel : il entre dans le tirage comme une phrase de plus.

## 2026-10-14 — Le renard tient l'heure du live : OBS donne l'état de la diffusion ; `broadcast` et `overtime` entrent au lexique

**Contexte.** Le renard doit annoncer les heures pleines de live, prévenir de la fin prévue, puis pousser Fenysk dehors s'il dépasse ; il ne sait rien du live, et le serveur peut démarrer en plein live.
**Décision.** La `broadcast` vient d'OBS : `GetStreamStatus` à chaque connexion (`outputActive`, `outputDuration`), puis `StreamStateChanged` (STARTED démarre à zéro, STOPPED arrête ; RECONNECTED, une coupure réseau, ne remet pas la durée à zéro). Le renard ne compte que pendant elle : heures pleines (tournées vers le tchat), `foxEndTime` (première occurrence de l'heure après le début), avertissement `foxEndWarning`, fin, puis un `overtime` toutes les `foxOvertimeGap` ; au 3e rappel, une phrase de coucher puis le départ de H (nouvel évènement de présence `leave`, une file qui rend `onDone` à la fin de la phrase), et plus de rappel. Ce qui est déjà passé au démarrage du serveur ou à un changement de réglage n'est pas redit. Bâillements tardifs au repos (visible seulement, sans partir) après la fin prévue, ou après `foxLateAfter` sans fin prévue. Les heures se disent à la française (`spoken-time.rules.ts`). `lexique.json` : `broadcast` (banni : diffusion), `overtime` (banni : rab).
**Renoncement.** Compter depuis le démarrage du serveur : faux en plein live. Rejouer les annonces manquées : des rappels de fin dits d'un coup.

## 2026-10-14 — La balance du son : le renard compare le son du PC à la voix de Fenysk ; `balance` et `desktop` entrent au lexique

**Contexte.** Quand le jeu couvre la voix de Fenysk, le tchat n'entend plus rien et lui ne s'en rend pas compte ; OBS donne déjà le level de toutes les sources (`InputVolumeMeters`), seul le mic était gardé.
**Décision.** Le `desktop` est une seconde source OBS, nommée par `desktopName` (settings.json seulement, comme `micName`, « Audio du bureau » par défaut). La `balance` ne compare que pendant que Fenysk parle (détection de D) : le desktop au moins aussi fort que la voix, à `foxBalanceMargin` dB près (0), pendant `foxBalanceAfter` (10 s) de parole cumulée → alerte (`foxBalanceAlerts`, urgente, jamais coupée par la voix, tournée vers Fenysk), au plus une par `foxBalanceGap` (5 min) ; un silence de Fenysk plus long que `foxBalanceAfter` remet le compte à zéro. Lissage : le pic de chaque source, attaque immédiate et retombée de 1 s (8,7 dB par seconde), pour comparer des pics à des pics sans qu'une syllabe faible ne donne le jeu gagnant. `lexique.json` : `balance`, `desktop` (banni : bureau).
**Renoncement.** Une moyenne glissante : un jeu continu y gagnerait toujours sur une voix faite de syllabes et de pauses. Comparer aussi en silence : un jeu fort est normal quand Fenysk se tait.

## 2026-10-14 — Un monologue de 3 min fait bâiller le renard sans le faire partir, puis parler : `tunnel` entre au lexique

**Contexte.** Quand Fenysk parle des minutes sans pause, le renard ne dit rien : la voix de Fenysk seule ne le fait jamais revenir (H), et rien ne remarque le monologue.
**Décision.** Un `tunnel` est une parole de `foxTunnelAfter` (3 min) sans silence de plus de `foxTunnelPause` (5 s), au plus un par `foxTunnelGap` (10 min) ; ses 3 min repartent de zéro après lui. Visible, le renard bâille (`yawn`, la durée de `foxYawnDuration`, sans partir) puis dit une phrase tirée dans `foxTunnelToFenysk` (tournée vers Fenysk) et `foxTunnelToChat` (tournée vers le tchat), les deux listes tirées ensemble sans répéter. Caché, il revient en sautant pour la dire : seule exception à « la voix de Fenysk seule ne le fait pas revenir ». Le bâillement est un `Show` que le contrôleur montre de lui-même (`flash`), comme le sursaut. `lexique.json` : `tunnel` (banni : monologue).
**Renoncement.** Réutiliser `talkingFor` (le delay de la tête, 250 ms) : une pause entre deux phrases le remettrait à zéro, aucun monologue n'atteindrait 3 min.

## 2026-10-14 — Un cri de Fenysk fait sursauter le renard (`flinch`) et ne le fait parler que s'il est pénible : `shout` et `flinch` entrent au lexique

**Contexte.** Fenysk crie parfois au mic (au-dessus de -5 dB, sa voix forte tient entre -13 et -10 dB) : le renard doit réagir sans commenter chaque cri.
**Décision.** Un `shout` est un level du mic au-dessus de `foxShoutThreshold` ; deux passages à moins de `foxShoutMerge` n'en font qu'un. Visible, le renard se tourne vers Fenysk (miroir) avec `left-large-rest` le temps d'une réaction (`foxReactionDuration`, aucun réglage de durée de plus) : nouveau mode `flinch`. Il ne dit une phrase (`foxShouts`, urgente, jamais coupée par la voix) que si c'est pénible : `foxShoutCount` cris en `foxShoutPeriod`, ou un cri de plus de `foxShoutLong`, au plus une fois par `foxShoutGap`. Caché, un cri ne compte pas et ne le fait pas revenir. `lexique.json` : `shout` (banni : cri), `flinch` (banni : sursaut).
**Renoncement.** Une phrase à chaque cri : elle deviendrait un tic. Une durée de sursaut à part : elle aurait copié celle de la réaction.

## 2026-10-13 — Un message qui attend trop longtemps dans la queue n'est plus lu : `wait` entre au lexique

**Contexte.** Quand Alexis parle longtemps, les messages s'empilent dans la queue et seraient lus des minutes trop tard, hors de propos.
**Décision.** La queue retire un message ordinaire dont le `wait` dépasse `foxReadMaxWait` (2 min, réglable dans l'onglet Renard) et l'écrit dans `server.log` ; un remerciement, le message qui lui est joint et une pique n'expirent jamais. La règle (`hasWaitedTooLong`) est pure, dans `domain` ; l'heure est injectée (`clock`). `lexique.json` : nouveau nom `wait` (bannis : attente, ttl).
**Renoncement.** Faire expirer aussi les remerciements : un follow ou un sub dit tard vaut mieux que jamais.

## 2026-10-13 — Une mention se lit sans arobase : `mention` entre au lexique

**Contexte.** Le renard lisait « arobase Benitoad t'as vu ça » : l'arobase d'une mention n'a rien à faire dans la phrase dite.
**Décision.** Une règle pure de `domain` (`toSpokenMentions`) retire l'arobase, ajoute une virgule quand la mention ouvre le message, et retire du texte lu un nickname cité que le filtre d'insultes refuse. `lexique.json` : nouveau nom `mention` (bannis : arobase, ping).
**Renoncement.** Réécrire le texte brut du message : l'affichage du chat garde « @Benitoad », et la réaction du renard (mots-clés) lit toujours le texte tel qu'il est écrit.

## 2026-10-13 — Le retour de Twitch ramène sur l'onglet Renard : pas de page HTML à part, l'état se lit par `/api/twitch/status`

**Contexte.** Après l'autorisation, Twitch renvoie le navigateur d'Alexis vers `/auth/twitch/callback` ; il faut lui dire si la connexion a marché.
**Décision.** Le serveur traite le retour, puis redirige vers `/settings/fox` : l'onglet montre l'état (« Connecté en tant que … », ou la raison de l'échec) avec le design system, sans page écrite à la main. Les pages ne reçoivent que l'état ; le jeton, lui, ne quitte jamais le serveur.
**Renoncement.** Une page HTML du serveur pour le retour : une interface de plus à tenir, hors du design system.

## 2026-10-13 — Les follows viennent d'EventSub par WebSocket (`channel.follow` v2), avec le compte connecté comme modérateur

**Contexte.** Les follows ne passent pas par le tchat IRC ; Twitch les donne par EventSub, qui demande le jeton d'un modérateur de la chaîne (scope `moderator:read:followers`).
**Décision.** `infra/twitch-follows.client.ts` ouvre `wss://eventsub.wss.twitch.tv/ws`, s'abonne avec `broadcaster_user_id` (la chaîne) et `moderator_user_id` (le compte connecté : Alexis, donc la chaîne), se reconnecte seul (`session_reconnect`, silence de Twitch, coupure), ignore les doublons (`message_id`) et les messages de plus de 10 min. Les évènements arrivent au usecase des remerciements comme ceux du tchat.
**Renoncement.** Un webhook EventSub : il demande une adresse publique, et le serveur n'écoute que sur ce PC.

## 2026-10-13 — La connexion à Twitch : code d'autorisation, `state` contre les faux retours, jeton dans `data/twitch-token.json`, jamais dans le journal ni dans une page

**Contexte.** EventSub demande un jeton d'utilisateur. L'application Twitch existe (identifiants dans `.env`) ; Alexis autorise depuis l'onglet Renard.
**Décision.** Flux « authorization code », retour fixe `http://localhost:4747/auth/twitch/callback` (Twitch le compare à la lettre), `state` aléatoire à usage unique valable 10 min. Jeton dans `data/twitch-token.json` (hors de git, à plat : Biome le laisse tel quel), renouvelé une minute avant sa fin et vérifié chaque heure ; déconnecter le supprime et le révoque chez Twitch. Ni jeton ni secret dans `server.log`, ni dans une réponse à une page.
**Renoncement.** Le jeton dans `settings.local.json` : ce fichier se montre et se copie, un jeton n'y a pas sa place.

## 2026-10-13 — Le sourire d'un follow ou d'un cheer est la réaction existante (`front-smile-rest`, `foxReactionDuration`), pas un mode de plus

**Contexte.** Un follow ou des bits se remercient par 1 s de `front-smile-rest` avant la phrase ; c'est déjà ce que fait la réaction « gg » (E).
**Décision.** Le remerciement demande à la file la réaction `front-smile-rest` (`SMILE_MODE`) : même mode `reaction`, même durée réglable (`foxReactionDuration`, 1 s par défaut), aucun mode ni réglage de plus. Seul le saut de joie du sub a son mode (`joy`) et sa durée (`foxJoyDuration`).
**Renoncement.** Un mode `smile` à part : il aurait copié `reaction` et sa durée.

## 2026-10-13 — `{viewers}` : le nombre de viewers vient de Twitch (Helix, jeton d'application), toutes les 60 s ; sans nombre, la phrase n'est pas tirée

**Contexte.** Des phrases de follow disent « On est {viewers}. » : il faut le nombre de viewers du live en ce moment, même sans la connexion d'Alexis.
**Décision.** `GET https://api.twitch.tv/helix/streams?user_id=<chatChannelId>` (`viewer_count`) avec un jeton d'application (« client credentials », `TWITCH_CLIENT_ID` et `TWITCH_CLIENT_SECRET` de `.env`), rafraîchi toutes les 60 s : un port (usecase) que `infra/twitch-viewers.client.ts` implémente. Live hors ligne, panne, identifiants absents ou nombre nul : le nombre est inconnu et les phrases qui écrivent `{viewers}` sortent du tirage (jamais « On est . » ni « On est 0 »). Aucun jeton ni secret dans le journal.
**Renoncement.** Le jeton d'Alexis (§4) : il faut sa connexion, et le nombre de viewers doit marcher sans elle.

## 2026-10-13 — Contre les rafales de follows : un remerciement nominatif toutes les 10 s, les autres regroupés en une phrase

**Contexte.** Des bots peuvent suivre la chaîne par dizaines en quelques secondes ; le renard ne doit pas remercier chacun par son nom.
**Décision.** Au plus un remerciement nominatif tous les `foxThankGap` (10 s, réglable). Les follows arrivés pendant ce délai sont comptés, puis regroupés en UNE phrase sans pseudo (`foxThanksFollowGeneric`) à la fin du délai. Une règle pure de `domain` (`follow-burst.rules.ts`), testée avec un temps simulé : 10 follows donnent une phrase nominative et une phrase groupée.
**Renoncement.** Ignorer les follows en rafale : un vrai follower arrivé pendant la rafale ne serait jamais remercié.

## 2026-10-13 — Les remerciements : des phrases tirées au hasard, devant les messages, sans être coupées par la voix d'Alexis

**Contexte.** Alexis veut que le renard remercie les follows, les subs (et resubs, et subs offerts) et les cheers par une phrase tirée dans une liste.
**Décision.** Six listes de phrases (`foxThanksFollow`, `…FollowGeneric`, `…Sub`, `…GiftOne`, `…GiftMany`, `…Cheer`), leurs variables `{user}`, `{recipient}`, `{count}`, `{bits}`, `{viewers}`, tirage sans répétition avant d'avoir tout dit. Un remerciement passe devant les messages de la file, attend le silence d'Alexis mais n'est pas coupé par sa voix (comme « Faire parler »), n'est soumis ni au délai par viewer ni à « Lire le tchat » : sa case est `foxShouldThank` (activée). Les pseudos passent par le filtre d'insultes : refusé, un follow prend une phrase sans pseudo, ailleurs le pseudo devient « quelqu'un ». Une série de subs offerts donne UNE phrase (`GiftMany`), pas une par destinataire. Le message joint à un resub ou à un cheer est lu ensuite s'il passe le filtre (sans le pseudo ; les cheermotes `Cheer100` sont retirés).
**Renoncement.** Le délai par viewer pour un remerciement : un sub n'est pas du spam.

## 2026-10-13 — Le saut de joie : un mode `joy`, pour les subs

**Contexte.** Un sub se fête autrement qu'un follow ou des bits (un sourire d'1 s).
**Décision.** Un mode `joy` de plus dans `FoxMode`, avec l'image `front-smile-rest` : le serveur le tient `foxJoyDuration` (800 ms) avant la phrase ; la page dessine un rebond franc (il s'écrase, saute de 9 % de la toile, retombe en s'écrasant un peu, puis retrouve sa taille). Le mode `joy` a la priorité d'une réaction.
**Renoncement.** Un saut plus haut : la marge au-dessus du renard est de 96 px.

## 2026-10-13 — Les subs, resubs, subs offerts et cheers viennent du tchat (IRC), les follows d'EventSub

**Contexte.** Le renard remercie des évènements du live. Vérifié dans ComfyJS 1.1.29 (et tmi.js 1.8.5) : les subs, resubs, subs offerts (un seul ou une série) arrivent par les USERNOTICE du tchat, et les cheers par un message portant des bits, sans jeton (`onSub`, `onResub`, `onSubGift`, `onSubMysteryGift`, `onCheer`). Les follows n'y sont pas.
**Décision.** `infra/chat.client.ts` donne ces évènements au usecase (un évènement `live` dans `ChatSourceEvent`). Un sub offert qui fait partie d'une série (`msg-param-community-gift-id`) est ignoré : la série compte pour un seul évènement. Les follows viennent d'EventSub (§4, avec le jeton d'Alexis). Les cadeaux anonymes ne sont pas donnés par ComfyJS.
**Renoncement.** Un autre client IRC pour les cadeaux anonymes : ComfyJS ne les expose pas, ce serait un deuxième client du tchat.

## 2026-10-13 — La prononciation : les abréviations et « Fenysk » se disent par leur forme parlée, avant la synthèse, pour tout ce que dit le renard

**Contexte.** La voix lit mal les abréviations du tchat (« wtf », « mdr », « gg ») et le nom du streamer (« Fenysk » doit se dire « Fénisque »).
**Décision.** Le réglage `foxPronunciations` est une liste de lignes « abréviation = forme dite » (29 abréviations de tchat et `fenysk = Fénisque` par défaut), modifiable dans l'onglet Renard sous « Prononciation ». `fox.speak` remplace les mots entiers de la liste, sans tenir compte des majuscules et en un seul passage, après avoir nettoyé le texte : le remplacement vaut donc pour les messages, les remerciements, les piques, les pseudos et « Faire parler ». Les réactions de E (« gg », « <3 ») lisent le texte d'origine, avant le remplacement.
**Renoncement.** Remplacer dans le filtre du tchat : il ne verrait plus « gg » ni « <3 », et les insultes déguisées passeraient par des formes parlées.

## 2026-10-13 — Les phrases du renard sont des listes de réglages `fox*`, éditées une phrase par ligne

**Contexte.** Les piques, les remerciements et la prononciation sont des listes de phrases qu'Alexis veut changer sans toucher au code, comme les curseurs : dans l'onglet Renard, effet aussitôt.
**Décision.** Chaque liste est un réglage `fox*` de type liste de textes (`foxJabs`…), dans `settings.json` pour les défauts et `settings.local.json` pour les siennes, modifiable par l'interface (`SettingsChangesSchema` accepte une liste). L'onglet les montre dans un champ multiligne (nouveau composant `TextArea` du design system), une phrase par ligne, envoyé quand le champ perd le focus ; une ligne vide disparaît. Elles font partie du groupe tout-ou-rien `fox*`.
**Renoncement.** Un fichier de phrases à part, comme la liste d'insultes : elle se relit au démarrage, les phrases d'Alexis doivent s'appliquer en direct.

## 2026-10-13 — Il parle à Fenysk : un mode `address`, tourné vers la droite, en miroir

**Contexte.** Le renard parle surtout au tchat, à gauche de l'écran. Pour s'adresser à Fenysk, qui est à droite, il doit se tourner ; ce besoin reviendra avec d'autres déclencheurs.
**Décision.** Un mode générique `address` (de `FoxMode`, avec `reaction` et `wave`) : le serveur le tient du moment où il est revenu jusqu'à la fin de la phrase. La page retourne le corps en 150 ms (échelle horizontale de 1 à -1 en passant par 0), puis toutes les images sont en miroir : le regard à gauche (`left-*`, dont la bouche) regarde à droite. Au repos dans ce mode, l'image est `left-closed-rest`. À la fin de la phrase, il se retourne dans l'autre sens.
**Renoncement.** Des images dessinées pour la droite : douze images de plus, et le miroir donne le même résultat.

## 2026-10-13 — La relance : caché, il revient piquer Fenysk après 3 min de silence total, au plus une fois toutes les 10 min

**Contexte.** Quand ni Fenysk ni le tchat ne disent rien, le renard parti ne revient jamais. Alexis veut qu'il revienne le taquiner (« Je suis parti trois minutes, et t'as rien dit »).
**Décision.** Il est dû quand il est caché, que sa voix (micro d'OBS), n'importe quel message du tchat (même ignoré par le filtre) et son propre départ datent tous de `foxJabAfter` (3 min) au moins, et que la dernière pique date de `foxJabGap` (10 min) au moins ; le silence se compte donc depuis son départ au plus tôt. La pique vient de `foxJabs`, tirée sans répéter avant d'avoir tout dit. Elle entre dans la file avec le mode `address` ; D s'applique : si Fenysk parle plus d'1 s, elle s'arrête et ne reprend pas. Ensuite les règles normales valent : il repart 3 min après sa dernière phrase.
**Renoncement.** Compter le silence depuis la dernière parole seulement : il partirait puis reviendrait aussitôt.

## 2026-10-13 — Il part en trois temps : il s'accroupit, saute, plonge ; `foxLeaveDuration` laisse sa place à trois durées

**Contexte.** Après son bâillement, il glissait vers le bas en 1,5 s. Alexis veut un départ qui se voie : un écrasement, un saut vers le haut, puis un plongeon la tête la première jusqu'à sortir de la source.
**Décision.** `foxCrouchDuration` (300 ms), `foxJumpDuration` (400) et `foxDiveDuration` (800) remplacent `foxLeaveDuration` (leur somme reste 1,5 s) et se règlent dans l'onglet Renard. Le serveur compte la somme (la phase `leaving`) ; la page dessine l'écrasement, le saut (9 % de la toile : c'est la marge au-dessus du renard), puis la chute qui accélère avec une rotation progressive de 0 à 180° autour de son centre. Le retour reste le saut actuel.
**Renoncement.** Un saut plus haut : la source n'a que 96 px au-dessus du renard, il sortirait de la toile.

## 2026-10-13 — La file de parole du renard est un usecase à part : le tchat, les remerciements et les piques y entrent

**Contexte.** Le lecteur du tchat (`fox-chat.usecase.ts`) tient la file, le silence d'Alexis et la coupure. Les remerciements (follows, subs, cheers) et les piques de relance doivent passer par la même file : les remerciements devant les messages et sans être coupés par la voix d'Alexis, chacun avec sa propre animation.
**Décision.** `fox-queue.usecase.ts` tient la file et la lecture ; le lecteur du tchat ne garde que le filtre, le délai par viewer, la taille de la file et la modération. Une entrée dit si elle passe devant (`isUrgent`), si la voix d'Alexis la coupe (`isCuttable`) et ce qu'elle montre avant de parler.
**Renoncement.** Un second lecteur pour les remerciements : deux files diraient chacune « je parle » et se parleraient dessus.

## 2026-10-13 — Une lettre doublée dans la liste d'insultes reste doublée : « Niger » est lu, « conne » et « nigger » sont ignorés

**Contexte.** Les lettres répétées étaient ramenées à une seule, dans le message et dans la liste : « nigger » devenait « niger » (le pays était ignoré) et « conne » devenait « cone » (« =con » ne le trouvait pas).
**Décision.** Une entrée garde ses lettres doublées (trois lettres ou plus comptent pour deux) : le message doit les doubler aussi, mais une lettre seule dans l'entrée accepte d'être répétée à volonté (« saaalope »). Le test de `chat-insults.rules.test.ts` qui attendait la clé « conard » attend « connard ». Entrent dans la liste : `=conne`, et les orthographes courantes sans lettre doublée `conard`, `conasse`, `poufiasse`.
**Renoncement.** « Texte ramené à deux lettres après trois, entrée telle quelle » à la lettre : « cooonnnnaaaard » ne serait plus trouvé.

## 2026-10-13 — Le cache des emotes est un fichier texte, `data/emotes.txt`, pas du JSON

**Contexte.** Biome formate tous les JSON du dépôt, `data/` compris (le gate le lit), et une liste d'emotes écrite d'un trait ne suit pas son formatage : le gate échouait dès que le serveur avait écrit `data/emotes.json`.
**Décision.** Une ligne par liste (`7tv global: EZ Clap`), lue et écrite par deux fonctions pures de `domain` (`toStoredText`, `toStoredEmotes`) ; `infra/emotes.repository.ts` ne fait que lire et écrire le fichier. Un nom d'emote n'a pas d'espace : un nom qui en aurait un n'est pas écrit (le tchat se coupe aux espaces, il ne serait jamais reconnu).
**Renoncement.** Exclure `data/` de Biome (`biome.json`) : c'est toucher au gate pour un fichier que le code écrit.

## 2026-10-13 — Les emotes de 7TV, BTTV et FFZ se synchronisent toutes les heures ; `chatChannelId` entre dans settings.json

**Contexte.** Le renard retire de ce qu'il lit les emotes de 7TV, BTTV et FFZ d'après leurs noms, qu'Alexis tenait à la main (`foxEmoteNames`) : la liste vieillit à chaque emote ajoutée. Les trois services publient leurs emotes globales et celles d'une chaîne, sans jeton.
**Décision.** Le réseau passe par un port (`EmotePort`, usecase) que `infra/emotes.client.ts` implémente par HTTP. Six listes (globales et chaîne, trois services) au démarrage puis toutes les heures ; un 404 vaut « aucune emote » ; en panne, la dernière liste reçue reste (`data/emotes.json`, hors de git). Le filtre utilise la synchronisée plus `foxEmoteNames`. 7TV et BTTV cherchent la chaîne par son identifiant Twitch : `chatChannelId` (68710381), dans settings.json seulement.
**Renoncement.** Un identifiant lu dans le tchat : il n'arrive qu'avec un premier message.

## 2026-10-13 — Les modes du renard (idle, listening, reaction, wave, yawn) et sa présence sont décidés par le serveur

**Contexte.** D (il écoute), E (il réagit), F (il bâille), G (il fait coucou) et H (il s'en va et revient) changent l'image et la place du renard selon le micro d'OBS, la file du tchat et le temps : ce que seul le serveur sait, et qui décide aussi quand la lecture commence.
**Décision.** Un `FoxMode` (idle, listening, reaction avec son image, wave, yawn) et une présence (visible, leaving, away, returning, avec le temps écoulé) partent dans `/api/fox/events` (évènements `mode` et `presence`, aussi à la connexion). Le serveur chronomètre réaction, coucou, bâillement, descente et retour ; la page garde la bouche, le regard, le clignement, la respiration, l'alternance du coucou (250 ms) et la courbe de la descente et du saut. Priorité du CDC : bouche, puis réaction ou coucou, puis écoute, puis bâillement, puis repos. Tant qu'un message attend dans la file (Alexis parle), le renard reste là.
**Renoncement.** Des pages qui décident seules d'après le micro et le tchat : l'aperçu et OBS ne verraient pas la même chose, et la lecture dépendrait de la page qui répond la première.

## 2026-10-13 — L'écoute réutilise la détection de la tête ; neuf réglages `fox*` de plus

**Contexte.** « Alexis parle » est déjà décidé pour la tête (`isLoud`, `isTalking`, `threshold`, `delay`). Le renard n'a pas à en écrire une seconde. H remplace le bâillement de F « après 5 min de silence » par un bâillement avant le départ : le temps se compte depuis la dernière phrase du renard, pas depuis la voix d'Alexis ou le tchat.
**Décision.** `fox-mode.usecase.ts` s'abonne au même `MicPort`, avec les mêmes `threshold` et `delay`. « Se tait depuis 1 s » : 1 s sans level au-dessus du threshold ; « parle plus d'1 s » : en continu, avec le delay. Réglages ajoutés, dans le groupe tout-ou-rien (vingt-sept) : `foxListenMin`, `foxListenMax`, `foxReadSilence`, `foxStopAfter`, `foxReactionDuration`, `foxYawnDuration`, `foxAwayAfter`, `foxLeaveDuration`, `foxReturnDuration`. Mots-clés de E dans le code (`reaction.rules.ts`), ordre du CDC : sourire, choc, clin d'œil.
**Renoncement.** Un `foxTalkThreshold` propre au renard : la tête et le renard entendraient Alexis différemment.

## 2026-10-13 — Les noms de D, E, F, G et H entrent au lexique : mode, listening, reaction, wave, yawn, presence

**Contexte.** Ce que le renard fait en plus de sa bouche n'a pas de mot. `mood` est banni (synonyme d'`expression`) et `rest` aussi (synonyme d'`idle`).
**Décision.** `lexique.json` : six noms, avec leurs synonymes bannis (écoute ; réaction ; coucou, greeting ; bâillement ; absence). Le mode sans rien de particulier s'appelle `idle`, comme la tête au repos.
**Renoncement.** `mood` : l'`expression` de la tête et l'humeur du renard se confondraient dans les noms.

## 2026-10-13 — La liste d'insultes est un fichier versionné, `moderation/insults.fr.txt`

**Contexte.** Le filtre des insultes veut une liste française fournie, que `domain` (pur) ne peut pas lire, et qu'Alexis doit pouvoir relire et compléter.
**Décision.** Un mot ou une expression par ligne, `#` pour un commentaire, `=mot` pour un mot entier seulement (« con », « pd », « tg ») ; sans `=`, l'entrée est cherchée partout dans le message, espaces et signes retirés. `infra` la lit au démarrage (`insults.repository.ts`), `domain` la normalise (accents, 0 en o, 1 en i, 3 en e, 4 en a, 5 en s, @ en a, $ en s, lettres répétées). Le serveur refuse de démarrer sans elle.
**Renoncement.** La mettre dans `settings.json` : des centaines de mots n'ont rien à faire dans les réglages que l'onglet change.

## 2026-10-13 — Le renard lit le tchat : trois contrats bougent

**Contexte.** Pour lire un message, le renard doit recevoir le message brut (viewer, emotes) et les suppressions de la modération, savoir quand une lecture finit, et pouvoir l'arrêter.
**Décision.** `Chat.subscribeSource` (usecase du tchat) rend les évènements de la source tels quels ; `isHidden` se calcule par `toHiddenKind`, une règle commune à l'affichage et au renard. `Fox.speak` rend la durée du WAV, lue dans son en-tête : la file avance à la fin prévue, sans retour des pages. Nouvel évènement `stop` du flux `/api/fox/events`. Six réglages `fox*` de plus (`foxShouldReadChat`, `foxShouldReadOwn`, `foxReadMaxLength`, `foxReadGap`, `foxReadQueueSize`, `foxEmoteNames`) : le groupe tout-ou-rien passe à dix-huit.
**Renoncement.** Que les pages disent la fin d'une lecture : deux pages, aucune page ou un onglet caché, et le serveur ne saurait jamais si la file peut avancer.

## 2026-10-13 — Les noms de la lecture du tchat entrent au lexique : filter, queue, pace, insult, spam

**Contexte.** Le renard décide quels messages lire, dans quel ordre, et dit pourquoi il en ignore. `cadence` est banni (synonyme de `rhythm`), alors que le brief nomme ainsi le délai entre deux messages d'un viewer.
**Décision.** `lexique.json` : cinq noms, avec leurs synonymes bannis (filtre ; fifo, backlog ; throttle, cooldown ; injure, profanity, slur ; flood). Le délai entre deux messages d'un viewer s'appelle `pace`. `message` (le texte d'un viewer) et `speech` (le WAV du renard) restent distincts : le renard dit le texte du message, jamais son nickname.
**Renoncement.** Réutiliser `rhythm` : il mesure le temps entre deux poses de la bouche, pas entre deux viewers.

## 2026-10-13 — Une seule page fait entendre la voix du renard : l'aperçu se tait quand OBS a `/fox`

**Contexte.** « Faire parler » part à toutes les pages connectées, chacune joue le même WAV : l'aperçu des réglages et la source OBS se faisaient écho (un doublon mesuré : chaque page joue une fois, deux pages font deux sons).
**Décision.** Chaque page déclare sa place en se connectant (`/api/fox/events?place=screen|preview`). Le serveur compte les pages `/fox` (`screen`) et envoie le nombre à toutes les pages, à chaque connexion et déconnexion ; `isFoxMuted` (domain) rend l'aperçu muet dès qu'il y en a une. Muet = gain à 0 : la bouche et le rebond suivent le même volume.
**Renoncement.** Un bouton « muet » à régler à la main : Alexis l'oublierait, et l'écho reviendrait en live.

## 2026-10-13 — Les noms du renard entrent au lexique : fox, voice, speech, gaze, blink, breath, bounce

**Contexte.** Jean-Renard (jalon 4, comportements A, B, C) apporte des concepts sans mot : ses 12 images, sa voix de synthèse et le WAV qu'elle produit, son regard, son clignement, sa respiration, son rebond.
**Décision.** `lexique.json` : sept noms, avec leurs synonymes bannis (renard ; voix ; parole, utterance ; regard ; clignement, flicker ; respiration ; rebond). `level` et `threshold` couvrent aussi le WAV du renard (RMS en dB) : mêmes mots, mêmes seuils que le mic. Le couple image + échelle du corps s'appelle `display` : `frame` est banni (synonyme de `pose`).
**Renoncement.** Un mot de plus pour l'intensité du son du renard (`volume` est banni) : un seul `level` pour le mic et pour la voix.

## 2026-10-13 — La voix du renard passe par PowerShell et WinRT dans `infra`, le texte par un fichier

**Contexte.** Les voix voulues (Claude, Caroline, Julie, Guillaume, Paul) sont des voix « OneCore » ; `System.Speech` ne voit que Hortense. Le texte viendra du tchat : il ne doit jamais atteindre une ligne de commande.
**Décision.** `voice.client.ts` lance `powershell.exe -EncodedCommand` (script fixe, `Windows.Media.SpeechSynthesis`). Le texte et la voix sont écrits dans un JSON UTF-8 ; seuls les chemins passent, par variables d'environnement. Les fichiers (`data/fox-speech/`, hors git) sont supprimés après chaque synthèse et balayés au démarrage ; le WAV est servi depuis la mémoire (60 s au plus).
**Renoncement.** Le texte sur stdin : l'encodage de PowerShell 5.1 casse les accents ; et `System.Speech`, qui ne voit qu'une voix.

## 2026-10-13 — Les réglages `fox*` : douze clés tout-ou-rien, et une remise à zéro par onglet

**Contexte.** L'onglet Renard règle chaque durée et chaque seuil de A, B et C, dans `settings.json` (défauts) et `settings.local.json`, comme la tête.
**Décision.** `settings.schema.ts` : `foxVoice` et onze nombres (seuils de la bouche, grande bouche, rebond, respiration, regard, clignement), tous ou aucun comme `idle*`. « Revenir aux valeurs par défaut » n'efface que les clés de son onglet (PUT `null`) : le DELETE vidait aussi celles de l'autre onglet. La page `/fox` reçoit les règles par son propre flux, `/api/fox/events`. L'onglet Renard sort de « Bientôt » : `settings-sections.test.ts` suit.
**Renoncement.** Des clés obligatoires : sept fichiers de test à réécrire pour rien, et un conflit certain avec `feat/chat`.

## 2026-10-13 — Les images du renard vivent dans `public/fox-images/`, recadrées à 648 × 920

**Contexte.** 12 PNG de 1057 × 1008 px ; le renard, poses de coucou comprises, occupe x 260 à 888 et y 96 à 913. Ce sont des fichiers fixes : versionnés, contrairement à `data/heads/`.
**Décision.** Le même cadre (250, 0, 898, 920) pour les 12 : le corps garde son pixel. Les 96 px au-dessus du renard absorbent la respiration et le rebond (plafonnés à 3 % et 8 %). Source OBS conseillée : 648 × 920.
**Renoncement.** Les servir par une route de l'API comme les expressions : un fichier fixe se sert tel quel, avec son cache.
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

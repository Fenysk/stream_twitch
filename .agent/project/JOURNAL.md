# JOURNAL

Append-only. On ajoute en haut, on ne réécrit jamais, on ne supprime jamais.

Une entrée existe pour **une seule raison** : une décision a changé ce que le gate accepte
(architecture.json, lexique.json, un seuil, une règle désactivée). Tout le reste — ce qui a
été fait, ce qui marche — se lit dans le code et dans le gate. Un journal qui raconte le
travail devient un doublon du dépôt, et un doublon dérive.

Format : 5 lignes maximum. Si ça demande plus, la décision n'est pas mûre.

---

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

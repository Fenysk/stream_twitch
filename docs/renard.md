# Jean-Renard

Jean-Renard est le renard qui parle dans OBS. Cette page liste tout ce qu'il fait, quand, et où le régler.

Chaque comportement vient du serveur. La page `/fox` et l'aperçu des réglages montrent la même chose.

## Dans OBS

Jean-Renard est une page OBS de 12 images, avec une voix de synthèse.

- Source OBS : `http://localhost:4747/fox`, taille 648 × 920, fond transparent. Le renard est posé en bas.
- La voix sort par Windows. La case « Contrôler l'audio via OBS » reste décochée ([obs](obs.md)).
- Il respire (4 s), change de regard (toutes les 5 à 15 s) et cligne (toutes les 3 à 6 s, 150 ms). Il ne cligne pas pendant qu'il parle.
- Sa bouche suit le volume de sa voix : fermée, petite, moyenne, parfois grande. Le corps s'écrase et s'étire.
- Ordre de ce qu'il montre : la bouche quand il parle, puis la réaction ou le coucou, puis l'écoute, puis le bâillement, puis le repos.

## Où ça se règle

L'onglet Renard règle presque tout. Un changement s'applique à `/fox` sans rafraîchir la page.

À gauche, l'aperçu en direct, « Faire parler » et « Faire le bilan ». À droite, cinq sous-onglets :

| Sous-onglet | Cartes |
|---|---|
| Voix | Voix, Prononciation |
| Corps | Quand il parle, Au repos, Clignement, Quand il s'ennuie |
| Écoute | Quand tu parles, Réaction et coucou, Lecture du tchat, Relance |
| Évènements | Remerciements, Récompenses de points de chaîne, Habitués, Heure du live |
| Réactions | Humeur du tchat, Quand tu cries, Quand tu parles longtemps, Quand tu reviens, Balance du son, Quand le jeu explose |

Règles communes aux phrases :

- Une liste de phrases s'écrit une phrase par ligne. Chaque liste montre ses variables sous son champ, par exemple `{user}`.
- Une liste se tire au hasard, sans répéter avant d'avoir tout dit.
- Une phrase dont une variable n'a pas de valeur n'est pas tirée. Exemple : `{viewers}` quand le nombre de viewers du live est inconnu.
- Un pseudo refusé par la liste d'insultes n'est jamais dit : il devient « quelqu'un », ou la phrase sans pseudo.

Les valeurs par défaut sont les clés `fox*` de `settings.json`. Celles de Fenysk vont dans `settings.local.json`. « Revenir aux valeurs par défaut » remet les réglages de l'onglet Renard.

## La voix et la file de parole

Toute phrase passe par une file, sauf « Faire parler ».

- Voix : les voix françaises OneCore de Windows, choisies par nom (`foxVoice`), produites par PowerShell. Comptez environ 1 s entre l'ordre et la voix.
- Prononciation : `foxPronunciations`, une ligne `abréviation = forme dite`. « wtf » est dit « what the fuck ». Le mot est entier, sans tenir compte des majuscules.
- « Faire parler » dit une phrase tout de suite, sans attendre le silence de Fenysk. Il est refusé pendant une émission.
- Une phrase de la file part quand Fenysk se tait depuis 1 s (`foxReadSilence`).
- Les annonces passent devant les messages qui attendent, jamais devant celui qu'il lit. Ce sont les remerciements, le clash, le cri, le monologue, le retour, la balance du son, les heures et le bilan.
- Fenysk qui parle plus de 1 s (`foxStopAfter`) coupe la lecture d'un message, d'une pique, d'un rappel ou d'un clash. Elle ne reprend pas.
- Les autres phrases ne sont jamais coupées.
- Une seule page fait entendre la voix. Quand la source OBS `/fox` est connectée, l'aperçu des réglages reste muet. Sinon l'aperçu parle.

## Lire le tchat

Jean-Renard lit le tchat de la chaîne, un message à la fois.

- Il lit le texte du message, jamais le pseudo.
- Une mention se dit sans arobase : « @Benitoad t'as vu ça ? » devient « Benitoad, t'as vu ça ? ». Un pseudo cité qui est refusé est retiré.
- Un message supprimé par un modo, ou ceux d'un viewer banni, sortent de la file. S'il est lu à ce moment, la lecture s'arrête.
- Un message attend au plus 2 min (`foxReadMaxWait`). Ensuite `server.log` écrit « message de Alice expiré ».

Le filtre ignore un message dans cet ordre :

1. Une commande (`!…`) ou un bot de `chatBots`.
2. Un lien, une adresse mail ou un numéro de téléphone.
3. Plus de 150 caractères (`foxReadMaxLength`).
4. Du spam : un mot répété, des lettres répétées, des majuscules au-delà de 15 caractères (`foxCapitalsMaxLength`), un dessin en caractères.
5. Des emotes seules. Les emotes de Twitch, 7TV, BTTV et FFZ sont retirées avant ce test.
6. Une insulte ou un propos haineux de `moderation/insults.fr.txt`. Les chiffres, accents et lettres répétées sont normalisés : « c0nn4rd » est ignoré.

Ensuite deux limites retiennent un message accepté :

- Un message par viewer toutes les 10 s (`foxReadGap`).
- Trois messages au plus en attente ou en lecture (`foxReadQueueSize`). Le quatrième n'est pas lu.

Chaque message ignoré laisse une ligne dans `server.log` avec sa raison et son texte, par exemple `message de Alice ignoré (lien)`.

Réglages, carte « Lecture du tchat » :

- « Lire le tchat » : décoché, plus aucun message n'est lu. « Faire parler » marche toujours.
- « Lire mes messages » : les messages du compte de la chaîne.
- Longueur, majuscules permises, délai par viewer, taille de la file, attente d'un message.
- « Comptes ignorés » : les bots, un compte par ligne (`chatBots`).

Les emotes de 7TV, BTTV et FFZ se synchronisent au démarrage puis toutes les heures. La liste est gardée dans `data/emotes.txt`. `foxEmoteNames` (dans `settings.json`) ajoute des noms à la main.

Pour compléter la liste d'insultes, ajouter une ligne à `moderation/insults.fr.txt` (le format est expliqué en tête du fichier) et relancer le serveur.

## Réaction, coucou et emotes

Avant de lire un message, Jean-Renard peut montrer une image pendant 1 s (`foxReactionDuration`).

- Sourire pour « gg » (mot entier), « <3 » ou « Jean-Renard » (sans tenir compte des majuscules, accents, espaces ni tiret).
- Choc pour « ?! ».
- Clin d'œil pour « ;) » ou 😉.
- Plusieurs mots-clés : le premier de cet ordre gagne (sourire, choc, clin d'œil).
- `foxEmoteReactions` ajoute des emotes à ces mots-clés : une ligne `LUL = sourire`, `choc` ou `clin`.
- Coucou : il lève la patte pendant 1 s à la place de la réaction. C'est au premier message lu de chaque viewer depuis le démarrage du serveur.
- Jamais de coucou pour le compte de la chaîne.
- Un message fait d'emotes seules ne se lit pas, mais montre sa réaction. Il faut que Jean-Renard soit visible, que la file soit vide, et au plus une fois toutes les 5 s.

## Il part et il revient

Jean-Renard sort de l'écran quand rien ne se passe, et revient dès qu'il a quelque chose à dire.

- Au démarrage du serveur, il est caché, sans animation.
- Visible, il part 3 min après la fin de sa dernière phrase (`foxAwayAfter`). Fenysk qui parle seul ne le retient pas.
- Départ : il bâille (2 s), s'accroupit (0,3 s), saute (0,4 s), puis plonge la tête la première (0,8 s).
- Retour : il revient en sautant (0,8 s) dès qu'un message est accepté.
- Il revient aussi pour « Faire parler », un remerciement, une pique, un rappel ou une annonce.
- Tant qu'une phrase attend dans la file, il ne part pas.
- Une page `/fox` qui se connecte ne change pas sa présence.

Les durées sont dans la carte « Quand il s'ennuie ».

## Il écoute Fenysk

Quand Fenysk parle, Jean-Renard ne regarde jamais à gauche, car la gauche est le tchat.

- Il alterne entre face et droite toutes les 2 à 4 s, et il cligne toujours.
- Un message qui arrive pendant ce temps attend dans la file.
- La carte « Quand tu parles » règle le regard, le silence avant de lire (1 s) et la coupure (1 s).

## Il parle à Fenysk

Pour certaines phrases, Jean-Renard se tourne vers la droite de l'écran : l'image est retournée en 150 ms. À la fin de la phrase, il se retourne dans l'autre sens.

Il se tourne vers Fenysk pour :

- une pique, un clash, une phrase de cri ;
- une phrase de monologue ou de retour adressée à Fenysk ;
- une alerte de balance du son ;
- une annonce de fin de live.

Il parle au tchat pour les rappels, les heures pleines et le bilan. Un remerciement ne le tourne pas.

## La relance : pique et rappel

La relance fait revenir Jean-Renard quand tout le monde se tait.

- Condition : il est caché depuis 3 min au moins, et ni Fenysk ni le tchat n'ont rien dit depuis 3 min (`foxJabAfter`). Le tchat compte même s'il est ignoré par le filtre.
- Il attend la première parole de Fenysk depuis le démarrage du serveur avant de compter.
- Il revient en sautant. La première fois, il dit une pique de `foxJabs`, tournée vers Fenysk. La fois suivante, un rappel, tourné vers le tchat.
- Au plus une phrase toutes les 10 min (`foxJabGap`). Une pique tombe donc toutes les 20 min environ.
- Un rappel est une phrase de `foxReminders`, ou le prochain live du planning Twitch : « Prochain live : jeudi à 20 heures. Au programme : … ».
- Liste de piques vide : seuls les rappels continuent.
- Si Fenysk parle plus de 1 s, la phrase s'arrête et ne reprend pas. Ensuite Jean-Renard repart 3 min après.

Le planning Twitch est relu toutes les 30 min avec le jeton de l'application. Une chaîne sans planning n'a pas de rappel de live.

## Remercier

Un évènement du live donne une phrase, tirée dans la liste de son espèce.

| Évènement | Animation avant la phrase | Liste |
|---|---|---|
| Follow | sourire 1 s | `foxThanksFollow`, `foxThanksFollowGeneric` |
| Sub, resub | saut de joie | `foxThanksSub` |
| Sub offert à quelqu'un | saut de joie | `foxThanksGiftOne` |
| Série de subs offerts | saut de joie | `foxThanksGiftMany` |
| Cheer (bits) | sourire 1 s | `foxThanksCheer` |
| Raid entrant | long coucou de 3 s | `foxThanksRaid`, `foxThanksRaidGeneric` |
| `!lurk` | sourire 1 s | `foxThanksLurk`, `foxThanksLurkGeneric` |
| 50e message accepté d'un viewer | sourire 1 s | `foxThanksTalkative` |
| Prédiction terminée | aucune | `foxThanksPrediction`, `foxThanksPredictionNoLoser` |

- Une série de subs offerts donne une seule phrase.
- Le message joint à un resub ou à des bits est lu juste après, s'il passe le filtre. Les cheermotes comme `Cheer100` sont retirés.
- Un remerciement passe devant les messages, attend le silence de Fenysk, et sa voix ne le coupe pas.
- Contre les rafales de follows : un follow nommé toutes les 10 s (`foxThankGap`). Les follows arrivés entre-temps sont regroupés en une phrase sans pseudo.
- `!lurk` et le 50e message (`foxTalkativeMessages`, variable `{messages}`) comptent une fois par viewer et par démarrage du serveur. La commande n'est jamais lue.
- Prédiction : seule une prédiction résolue donne une phrase, avec `{perdants}` et `{issue}`. Sans perdant, « Tout le monde a gagné. C'est louche. »
- La case « Remercier les follows, subs et cheers » (`foxShouldThank`) coupe aussi les récompenses Clasher et Réveiller.
- Les subs, gifts, cheers et raids viennent du tchat, sans jeton. Les follows, récompenses et prédictions demandent la connexion à Twitch ([twitch](twitch.md)).

## Récompenses de points de chaîne

Jean-Renard reconnaît des récompenses par leur titre, sans tenir compte des majuscules. Les listes de titres sont dans la carte « Récompenses de points de chaîne ».

- « Clasher Fenysk » (`foxClashRewards`) : tout de suite, il revient s'il était caché et se tourne vers Fenysk. Il dit une phrase de `foxClashIntros` (`{user}`), puis une pique de `foxJabs`.
- Un clash attend le silence de Fenysk. Il n'attend pas l'écart de la relance et n'y compte pas.
- « Réveiller Jean-Renard » (`foxWakeRewards`) : s'il n'était pas visible, il revient en sautant et dit une phrase de `foxThanksWakeAsleep`. Sinon une phrase de `foxThanksWakeAwake`. Les deux sont tournées vers le tchat.
- « Prout. » (`foxFlinchRewards`) : Jean-Renard se tourne vers Fenysk, la tête choquée. Cela part `foxFlinchDelay` (1 s) après le départ du son de la récompense.
- Une autre récompense joue son son et ses phrases. Le texte joint par le viewer n'est jamais lu.

Les phrases d'une récompense ordinaire se règlent dans l'onglet Points de chaîne ([sons-et-recompenses](sons-et-recompenses.md)).

## Accueillir les habitués

Au premier message d'un viewer dans un live, Jean-Renard peut le saluer d'une phrase. La phrase est dite juste avant son message.

- `data/viewers.json` garde, par viewer, sa première venue, sa dernière venue et son nombre de lives. Jamais ce qu'il écrit.
- Un live de plus commence après 6 h sans message du viewer (`foxWelcomeLiveGap`).
- Un seul cas par accueil, dans cet ordre :
  1. un palier de lives (10, 25, 50, 100) ;
  2. un retour après 14 jours d'absence ;
  3. la venue de la veille ;
  4. le tout premier message.
- « Retour » et « tout premier message » ne jouent qu'une fois le fichier vieux de 14 jours. Plus jeune, il ne prouve pas qu'un viewer est nouveau.
- Au plus une phrase d'accueil toutes les 30 s. Sinon le coucou seul.
- La case « Accueillir les habitués » (`foxShouldWelcome`) coupe la phrase. Le fichier continue de s'écrire.

## Humeur du tchat

Jean-Renard a une humeur qui suit l'activité du tchat. Elle ne joue que s'il est visible, et ne change que son regard au repos.

- Joyeux : 15 messages acceptés en 5 min (`foxCheerfulCount`, `foxCheerfulPeriod`). Le grand sourire entre dans la rotation des regards, une fois sur trois.
- Boudeur : le tchat se tait depuis 90 s (`foxSulkAfter`). Il ne regarde plus vers le tchat.
- Reprise : le premier message accepté après 5 min de silence du tchat (`foxResumeAfter`) reçoit d'abord une phrase de `foxResumePhrases`. Au plus une toutes les 30 min.

## Quand Fenysk crie

Un cri est un niveau du micro au-dessus de `foxShoutThreshold` (-5 dB). Deux passages à moins de 1 s ne font qu'un cri.

- Jean-Renard visible sursaute, tourné vers Fenysk, la tête choquée. Il ne dit rien.
- Il ne parle que si c'est pénible : 3 cris en 2 min, ou un cri de plus de 3 s.
- Il dit alors une phrase de `foxShouts`. Au plus une toutes les 10 min.
- Caché, un cri ne le fait pas revenir et ne compte pas.

## Quand Fenysk parle longtemps

Un monologue est une parole de 3 min sans silence de plus de 5 s (`foxTunnelAfter`, `foxTunnelPause`).

- Jean-Renard visible bâille sans partir, puis dit une phrase de `foxTunnelToFenysk` ou de `foxTunnelToChat`.
- Caché, il revient en sautant pour la dire, sans bâiller.
- Au plus un monologue toutes les 10 min (`foxTunnelGap`).

## Quand Fenysk revient

Le retour est une reprise de parole après au moins 5 min de silence (`foxComebackAfter`). Un micro coupé compte comme du silence.

- Il faut que Fenysk ait parlé au moins une fois depuis le démarrage du serveur.
- Il faut 1 s de voix sur 3 s : une toux ne compte pas.
- Jean-Renard dit une phrase de `foxComebackToFenysk` ou de `foxComebackToChat`. `{absence}` dit la durée d'absence.
- Une seule phrase par absence. La case « Saluer mon retour » (`foxShouldHailComeback`) la coupe.

## Balance du son

Jean-Renard prévient Fenysk quand le son du PC couvre sa voix.

- Il compare les pics de la voix (le micro) et de l'entrée « Audio PC » (`desktopName`), seulement pendant que Fenysk parle.
- Condition : le jeu est au moins aussi fort que la voix (`foxBalanceMargin`, 0 dB), pendant 10 s de parole cumulée (`foxBalanceAfter`).
- Il dit alors une phrase de `foxBalanceAlerts`.
- Au plus une alerte toutes les 5 min (`foxBalanceGap`).

## Quand le jeu explose

Un pic soudain du son du PC fait sursauter Jean-Renard, sans un mot.

- Un pic : une hausse d'au moins 20 dB en moins de 300 ms, jusqu'à plus de -15 dB (`foxStartleRise`, `foxStartleWithin`, `foxStartleLevel`).
- Il faut que Jean-Renard soit visible et qu'il ne parle pas.
- Au plus un sursaut toutes les 30 s (`foxStartleGap`).

## Heure du live et bilan

Pendant que le live OBS est en cours, Jean-Renard tient l'heure. Hors live, il ne dit rien de tout cela.

- Chaque heure pleine : une phrase de `foxHourPhrases` au tchat (`{heures}`).
- Fin prévue (`foxEndAt`) : des avertissements aux paliers de `foxEndWarningMarks` (60, 30, 15, 10, 5, 2, 1 min). Le ton monte avec trois listes : `foxEndWarningPhrases` au-delà de 15 min, `foxEndSoonPhrases` jusqu'à 3 min, `foxEndPanicPhrases` à 2 min et moins.
- À l'heure de fin : une phrase de `foxEndPhrases`, puis le bilan.
- Après la fin : un rappel de `foxOvertimePhrases` à +10 min et un à +20 min (`foxOvertimeGap`). À +30 min, il dit une phrase de `foxBedtimePhrases`, part se coucher, et ne rappelle plus pour ce live.
- Après la fin prévue, ou après 23:30 sans fin prévue (`foxLateAfter`), il bâille au repos toutes les 5 à 10 min, sans partir.
- Ce qui est déjà passé quand le serveur découvre le live, ou quand un réglage change, n'est pas redit.

La fin prévue se règle à trois endroits :

- Onglet Direct, carte « Fin du live », ou Renard > Évènements > Heure du live : un champ `HH:MM`, la prochaine fois qu'elle sonne.
- Touches Stream Deck « Fin du live +10 » et « -10 » ([stream-deck](stream-deck.md)).
- Feuille Live de `/mobile` : « -10 min » et « +10 min » ([telephone](telephone.md)).

Le serveur efface la fin prévue dans trois cas. À l'arrêt du live, si elle est passée. 3 h après elle, hors live. Au début d'un live commencé après elle.

Le bilan dit le nombre de messages acceptés depuis le démarrage du serveur, le nombre de personnes, le plus bavard et le premier arrivé. Un pseudo refusé est sauté.

- À la demande : bouton « Faire le bilan », touche Stream Deck « Phrase », ou « Bilan » dans la feuille Live.
- Il part aussi après l'annonce de la fin prévue, une fois par live, si « Bilan à la fin prévue » est cochée.
- Si personne n'a écrit, il ne dit rien.

## Pendant une émission

Quand l'émission de clips passe à l'antenne, Jean-Renard n'est plus que dans `/show` ([emission](emission.md)).

- Il glisse hors de `/fox` sans bâiller, puis `/fox` et l'aperçu se taisent. « Faire parler » est refusé.
- Les remerciements et les phrases de récompense attendent la fin de l'émission. Un rachat n'est ni perdu ni remboursé.
- Tout le reste est jeté : messages, piques, rappels, cris, heures, bilan.
- À la fin, il revient en sautant. Émission coupée : il dit une phrase de `showGrumblePhrases` avant les remerciements gardés.

## Limites connues

- Sans les clés `fox*` de `settings.json`, Jean-Renard ne s'anime pas et l'onglet Renard le dit.
- La balance du son et le sursaut du jeu lisent l'entrée « Audio PC » seulement. Le son de la « Console de jeu » n'est pas comparé.
- La liste d'insultes se lit au démarrage. Le serveur ne démarre pas sans elle.
- Le nombre `{viewers}` est relu toutes les 60 s. Il est inconnu quand le live est hors ligne, que Twitch ne répond pas ou qu'il n'y a aucun viewer.

## Pour coder

Fichiers clés :

- `src/usecase/fox.usecase.ts` : la voix, les pages connectées, la présence, le mode, l'humeur.
- `src/usecase/fox-mode.usecase.ts` et `fox-queue.usecase.ts` : l'écoute de Fenysk, la file de parole.
- `src/usecase/fox-chat.usecase.ts` : le filtre et la lecture du tchat.
- `src/usecase/fox-<comportement>.usecase.ts` : un fichier par comportement (`jab`, `thanks`, `reward`, `regulars`, `attitude`, `shout`, `tunnel`, `comeback`, `balance`, `startle`, `hours`, `end-reset`, `review`, `tally`).
- `src/usecase/timetable.usecase.ts` : le planning Twitch des rappels.
- `src/domain/*.rules.ts` : la règle pure de chaque comportement (`jab`, `thanks`, `hours`, `shout`, `tunnel`, `comeback`, `balance`, `startle`, `attitude`, `regulars`, `presence`, `reaction`).
- `src/ui/settings/fox-fields.ts` : tous les champs de l'onglet Renard.
- `src/ui/Fox.tsx`, `src/ui/use-fox.ts`, `public/fox-images/` : la page et les 12 images.
- `moderation/insults.fr.txt` : la liste d'insultes.

Routes utiles :

- `GET /api/fox/events` : le flux de la page `/fox` et de l'aperçu (mode, présence, humeur, voix).
- `POST /api/fox/speak` : « Faire parler ». `POST /api/fox/review` : le bilan. `POST /api/fox/end` : décaler la fin prévue.
- `GET /api/fox/voices` : les voix françaises installées.

# JOURNAL

Append-only. On ajoute en haut, on ne réécrit jamais, on ne supprime jamais.

Une entrée existe pour **une seule raison** : une décision a changé ce que le gate accepte
(architecture.json, lexique.json, un seuil, une règle désactivée). Tout le reste — ce qui a
été fait, ce qui marche — se lit dans le code et dans le gate. Un journal qui raconte le
travail devient un doublon du dépôt, et un doublon dérive.

Format : 5 lignes maximum. Si ça demande plus, la décision n'est pas mûre.

---

## 2026-10-19 — Un seul écran Téléphone, étape 1 : la Régie et le Selfie partagent la barre du bas, le tiroir Touches et le retour antenne

**Contexte.** Alexis veut un seul écran Téléphone qui s'adapte à ce que fait le téléphone, pour alléger sa charge mentale en stream. Trois contextes : il ne filme pas (portrait : retour antenne, ligne d'état, chat, barre du bas) ; il filme en main (portrait : sa caméra avec le retour antenne en vignette, ligne d'état, chat, barre du bas) ; il filme posé à l'horizontale (caméra plein écran, boutons minimaux, écran noir). Règles : calme quand tout va bien, alerte seulement quand il faut agir, gestes fréquents sous le pouce, un seul endroit par geste. Quatre étapes : 1 la forme commune Régie/Selfie ; 2 le bouton Filmer et l'orientation remplacent le choix du rôle ; 3 les alertes ; 4 le ménage (QR unique, mot `role`).
**Décision.** `lexique.json` et `architecture.json` ne bougent pas. La grille de touches quitte l'écran de la Régie : une barre du bas sous le chat, au centre, avec « Touches » (primary) ouvre le tiroir qui la contient, comme au Selfie (« Régie » devient « Touches » : même tiroir, même grille). `ControlDock` porte la barre, le tiroir et les feuilles du bandeau (`BannerMenus`, qui garde désormais `MonitorSheet`), sœurs après le tiroir ; `useBannerMenu` porte la feuille ouverte (une seule à la fois) et le poller du retour antenne ; les styles du tiroir quittent `selfie-role.css` pour `control-drawer.css`, `.selfie-open` devient `.control-bar`. Le Selfie reçoit le retour antenne : la vignette 16:9 (`MonitorThumbnail`) dans le coin bas droit de l'aperçu, au-dessus de l'avis de caméra arrêtée, un appui ouvre la feuille « Retour antenne ». Le toast se pose par `--toast-top`, définie par rôle (sous la vignette de la Régie, sous la pastille du numéro au Selfie).
**Renoncement.** Levé : « le retour antenne dans le Selfie » (journal du retour antenne), Alexis le demande le 19/10 pour voir l'antenne en se filmant. Nouveaux : la bande pleine largeur du retour antenne en Régie (Alexis a choisi la vignette) ; un bouton micro dans la barre du bas de la Régie (deux endroits pour un geste : la pastille du bandeau choisit le micro) ; deux copies du tiroir, de sa barre et du câblage des feuilles, que l'étape 2 aurait dû fusionner.

## 2026-10-19 — Le retour antenne abandonne ce qui ne répond jamais : une capture d'OBS après 3 s, une requête du téléphone après 5 s

**Contexte.** obs-websocket-js ne rejette pas un appel resté sans réponse quand OBS se coupe : la capture partagée restait en vol pour tous les téléphones. Une requête HTTP morte (coupure réseau) figeait de même la vignette.
**Décision.** `lexique.json` et `architecture.json` ne bougent pas. `createMonitor` reçoit `schedule` et refuse une capture sans réponse après 3 s (`CAPTURE_LIMIT_MS`), puis en relance une à la demande suivante ; `watchMonitor` abandonne chaque requête après 5 s (`REQUEST_LIMIT_MS`) et redemande `gapMs` plus tard. Le test « pas de 2e requête, même après 10 s » de `monitor-feed.test.ts` devient « avant sa limite de 5 s » (mêmes assertions) : sa promesse était fausse pour une requête morte.
**Renoncement.** Aucune limite, avec un redémarrage du serveur à chaque coupure d'OBS. `AbortSignal.any`, absent de Safari iOS ancien : un `AbortController` par requête.

## 2026-10-19 — Le retour antenne de la régie : une vignette du programme d'OBS en tête du bandeau, en grand dans une feuille, relue par `GET /api/obs/monitor` sans flux de plus

**Contexte.** Alexis veut voir ce qui passe à l'antenne depuis la régie du téléphone, sans revenir au PC.
**Décision.** `lexique.json` gagne le nom `monitor` (bannis « retour » et « projector ») ; `architecture.json` ne bouge pas. `ObsSocket.getSourceScreenshot` capture la scène du programme que `Control` connaît (JPEG 640 px, qualité 60, préfixe `data:` retiré) ; `monitor.usecase.ts` partage la capture en cours et rend un résultat de moins de 200 ms à toutes les demandes : OBS capture au plus ~4 fois/s, quel que soit le nombre de téléphones. `GET /api/obs/monitor` rend le JPEG `no-store`, 502 sans OBS. Le téléphone (`watchMonitor`) redemande une image 1 s après la précédente (vignette), 250 ms feuille ouverte, rien page cachée ou OBS non joint.
**Renoncement.** Un flux SSE ou MJPEG : une connexion longue de plus, déjà refusée pour la régie (3e flux). Deux tailles (`?width=`) : deux captures au lieu d'une partagée. Le retour antenne dans le Selfie : son écran montre déjà sa caméra.

## 2026-10-19 — Couper la caméra d'un téléphone : un bouton qui passe l'image à la tête et garde le micro (`isMicKept`)

**Contexte.** Alexis n'est pas toujours au PC : il veut cacher sa caméra de téléphone sans perdre sa voix, pour que la tête bouge avec.
**Décision.** `lexique.json` et `architecture.json` ne bougent pas. `PictureRequestSchema` gagne `isMicKept` (le micro ne suit pas l'image) : seul le bouton du téléphone l'envoie, le menu de l'image garde « Tête rend le micro au PC ». L'évènement `picture` (`PictureStanding` : place, à l'image, qui l'est) rend le bouton fidèle à l'état réel ; `toCutRequest` choisit l'aller ou le retour. Le micro du live d'un téléphone qui ne filme plus depuis 3 s revient au PC (`toLiveCameraMicId`, `toLostMicId`), la caméra gardée en mémoire même quand son téléphone part de la liste des micros ; `updateMic` coupe aussi les sources de caméra restées ouvertes dont le téléphone est parti.
**Renoncement.** Une route dédiée « couper » : le même `POST /api/obs/picture` avec une option suffit, et le serveur reste seul juge des refus. Reprendre le micro au PC quand une caméra ouverte à la main n'a jamais été le micro du live : Alexis peut avoir coupé le PC exprès.

## 2026-10-19 — Le mic du téléphone prend le traitement vocal d'iOS, et le boost monte plus vite, plus haut, sur une voix jugée avant lui

**Contexte.** Mesures réelles : la voix arrive à −29/−37 dB après un boost de +15 dB, donc vers −45/−50 dB brute. Le mic brut est trop bas, et le boost (3 dB toutes les 4 s, +20 dB au plus) ne rattrape pas.
**Décision.** `lexique.json` et `architecture.json` ne bougent pas. `toCameraConstraints` demande `echoCancellation`, `noiseSuppression` et `autoGainControl` : le traitement vocal d'iOS (comme FaceTime) remonte et nettoie la voix, et la raison « il rogne le son » ne tient plus. Boost : fenêtre de 2 s, cran de 6 dB au plus, plafond +30 dB (le maximum du filtre Gain d'OBS), toujours progressif, jamais sous 0 dB, limiteur inchangé. Le plancher de voix passe de −45 à −55 dB et se juge boost retiré (`toTalkPeak(levels, boostDb)`) : à −45 dB absolu, la voix brute sous le plancher n'était pas comptée et le boost ne partait que des syllabes fortes.
**Renoncement.** Garder le mic brut et tout demander au boost : +30 dB sur du bruit brut remonte aussi le bruit de fond.

## 2026-10-19 — La voix d'un téléphone se remonte seule vers son niveau habituel au PC : un boost par caméra (`cameraBoostTarget`)

**Contexte.** On entend Alexis faiblement au téléphone ; il ne veut pas baisser le PC, seulement remonter le téléphone à son niveau habituel.
**Décision.** `lexique.json` et `architecture.json` ne bougent pas. « Gain » et « volume » sont des synonymes interdits de `level` : le code dit `boost`. `boost.rules.ts` (crêtes de la voix, plancher −45 dB, cran de la moitié de l'écart et 3 dB au plus, de 0 à +20 dB, jamais de baisse) ; `camera-boost.usecase.ts` suit l'entrée du micro du live (le `listen` de la régie) et revoit le boost toutes les 4 s ; `ObsClient.levels` et `ObsClient.boost` (filtres `gain_filter` « Gain (appli) » et `limiter_filter` « Limiteur (appli) » vers −3 dB, posés une fois, un limiteur existant jamais écrasé). `cameraBoostTarget` : settings.json seul.
**Renoncement.** Régler le fader de l'entrée (`SetInputVolume`) : il est celui d'Alexis et monte jusqu'à +26 dB sans limiteur. Redescendre le boost quand la voix dépasse la cible : la demande ne le veut pas, le limiteur tient les crêtes.

## 2026-10-19 — Touche « Image » du Stream Deck : un flux SSE de l'image, et un suiveur de flux partagé avec les réglages

**Contexte.** Alexis veut changer d'image d'une touche et voir qui est à l'image sans attendre une relecture.
**Décision.** `lexique.json` et `architecture.json` ne bougent pas. Action `com.fenysk.stream-twitch.picture` (manifest 0.4.0.0, `CategoryIcon` déjà posé, Node 20) : `PictureFeed` lit `GET /api/obs/picture/events` (image seule, dédoublonnée, `keepalive` toutes les 30 s) ; le suiveur SSE sort de `SettingsFeed` vers `SseFollower` (reconnexion, délai de connexion, journal : mêmes tests, mêmes messages) ; `postServer` factorise l'écriture de `sendPhrase` et de la touche. L'appui envoie `POST /api/obs/picture/next`, le cycle est calculé côté serveur (`toNextPictureId`).
**Renoncement.** Calculer le cycle dans le plugin : il dupliquerait la règle et ne verrait pas la disponibilité des caméras. Relire l'image toutes les 10 s : le flux la redit à chaque ouverture.

## 2026-10-19 — La place caméra côté téléphone : la pastille « Image : … » et le bouton « Hors antenne », avec la liaison vive dite au serveur

**Contexte.** Le serveur sait choisir qui est à l'image ; Alexis veut le faire du bandeau de la régie et du téléphone qui filme.
**Décision.** `lexique.json` et `architecture.json` ne bougent pas. `BannerMenu` gagne `picture` (`PictureMenu`, un `KeyMenu` : mêmes touches que les scènes et les micros, action `picture` → `POST /api/obs/picture`) ; la pastille n'existe que si l'état porte des membres (`hasPicture`). `CameraBadge` fait de « Hors antenne » un bouton (`useTakePicture`, la caméra du téléphone) ; « À l'antenne » reste calculé comme avant. La page `/camera/n` dit sa liaison (`onLink` du récepteur, état `connected`) et le téléphone s'il filme (flux arrêté = faux) par `createLinkReporter`, un message à la fois, redit à chaque réouverture du flux.
**Renoncement.** Détecter une caméra muette par les statistiques WebRTC : l'état `connected` et l'arrêt du flux côté téléphone suffisent à Alexis, et ils se testent sans navigateur.

## 2026-10-19 — La place caméra : choisir qui est à l'image sans changer de scène (réglage `cameraSlotScene`, côté serveur)

**Contexte.** Alexis veut passer de la webcam du PC à un téléphone ou à la tête sans quitter la scène : ses scènes contiennent toutes la scène imbriquée « Master - Webcam ».
**Décision.** `lexique.json` et `architecture.json` ne bougent pas. `cameraSlotScene` (settings.json seul, jamais dans l'interface) désigne la place ; `picture.rules.ts` reconnaît ses membres à leur genre et à leur adresse (capture vidéo = PC, `/head` = Tête, `/camera/n` = Caméra n), `ObsSocket.listPictureItems` et `updateSceneItemEnabled` les lisent et les montrent un seul à la fois, `Control.updatePicture` y ajoute le micro qui suit et le repli sur la tête après 3 s (minuterie `schedule` injectée). Une caméra n'est disponible que si le téléphone filme et que sa page OBS dit sa liaison vive : `POST /api/mobile/link`, `PhoneSummary.isReceiving`.
**Renoncement.** Deviner la disponibilité du PC (OBS ne dit pas si une capture vidéo est muette : toujours disponible). Un retour automatique sur la caméra qui revient : Alexis la reprend à la main.

## 2026-10-19 — La pastille des viewers ouvre la liste des personnes du tchat (Helix `GET /chat/chatters`, droit `moderator:read:chatters`)

**Contexte.** Le nombre de viewers du bandeau ne dit pas qui est là ; Alexis veut la liste depuis le téléphone.
**Décision.** `lexique.json` et `architecture.json` ne bougent pas. `TWITCH_CHAT_VIEWERS_SCOPE` s'ajoute à `TWITCH_SCOPE` (comme `user:write:chat`, hors des topics EventSub) ; `getChatViewersReader` (usecase, `disconnected` ou `missing-scope`), port `ChatViewersPort` et `Control.listChatViewers` (tri par pseudo, `toSortedChatViewers`), client Helix `twitch-chat-viewers.client.ts` (pagination suivie, 401 → un autre jeton une fois), `GET /api/chat/viewers` lu à chaque ouverture de la feuille. Le droit manquant dit « Reconnecte Twitch… : la liste demande une autorisation de plus » sans appeler Twitch. La feuille (`ViewersSheet`, `ChatViewersPanel`) montre le nombre listé, la ligne sur les viewers non connectés, le bouton de rafraîchissement.
**Renoncement.** Garder la liste sur le serveur et la pousser par SSE : Twitch ne prévient pas des arrivées, la lecture à l'ouverture suffit. Compter `total` de Twitch dans l'en-tête : Alexis veut le nombre de personnes listées. Fusionner les deux droits de chat : un jeton qui écrit doit continuer d'écrire sans la liste.

## 2026-10-19 — La pastille « Live » arrête le live, après confirmation (`StopStream`)

**Contexte.** Alexis veut finir le live depuis le téléphone, sans retourner au PC.
**Décision.** `lexique.json` et `architecture.json` ne bougent pas. `ObsSocket.stopStream` (`StopStream`), `ObsControlPort.stopStream` et `Control.stopLive` : refusé (409) quand le live n'est pas en cours (`getBroadcast().isLive`) ou qu'OBS refuse ; `POST /api/obs/stream/stop`. La pastille du live est un `BannerPill` (le bouton des pastilles scène et micro, rendu partagé) seulement pendant le live ; « Arrêter le live ? » est une `StopLiveSheet`, feuille sœur des menus (`BannerMenu` gagne `stop`).
**Renoncement.** Démarrer le live depuis la pastille « Hors ligne » : non demandé, et un démarrage par erreur diffuse en public. Arrêter sans confirmation : un toucher de trop coupe le live.

## 2026-10-19 — Selfie : le bandeau de la régie sort du tiroir et se pose sous l'aperçu

**Contexte.** Alexis veut le live, les viewers, la scène et le micro toujours sous les yeux en Selfie, sans ouvrir « Régie ».
**Décision.** `lexique.json` et `architecture.json` ne bougent pas. L'écran Selfie a quatre rangées (`.selfie-role`) : aperçu (40 % de la hauteur au lieu de 44, le bandeau prend la place), bandeau, tchat, rangée du bas. Le tiroir ne garde que `ControlGrid`. Les menus des pastilles restent sœurs du tiroir, après lui : ils passent dessus.
**Renoncement.** Un bandeau en surimpression de l'aperçu : il cacherait l'image que le Selfie cadre.

## 2026-10-19 — Après l'essai d'Alexis : le mic du Selfie dans la rangée du bas, « Écrire » dans la boîte du tchat, plus de « masqué dans OBS »

**Contexte.** Trois retours du test réel : le mic en haut de l'aperçu est hors de portée du pouce ; « Écrire » sous la boîte du tchat est loin des messages ; la mention « masqué dans OBS » alourdit chaque ligne.
**Décision.** `lexique.json` et `architecture.json` ne bougent pas. `LiveMicButton` sort de `CameraControls` (qui reçoit le bouton en `mic`, pour le rôle Caméra) : le Selfie le met à côté de « Régie », la bascule de caméra reste sur l'aperçu. Le bouton « Écrire » est dans la boîte du tchat, en bas à droite ; la zone des messages lui garde sa place (`--chat-write-room`, que « Nouveaux messages » suit) ; le champ s'ouvre sous la boîte comme avant. `toMarkText` ne dit plus rien d'un message masqué : il reste atténué.
**Renoncement.** Le champ d'écriture par-dessus la boîte : il cacherait les derniers messages avec le clavier. Une pastille « masqué » : l'atténuation suffit à Alexis.

## 2026-10-19 — Le choix du micro passe dans le bandeau et dans le bouton micro des téléphones qui filment : le micro du live vient d'OBS, la piste audio n'est plus coupée sur le téléphone

**Contexte.** Deux touches micro (la page Micros de la grille, le bouton mic local d'un téléphone) disaient deux choses : « Micro du PC / Caméra 1 » ouvert dans OBS d'un côté, la piste audio coupée sur le téléphone de l'autre ; Alexis : « deux touches micro, ce n'est pas intuitif ».
**Décision.** `lexique.json` et `architecture.json` ne bougent pas. Le micro du live est le premier micro ouvert dans OBS (`toLiveMic`, domain : celui du PC avant les caméras, comme l'entrée que la tête écoute). Le bandeau (Régie, tiroir du Selfie) a une pastille « Micro : PC » qui ouvre un menu des micros (`KeyMenu`, la feuille des scènes rendue générique ; le menu des scènes devient le même composant, `BannerMenus` les pose en sœurs du tiroir). La page Micros disparaît : `CONTROL_PAGES` = Sons, Jean-Renard. Le bouton micro des rôles Caméra et Selfie fait la même demande (`toMicToggle` : allumé, il rend le live au PC ; éteint, il prend `camera-<n>`) et son état vient du serveur : évènement `mic` `{ isLive }` du flux du téléphone, calculé par `openPhoneStream` d'après son numéro (`isLiveMicOf`), donc aussi pour une coupure faite à la main dans OBS. `useCameraStream` ne coupe plus la piste audio. Une touche de micro n'est plus rouge quand il est coupé : `KeyState` perd `muted`.
**Renoncement.** Garder la page Micros à côté du menu : deux endroits pour un geste. Un état du bouton tenu sur le téléphone : il se désynchroniserait du menu d'un autre téléphone et d'OBS. Envoyer toute la régie aux Caméras pour un booléen. Rendre le micro au PC quand le téléphone qui l'a se déconnecte : hors de cette demande, le bandeau dit alors « Micro : coupé ».

## 2026-10-19 — Le tchat du téléphone est celui du streamer sur Twitch, pas celui d'OBS : tout y est, les messages masqués et supprimés marqués, collé en bas

**Contexte.** Le tchat de la Régie et du Selfie reprenait la colonne d'OBS : filtrée (bots, commandes, comptes ignorés), limitée à 30 messages, avec une durée de vie, et un message supprimé disparaissait. Le streamer veut lire et répondre comme sur Twitch.
**Décision.** `lexique.json` et `architecture.json` ne bougent pas. Le téléphone n'utilise plus `ChatColumn` (la colonne et son layout `fill` sont retirés) mais `ChatLog` : un état à lui (`PhoneChatState`, `chat-phone.rules.ts`) qui garde tout ce que le flux donne, sans limite, un message supprimé marqué `isDeleted` au lieu d'être retiré ; au snapshot d'une reconnexion, il garde les anciens et marque supprimés ceux que le serveur ne garde plus dans sa fenêtre. Un message est « masqué dans OBS » quand `isHidden` et que `chatShouldShowHidden` ne le montre pas. Le collage en bas est une règle pure (`chat-scroll.ts`) que `useStickyBottom` applique (messages, `ResizeObserver` pour le clavier et les emotes). `CHAT_HISTORY_SIZE` passe de 50 à 200 (l'instantané d'ouverture). `toPhoneLook` devient `toMarkText`.
**Renoncement.** Un second flux pour le téléphone : le même `GET /api/chat/events`, lu par `watchChat`. Un champ `isDeleted` côté serveur : les suppressions arrivent déjà en évènement `delete`. Un tchat illimité côté serveur : 200 messages à l'ouverture suffisent, le reste vient du flux.

## 2026-10-19 — Le plugin Stream Deck lit un flux SSE des réglages (`GET /api/settings/events`) : un changement se voit en moins d'une seconde

**Contexte.** « Fin du live −10 / +10 » touchés depuis le téléphone mettaient jusqu'à 10 s à changer les touches du Stream Deck : le plugin relisait `GET /api/settings` toutes les 10 s.
**Décision.** `lexique.json` et `architecture.json` ne bougent pas. `SettingsStore.subscribe` (usecase) dit chaque nouvel état, d'où qu'il vienne, avant `onChange` ; `GET /api/settings/events` (`toEventStream`) envoie la vue des réglages à la connexion puis à chaque changement, et un `keepalive` nommé toutes les 30 s (le `fetch` de Node 20 coupe un flux muet 5 min). Le plugin lit ce flux avec `fetch` et un lecteur SSE de 40 lignes (`sse-events.ts`), sans dépendance, quand `hasStream` est donné (`plugin.ts`) ; il rouvre le flux 2 s après une coupure, relit alors les réglages, et garde la relecture de 10 s (flux coupé, serveur arrêté, expressions). Une vue du flux plus récente qu'une lecture en cours n'est pas écrasée par elle.
**Renoncement.** `EventSource` (absent de Node 20) ou une dépendance SSE. Arrêter la relecture de 10 s : elle porte les expressions et couvre le flux coupé. Un flux par touche : un seul pour toutes. `hasStream` par défaut : les tests de la relecture gardent leur forme sans flux de plus.

## 2026-10-19 — Les scènes quittent la grille de la régie : un menu s'ouvre depuis la pastille de la scène, sans les scènes « Master »

**Contexte.** Au premier essai d'Alexis, la page Scènes de la grille montre aussi les scènes imbriquées de Master (« Master - Tchat »…), qui ne se passent jamais à l'antenne ; la grille a quatre pages, une de trop.
**Décision.** `lexique.json` et `architecture.json` ne bougent pas. `CONTROL_PAGES` passe à Sons, Micros, Jean-Renard ; la pastille de la scène du bandeau (Régie et Selfie) est un bouton qui ouvre `SceneMenu`, une feuille `ControlDrawer` (générique : nom et texte de fermeture en paramètres) avec les touches de `toSceneKeys`. `toProgramScenes` (domain) retire les noms qui commencent par « Master », casse et espaces de tête exclus. Dans le Selfie, le menu est sœur du tiroir, après lui : il passe dessus (une feuille `fixed` dans l'autre serait cadrée par son `backdrop-filter`). « Fin du live −10 » passe avant « +10 ».
**Renoncement.** Garder la page Scènes en plus du menu : deux endroits pour un même geste. Un `<select>` du design system (`Menu`) : cible tactile et surbrillance de la scène à l'antenne y manquent. Filtrer côté serveur : `ControlState.scenes` reste celui d'OBS, la règle est d'affichage.

## 2026-10-19 — Le témoin « À l'antenne » des caméras part dans le flux du téléphone (évènement `air`), l'écran noir est celui du rôle Caméra

**Contexte.** Étape 4 du CDC mobile : un téléphone qui filme doit savoir si sa caméra est à l'antenne (cadre rouge, pastille), et la Caméra sur trépied doit pouvoir éteindre son écran sans arrêter l'image.
**Décision.** `lexique.json` et `architecture.json` ne bougent pas (« tally » est déjà pris : le compte des messages du chat). `ObsControlState.onAir` (et `ControlState.onAir`) liste les numéros dont une source `/camera/<n>` est visible dans la scène du programme, scènes et groupes compris (`hasVisibleSource`, relu à chaque évènement d'OBS comme le reste de la régie). `openPhoneStream` traduit pour chaque téléphone qui filme : évènement `air` `{ isOnAir }` d'après son numéro courant, seulement quand il change. La pastille « Envoyée à OBS » devient « À l'antenne » ou « Hors antenne ». L'écran noir est un bouton plein écran (`BlackScreen`) du rôle Caméra ; il se lève seul quand la caméra s'arrête.
**Renoncement.** Envoyer tout l'état de la régie aux Caméras : un booléen leur suffit. Un `isOnAir` dans `ObsMics` : ce type parle de micros. Un écran noir pour le Selfie : son écran sert au chat et à la régie. Une minuterie JavaScript pour effacer « Touche pour rallumer » : une animation CSS le fait.

## 2026-10-19 — Le rôle Selfie : une caméra en portrait non recadrée, la régie dans un tiroir, un seul flux pour la caméra et l'état de la régie

**Contexte.** Étape 3 du CDC mobile : Alexis se filme en caméra avant, le téléphone tenu en hauteur, lit le chat, et garde la grille de la régie sous la main sans quitter l'écran.
**Décision.** `lexique.json` et `architecture.json` ne bougent pas. Le Selfie est une caméra (numéro, page `/camera/<n>`, mic dans la page Micros). Il demande l'image en 1080 × 1920 (`CameraOrientation` « portrait » de `toVideoConstraints`), sans recadrage : l'aperçu la montre en entier (`contain`), en miroir pour la caméra avant seulement (`isPreviewMirrored`), jamais pour OBS ; la page `/camera/<n>` la centre déjà en entier. `usePhoneLink` reçoit aussi l'évènement `control` : le Selfie garde un seul flux (la régie, elle, garde `useControlState`). Le tiroir (`ControlDrawer`) est une feuille de la page, toujours montée et masquée en CSS, avec la `Grabber` du design system : un `<dialog>` modal aurait caché le toast de la grille derrière son voile.
**Renoncement.** Recadrer l'image en 16:9 ou en carré : Alexis place l'image dans OBS. Un second flux pour l'état de la régie. Un `<dialog>` modal pour le tiroir. Rendre `useWindowMotion` public : le tiroir n'a besoin d'aucune minuterie.

## 2026-10-19 — La régie du téléphone (rôle `control`) : son état part dans le flux du téléphone, le tchat s'écrit par Helix, l'entrée écoutée suit le mic ouvert

**Contexte.** Étape 2 du CDC mobile : un bandeau (live, viewers, scène), le tchat, « Écrire » et une grille de touches (scènes, sons, micros, Jean-Renard). Un seul mic ouvert à la fois, et la tête et Jean-Renard doivent écouter celui-là : sinon le renard croit Alexis parti quand il parle dans le téléphone.
**Décision.** `lexique.json` : `scene`, `key` (touche) et `grid`. Un `ControlState` (OBS joint, diffusion, viewers, scène et scènes, micros) part en évènement `control` dans `/api/mobile/phone` d'un téléphone Régie : pas de connexion de plus ; `Viewers.subscribe` le nourrit. Quatre POST : `/api/obs/scene`, `/api/obs/mic`, `/api/fox/end`, `/api/chat/send` (`POST /helix/chat/messages`, droit `user:write:chat` ajouté à `TWITCH_SCOPE` hors des topics EventSub : `/api/twitch/status` ne change pas, un jeton d'avant refuse l'envoi en disant de reconnecter Twitch). `ObsSocket.updateInputMute`, et `onSceneChanged` écoute aussi `SceneCreated` et `InputCreated`. L'entrée écoutée (`updateMicName`) se déduit de la coupure des entrées d'OBS (`toListenedInput`) : une coupure faite à la main dans OBS compte aussi ; le réglage `micName` passe par `control.update` et n'écrase plus l'entrée écoutée.
**Renoncement.** Un `canWriteChat` dans `/api/twitch/status` : une trentaine d'attentes de tests sur sa forme changeraient pour un message que l'envoi donne déjà. Un second flux SSE pour la régie : 1 de plus par page. Choisir l'entrée écoutée dans l'appui d'une touche seulement : une coupure à la main la désynchroniserait. Un champ de saisie permanent : l'exigence d'Alexis est un bouton « Écrire ». Le toast visible du design system : il n'existe pas (`ToastAnnouncement` ne fait qu'annoncer), la régie a le sien.

## 2026-10-19 — Les téléphones deviennent des caméras pour OBS : page `/mobile`, image et son en WebRTC direct, mise en relation par le serveur, onglet « Mobile »

**Contexte.** Étape 1 du CDC mobile (19/10) : l'iPhone d'Alexis, ouvert par Tailscale Serve (`mobileOrigin`), filme pour une source OBS. Le serveur n'écoute toujours que `127.0.0.1` ; chaque source caméra prend son hôte (`camera-<n>.localhost`), car les 6 connexions de `localhost:4747` sont prises.
**Décision.** `lexique.json` : quatre mots, `phone` (un téléphone ouvert sur /mobile : son identifiant, son rôle, un numéro s'il filme), `role` (camera, control ou selfie), `camera` (un téléphone qui filme pour OBS, le Selfie en sera une) et `signal` (un message de mise en relation WebRTC : offre, réponse ou candidat). `architecture.json` ne bouge pas. Dépendance `uqr` (QR codes en SVG, zéro dépendance) pour l'onglet « Mobile ». Réglage `mobileOrigin`, lu dans settings.json et non modifiable dans l'interface. Pages `/mobile`, `/camera/$number`, `/settings/mobile` ; API `/api/mobile/{phone,screen,state,signal,number}` : flux SSE (`toEventStream`) et POST JSON, motif `subscribe`. Le téléphone envoie l'offre ; la dernière page ouverte d'un numéro est sa page active ; `iceServers: []`.
**Renoncement.** VDO.Ninja et DroidCam (écartés par le CDC). Un serveur STUN ou TURN, ou un relais de l'image par le PC : le WiFi de la maison suffit. Un WebSocket pour la mise en relation : le motif SSE + POST existe déjà. Un battement pour chasser les téléphones fantômes : le même identifiant remplace son ancienne connexion, ce qui couvre le retour d'un téléphone. Une 7e connexion de `localhost:4747` par caméra : un hôte par caméra. Relever le seuil de duplication ou ignorer `routeTree.gen.ts` : chaque route y ajoute ~24 lignes comptées (les unions `| ''`), les trois d'ici ont fait passer le dépôt à 3,13 % ; l'union `ThanksKey` (15 lignes `| ""` comptées comme copiées) devient un tuple, ce qui laisse 2,86 %, soit de quoi ajouter une route.

## 2026-10-18 — La tête de Fenysk paraît dans `/show` tant qu'il parle : sa vue passe par le flux de l'émission, en évènement SSE nommé `head`

**Contexte.** Alexis veut sa tête (expression, bouche) à gauche de `/show` quand il parle ; `/show` ouvre déjà 3 EventSource, et les 6 connexions de `127.0.0.1:4747` (OBS) ne laissent pas de 4e flux.
**Décision.** `GET /api/show/events?place=page` envoie en plus, à chaque changement de la tête, sa `HeadView` sous le nom `head` (`SHOW_HEAD_EVENT`) : les messages sans nom, l'état de l'émission, restent ceux de l'onglet Émission et de `/countdown`, qui ne se connectent pas avec `place=page`. `watchShowState(isPage, onState, onHead)` ; la page passe la vue par le portail d'expression de `/head` (`createHeadGate`). La tête paraît tant que `isShowLowered(showFader)` : le signal et le délai du son (`TALK_HOLD_MS`), aucun champ d'état de plus. `lexique.json` et `architecture.json` ne bougent pas.
**Renoncement.** Un 4e EventSource vers `/api/head/events` : la 7e requête de la page attendrait sans fin, l'émission se figerait. La vue de la tête dans `ShowState` : tout l'état (clips, rires) repartirait à chaque pas de la bouche, vers l'onglet et `/countdown` aussi. Un `isTalking` dans `ShowState` : deux champs pour un seul instant, qui finiraient par diverger.

## 2026-10-18 — Chaque clip a sa phrase de fin (`endPhrase`) : la phrase des rires n'est plus liée aux sounds

**Contexte.** Jean-Renard disait « Les rires sont enregistrés. Personne n'a ri. » après tout clip dont un rire avait joué, quel que soit le sound posé : Alexis veut, par clip, une phrase de début (`phrase`, sur le carton) et une phrase de fin.
**Décision.** `endPhrase` dans le JSON du clip confirmé (absent à la lecture = vide) et dans `ConfirmRequest`, validé comme `phrase` (vide : il se tait). `ShowSpeakRequest` : `{ kind: "laugh" }` devient `{ kind: "clipEnd", index }`, demandé par `/show` après le clip et ses rires quand `ShowClip.hasEndPhrase` ; le texte reste sur le serveur. `CountdownClip.hasEndPhrase` remplace les rires dans `toRemainingMs`. Un JSON d'avant, sans `endPhrase` et avec des rires, se lit avec `LAUGH_PHRASE` (`toEndPhraseJson`, comme `toLaughsJson`), écrit au prochain « Enregistrer ».
**Renoncement.** Renommer `phrase` en `startPhrase` : tous les JSON changeraient pour un mot. Réécrire les JSON au démarrage : la lecture convertit déjà `laugh`, et le dossier des clips peut changer en route.

## 2026-10-18 — Après une émission finie, OBS passe sur la scène de `showEndScene`

**Contexte.** Alexis veut qu'une émission finie l'envoie seule sur une autre scène, par exemple « Pause », au lieu de rester sur celle de `/show`.
**Décision.** Réglage `showEndScene` (le nom d'une scène d'OBS ; vide : on reste), choisi dans l'onglet Émission parmi les scènes qu'OBS liste (`GET /api/obs/scenes`). Le director demande la scène du programme (`SetCurrentProgramScene`) quand la page rapporte `ended`, seulement là. Une scène absente ou OBS déconnecté : rien ne bouge, le journal le dit.
**Renoncement.** Basculer aussi quand l'émission est coupée (Alexis vient de changer de scène lui-même), après 20 s sans page `/show` ou à l'arrêt du serveur (des pannes, pas une fin). Attendre la fin du fondu de `/show` : la transition d'OBS s'en charge.

## 2026-10-18 — Le retour de Fenysk quitte `/show` pour sa page `/countdown`, le serveur l'estime (`ShowState.returnAt`), l'onglet Émission prévoit la durée

**Contexte.** Alexis veut placer le retour de Fenysk dans OBS comme un widget à part, et voir la durée d'une émission en réglant le nombre de clips.
**Décision.** `ShowState.returnAt` (ms, horloge du serveur, 0 sans émission) : le director le recalcule avec `toRemainingMs` au début (depuis `startsAt`) et à chaque rapport de la page. La page `/countdown` (source OBS sur `countdown.localhost:4747`, un autre hôte pour CEF, donc ses 6 connexions à elle) le lit dans le flux SSE de l'émission ; `/show` ne l'affiche plus, et ses tests du compte à rebours sont réécrits pour ce comportement sans perdre de cas ni d'assertion. Sous « Clips par émission », `toShowLengthMs` donne l'émission la plus courte et la plus longue que le tirage peut faire.
**Renoncement.** `/show` qui envoie sa propre estimation : le temps des rires n'est pas un rapport, et deux calculs dériveraient. `localhost` ou `127.0.0.1` pour la source : leurs connexions servent déjà les autres sources et `/show`.

## 2026-10-18 — Tout le son de l'émission baisse quand Fenysk parle, à 15 % et deux secondes de plus : `clipFader` devient `showFader`

**Contexte.** Testé dans OBS, ne baisser que la vidéo du clip ne suffisait pas : les rires et la voix de Jean-Renard couvraient encore Fenysk.
**Décision.** `ShowState.clipFader` → `showFader` (`TALK_SHOW_FADER`, `toShowFader`, `createShowFader`) : 15 % au lieu de 30 tant qu'il parle, retour à 100 % `TALK_HOLD_MS` = 2 s après sa voix (1 s avant), fondu de 300 ms. Un seul fondu (`toFadingFader`), appliqué à chaque pas aux vidéos, aux rires (fader du rire × fader de l'émission, y compris un rire en cours) et à la voix de Jean-Renard dans `/show` seulement (`useFox().updateFader`, gain Web Audio à 0 si muet, sinon fader / 100). `/fox`, `lexique.json` et `architecture.json` ne bougent pas.
**Renoncement.** Ne baisser que la vidéo : Alexis veut tout. Mettre l'émission en pause quand il parle : elle continue de tourner. Une connexion ou une détection du mic de plus : OBS n'a que 6 connexions vers `localhost:4747`.

## 2026-10-18 — `/show` affiche dans combien de temps Fenysk revient : chaque `ShowClip` porte sa durée gardée (`durationMs`)

**Contexte.** Pendant l'émission, les viewers ne savent pas quand Fenysk revient, et `/show` ne connaît pas la durée gardée des clips.
**Décision.** Le serveur met dans chaque `ShowClip` sa durée gardée en ms (`durationMs`, `end - start`). À chaque temps (ouverture, carton, clip, rires, clôture), `/show` estime le reste avec `toRemainingMs` (`show.rules.ts`) : les clips restants, plus les temps parlés comptés par `toCardMs`, `toLineMs` et `toLaughMs` sur une phrase estimée (`ESTIMATED_SPEECH`). Un bandeau en haut à droite dit « Retour de Fenysk dans 4 min » (minute supérieure), puis « dans moins d'une minute ».
**Renoncement.** Une heure de retour : les viewers n'ont pas tous le même fuseau. La durée lue dans chaque `<video>` : seul le clip suivant est chargé. Un temps « rires » dans `SHOW_PHASES` : le serveur n'en a pas besoin, la page le sait seule.

## 2026-10-18 — Le son des clips baisse quand Fenysk parle : le serveur dit le fader, la page ne fait que fondre

**Contexte.** La voix de Fenysk couvrait le clip dans l'émission ; OBS n'accepte que 6 connexions vers `localhost:4747` pour toutes ses sources.
**Décision.** `ShowState.clipFader` (entier de 0 à 100) part dans le flux SSE existant : le director le recalcule à chaque pas du mic (`FoxModeController.subscribe`, la détection de la tête) avec `toClipFader` — 30 tant que `silentFor < delay + 1000 ms`, sinon 100 — et la page fond vers lui en 300 ms (`toFadingFader`) sur ses deux `<video>`. Les rires et la voix de Jean-Renard ne bougent pas. `lexique.json` et `architecture.json` ne bougent pas.
**Renoncement.** Une seconde détection du mic dans la page, un flux ou un polling de plus, ou Web Audio : la détection existe, et chaque connexion de plus ronge les 6 d'OBS.

## 2026-10-17 — Les sounds et les rewards se règlent à part : le lien sound ↔ reward passe côté reward, dans `data/rewards.json`

**Contexte.** Un sound portait son reward (`rewardId`, `isManaged`, et le titre, le coût et la pace de Twitch) : Alexis a supprimé le sound des rires de l'émission, badgé « Pas sur Twitch », en croyant supprimer une récompense.
**Décision.** `sound.json` ne garde que `title`, `fader`, `format` (l'id du dossier ne change jamais : les rires des clips le désignent) ; `cost` et `pace` sont ceux du reward, sur Twitch. `data/rewards.json` (`{ [rewardId]: { title, sound, isManaged } }`) garde le sound d'un reward (un sound peut servir à plusieurs) et les rewards créés par l'app (`isManaged`) : seuls ceux-là se modifient, se suppriment, se mettent en pause et se remboursent. Deux onglets : « Sons » (`/settings/sounds`) et « Points de chaîne ». Un ancien `sound.json` relié est converti au démarrage. `lexique.json` : le sens de `sound`, `pace` et `reward` suit. Les tests des sons et des récompenses sont réécrits pour ce comportement sans perdre de cas ni d'assertion.
**Renoncement.** Garder le lien dans `sound.json` : supprimer un sound resterait supprimer une récompense. Mettre en pause tous les rewards que Twitch dit gérables : le client id est aussi celui de LivePlace, ses rewards seraient mis en pause et remboursés. Fondre `reward-phrases.json` dans `rewards.json` : un diff bien plus grand pour rien de visible.

## 2026-10-17 — Jean-Renard glisse hors de `/fox` avant l'émission, et râle (`grumble`) quand Alexis la coupe

**Contexte.** Au lancement de l'émission, Jean-Renard disparaissait d'un coup de `/fox` ; coupée en cours, elle le rendait à `/fox` sans un mot.
**Décision.** Au début, sa présence passe à `leaving` sans bâiller (évènement `depart`), `/fox` le cache une fois la sortie jouée, et `ShowState.startsAt` (la fin de la sortie) fait attendre l'ouverture de `/show`. Toute fin, sauf l'arrêt du serveur, le fait revenir en sautant ; la source `/show` cachée en pleine émission fait passer d'abord dans la file une phrase de `showGrumblePhrases` (réglage nouveau, onglet Émission), tournée vers Fenysk, avant les remerciements gardés. `lexique.json` : nouveau nom `grumble`.
**Renoncement.** Retarder l'état « en cours » jusqu'à la fin de la sortie : une source cachée pendant la sortie aurait demandé un état de plus. Une durée réglable : la sortie dure `foxCrouchDuration + foxJumpDuration + foxDiveDuration`, comme hors émission.

## 2026-10-17 — Un curseur règle la force des rires d'un clip : `laughFader` entre dans son JSON

**Contexte.** Au premier test, les rires couvraient le son du clip ; Alexis veut un seul curseur, simple et bien placé.
**Décision.** `laughFader` (entier de 0 à 100 %, absent : 100) dans le JSON du clip et dans `confirm` et `revise`. Un rire joue au fader de son sound × `laughFader` / 100, dans l'aperçu de l'éditeur comme dans `/show`, où le serveur met ce produit dans `ShowLaugh.fader`. Le curseur « Volume des rires » est sous la piste Rires ; un clip brut part de la dernière valeur choisie.
**Renoncement.** Un curseur par rire, ou un seul réglage pour toute l'émission : Alexis a choisi un curseur par clip.

## 2026-10-17 — L'éditeur de clips devient une timeline à pistes, et un clip a plusieurs rires placés

**Contexte.** Alexis veut placer plusieurs rires où il veut dans un clip, aussi simplement que la coupe, puis ajouter d'autres outils de montage (une piste Zoom, plus tard).
**Décision.** Sous le lecteur, une timeline à pistes (règle, lecture commune, piste Coupe = `TrimBar`, piste Rires) où une piste s'ajoute sans refonte. Le JSON d'un clip garde `laughs: [{ at, sound }]`, `at` en secondes sur le clip brut comme `start` et `end` : une recoupe laisse chaque rire sur son moment, un rire hors de la partie gardée n'est pas joué ; un ancien `laugh` se lit comme un rire à `end`. `/show` reçoit chaque rire avec son instant en ms sur le clip confirmé, télécharge chaque fichier de rire une fois avant le clip, les joue au rythme de la vidéo par-dessus son son, garde la dernière image jusqu'à la fin du dernier rire, puis Jean-Renard dit la phrase des rires une fois. Les tests de « Rires à la fin » (`laugh-choice.test.tsx` et ceux qui posaient `laugh`) sont réécrits pour ce comportement sans perdre de cas ni d'assertion ; `lexique.json` ne bouge pas.
**Renoncement.** Un `at` compté depuis le début gardé : une recoupe décalerait les rires de leur image. Télécharger un rire au moment de le jouer : OBS limite ses sources à 6 connexions par hôte, le rire partirait en retard.

## 2026-10-16 — Une récompense de `foxFlinchRewards` choque le renard `foxFlinchDelay` après le départ de son son

**Contexte.** « Prout. » joue déjà un son de la soundboard ; Fenysk veut que Jean-Renard se tourne vers lui, choqué, mais pas au même instant : testé dans OBS, 1 s après le départ du son.
**Décision.** `foxFlinchRewards` (une liste de titres, comme `foxClashRewards`) : le titre d'un rachat qui y figure déclenche `flinch` (`mode.flash`) `foxFlinchDelay` ms (1000 par défaut, 0 : en même temps, lu au départ du son) après que la queue a envoyé le son à la page /sounds (`redeem(…, onPlay)`), tout de suite si la récompense n'a pas de son. La récompense n'est pas réservée : son son et ses phrases restent. `lexique.json` : le sens de `flinch` et de `reward` s'élargit.
**Renoncement.** Un `flinch` au rachat, avant le son : il aurait fini avant que le son ne parte si la queue attend. Un mécanisme réservé comme clash et wake : « Prout. » perdrait ses phrases. Un délai en dur : Fenysk le règle d'après le son.

## 2026-10-16 — La fin prévue garde sa date : `foxEndTime` (« HH:MM ») devient `foxEndAt` (un instant), et le serveur l'efface une fois le live fini

**Contexte.** « 15:00 » n'a pas de date : la fin réglée aujourd'hui s'appliquerait aussi au live de demain. La valeur survit déjà aux redémarrages (settings.local.json), elle doit en plus s'effacer une fois passée.
**Décision.** `foxEndAt` garde le texte ISO d'un instant (`2026-10-16T13:00:00.000Z`), vide : pas de fin ; l'interface et les touches montrent toujours « HH:MM » (taper « HH:MM » donne la prochaine fois qu'elle sonne après maintenant), le plafond des touches passe à 24 h devant maintenant. Un `settings.local.json` qui a encore `foxEndTime` est converti au démarrage, dans le fichier (`upgradeLocalSettings`) : sonnée il y a moins de 3 h, l'heure est celle d'aujourd'hui, sinon la prochaine. `fox-end-reset.usecase.ts` efface `foxEndAt` par un changement de réglage : à l'arrêt du live si elle est passée, 3 h après elle hors live (relu chaque minute), au début d'un live commencé après elle (OBS fermé en plein live : le serveur ne voit pas l'arrêt) ; jamais pendant un live commencé avant elle, ni avant qu'OBS ait dit si le live est en cours. `lexique.json` : le sens d'`overtime` suit le nom du réglage.
**Renoncement.** Garder « HH:MM » et ne vider qu'à l'arrêt du live : un serveur coupé avec OBS en plein live ne verrait jamais l'arrêt. Un nombre (epoch ms) : `SliderKey` en ferait un curseur, et le fichier d'Alexis deviendrait illisible. Effacer au démarrage avant le premier état d'OBS : un serveur relancé en plein live perdrait sa fin.

## 2026-10-16 — L'émission V2, étape 4 : le tchat d'origine, les sursauts du son et les rires enregistrés suivent le clip

**Contexte.** Pendant un clip, `/show` doit remontrer ce que le tchat disait, faire sursauter Jean-Renard sur les coups de son du clip, et jouer des rires à la fin si Alexis l'a choisi.
**Décision.** `GET /api/show/cues?name=&v=` donne, juste avant le clip, son tchat placé sur le clip (`toChatSchedule` : `receivedAt`, `savedAt`, `rawDuration` et le début gardé, avancé de `showChatLead`) et ses spikes. Les spikes se calculent une fois avec ffmpeg (`astats` par fenêtre de 50 ms sur la sortie standard, la même mesure que les levels d'OBS) puis `toSpikes` rejoue le calcul du sursaut du jeu (`isSpike`, `foxStartle*`) ; ils sont gardés dans le JSON (`spikes`), calculés à la validation et à chaque recodage, et à la demande pour un clip d'avant ; `rawDuration`, absente d'un JSON d'avant, se relit dans le clip brut de `Traités`. La page lit la position de la vidéo 10 fois par seconde. Les rires sont un sound de la soundboard (`laugh` dans le JSON, choisi par son titre dans l'éditeur, « Aucun » par défaut) : `/show` le joue elle-même par `/api/sounds/:id/file` avec son fader, puis Jean-Renard dit sa phrase fixe ; un sound supprimé depuis donne pas de rires, sans erreur. `lexique.json` ne bouge pas : `cues` nomme ce que la page reçoit d'un clip (`data` est interdit).
**Renoncement.** Un dossier de fichiers de rires à part : la soundboard les a déjà. Recalculer les spikes quand les règles du sursaut changent : ils restent ceux du dernier recodage du clip.

## 2026-10-16 — L'émission V2, étape 3 : la page `/show` fait tout le déroulé, avec un bandeau de JT et Jean-Renard seul

**Contexte.** Alexis veut qu'une émission vive entièrement dans `/show` (ouverture, clips, clôture, voix de Jean-Renard) et que le carton ressemble à un bandeau de JT sur le clip qui arrive.
**Décision.** `/show` est transparente hors émission. Elle suit l'état du serveur (`GET /api/show/events?place=page`) et déroule chaque nouvelle émission (`runId`) : ouverture, carton puis clip de chacun, clôture, en disant son temps au serveur (`POST /api/show/progress`) ; l'état d'une émission arrêtée coupe aussitôt vidéos, minuteurs et voix. Le carton : la première image du clip, floue et assombrie, un bandeau aux couleurs d'accent du design system glisse depuis la gauche (le jour du clip en petit, le titre en gros), Jean-Renard grand à droite ; le bandeau sort, le flou se lève, le titre passe en petit dans un coin. L'ouverture et la clôture gardent bandeau et Jean-Renard sur le fond sobre du design system. Les phrases viennent du serveur (`POST /api/show/speak` : `opening`, `closing`, `clip` + son indice, jamais le texte) et sortent de `Fox.speakInShow` ; `show.usecase.ts` ne fait plus que les dire. `ShowClip` porte `day` (le jour de l'enregistrement, lu dans le nom du clip brut d'OBS, sinon la date de validation).
**Renoncement.** `GET /api/show/clips` et le tour au hasard sans fin : la liste d'une émission est donnée par le serveur au début, et les moins passés d'abord. Un « Clip 2 sur 5 » à l'écran : le décompte reste dans l'onglet.

## 2026-10-16 — L'émission V2, étape 2 : OBS décide du début et de la fin, le serveur garde l'état et compte les passages

**Contexte.** L'émission ne boucle plus : elle commence quand la page `/show` passe à l'antenne, finit au bout de son déroulé ou dès que la source disparaît. Pas de bouton.
**Décision.** `obs.client.ts` interroge OBS (`GetCurrentProgramScene`, `GetSceneItemList`, `GetGroupSceneItemList`, trois niveaux de scènes imbriquées) 150 ms après chaque évènement de scène, d'élément ou de source, et ne dit que les changements : une source navigateur vers `/show` du port du serveur, visible dans la scène du programme (le mode studio n'y change rien). `show-director.usecase.ts` garde l'état (`idle`, `running`, `over` : finie, la source visible ne la relance pas) : au début il choisit les clips (`showClipCount`, les moins passés d'abord d'après `playCount` du JSON, au hasard entre ex æquo), tient la file puis vide `/fox` ; la page rapporte son temps et son clip (`POST /api/show/progress`, 409 pour une autre émission) et le serveur compte un passage au début du clip. Sans page `/show` connectée (`GET /api/show/events?place=page`) 20 s, l'émission s'arrête. L'onglet lit le même flux et règle le nombre de clips et les phrases d'ouverture et de clôture (`showOpeningPhrases`, `showClosingPhrases`, `showChatLead` sans champ).
**Renoncement.** Suivre les évènements un à un pour tenir la visibilité à jour : l'état se relit en entier, plus sûr qu'un cumul qui dérive. Un bouton « lancer » : le directeur de l'émission est la scène.

## 2026-10-16 — L'émission V2, étape 1 : pendant l'émission, Jean-Renard n'existe que dans `/show`

**Contexte.** L'émission a un début et une fin (V2) ; Alexis veut que Jean-Renard soit alors dans `/show` seulement, sa voix et sa bouche comprises, pas aussi dans `/fox`.
**Décision.** `FoxPlace` gagne `show` : une page de cette place reçoit les règles et sa propre voix (`speakInShow`), jamais le mode, la présence, l'humeur ni les phrases des autres pages. `Fox.updateShow(true)` envoie `{ kind: "show", isOn }` aux places `screen` et `preview` (elles cachent le renard et se taisent) et fait refuser `speak` (409) ; l'arrêt coupe la voix de `/show`. `FoxQueue.hold()` arrête la lecture en cours et ne lit plus rien avant `release()` : les `thanks` (remerciements et phrases des récompenses) attendent la fin et sont lus ensuite, tout le reste (messages, piques, relances, cris, heures, bilan) est jeté, `onDone(false)`. Un rachat n'est donc ni perdu ni remboursé : Twitch le garde UNFULFILLED jusqu'à la phrase.
**Renoncement.** Rembourser les rachats pendant l'émission : elle dure quelques minutes, l'attente est plus simple et le viewer a son point de chaîne comme prévu. Garder aussi les messages du tchat : ils seraient périmés à la fin.

## 2026-10-16 — L'émission de clips : modifier un clip validé, ou le retirer de l'émission

**Contexte.** Alexis veut reprendre un clip déjà validé (début, fin, titre, phrase) sans repasser par le tampon d'OBS, et pouvoir le sortir de la rotation de `/show`.
**Décision.** Le JSON d'un clip confirmé garde `processedName`, le nom réel du clip brut dans `Traités` (il y est renommé ` (2)` quand le nom est pris) ; sans lui (JSON d'avant), `rawName` sert de repli. `POST /api/clips/revise` : titre et phrase seuls réécrivent le JSON sans recoder ; un autre début ou une autre fin recodent depuis le brut de `Traités` (mêmes réglages que la validation), 409 si le brut manque ou si un traitement est en cours. `POST /api/clips/withdraw` : la vidéo, son JSON et son `.chat.json` passent dans `Traités`. Windows refuse `rename` par-dessus un fichier que le serveur garde ouvert (`/show` qui le lit : EPERM, mesuré) mais accepte de le déplacer : la vidéo remplacée part dans `Traités` (sous « (ancienne version) »), puis la nouvelle prend sa place. Les adresses des vidéos de `/show` portent `v=` (date et taille du fichier) : un `/show` qui joue encore l'ancienne version reçoit 404 plutôt que les octets de la nouvelle. `GET /api/clips/processed-video?name=` sert le brut de `Traités` à l'éditeur.
**Renoncement.** Écraser l'ancienne vidéo confirmée : elle part dans `Traités`, rien n'est effacé (Alexis la supprime à la main s'il veut de la place). Relire le brut dans le dossier d'OBS : il n'y est plus.

## 2026-10-16 — L'émission de clips, étape 4 : le serveur garde le tchat de chaque clip sauvegardé par OBS, sans l'afficher

**Contexte.** Alexis veut pouvoir réafficher plus tard, avec un clip, ce que le tchat disait quand il l'a sauvegardé ; le tampon de relecture d'OBS ne garde que la vidéo.
**Décision.** Le serveur garde en mémoire les messages des 3 dernières minutes (à part de l'historique de 50 messages de `chat.usecase.ts`, que lisent les pages). Sur l'évènement OBS `ReplayBufferSaved` (`savedReplayPath`, que `obs.client.ts` reçoit déjà avec `EventSubscription.All`), il attend 10 s (les réactions qui suivent le clic) puis écrit `<nom du clip sans extension>.chat.json` à côté du clip brut : l'heure de la sauvegarde et les messages reçus de [sauvegarde − durée du clip (ffprobe), sauvegarde + 10 s], tels que la page du tchat les reçoit. Seul un clip du dossier `showClipsFolder` est gardé : un serveur d'essai ne touche pas aux clips d'un autre dossier. Le fichier suit le clip : Traités avec lui, copié à côté du clip confirmé (étape 2). L'affichage n'est pas fait.
**Renoncement.** Ranger ces messages dans `data/` : le clip et son tchat restent ensemble. Lire le dossier au lieu de l'évènement : OBS ne dit pas quand le fichier est complet.

## 2026-10-16 — L'émission de clips, étape 3 : la page `/show` enchaîne les clips confirmés en plein écran, avec un carton et la phrase de Jean-Renard

**Contexte.** Les clips confirmés (vidéo et JSON dans Confirmés) doivent passer dans une source OBS de 1920 × 1080 sans que personne ne la pilote.
**Décision.** Page `/show` (fond noir, design system pour le carton) : tour au hasard sans répétition (aucun clip ne repasse avant que tous soient passés, jamais le même d'un tour au suivant ; règle pure dans `show.rules.ts`, liste relue à chaque tirage), fondu au noir, carton du titre pendant que le renard lit la phrase du clip (`mode.say` : sa voix sort de `/fox`), fondu vers le clip, préparé dans un second `<video>` pendant le clip en cours. Le carton dure jusqu'à la fin de la phrase + 0,5 s, au moins 3 s ; sans clip, la page reste noire et relit la liste toutes les 10 s. Routes `GET /api/show/clips` (nom et titre, jamais la phrase), `GET /api/show/video?name=` (flux `Range` de Confirmés) et `POST /api/show/speak` (`{ name }` : le serveur lit la phrase dans le JSON du clip, la fait dire et rend sa durée). Son refusé par le navigateur : repli en muet.
**Renoncement.** `POST /api/fox/speak` avec le texte venu de la page : le serveur garde la phrase, la page ne peut pas faire dire autre chose par ce chemin.

## 2026-10-16 — L'émission de clips, étape 2 : « Valider » recode le clip choisi avec ffmpeg, « Jeter » l'écarte, rien n'est supprimé

**Contexte.** Alexis choisit sous le lecteur le début et la fin d'un clip brut, lui donne un titre et une phrase de Jean-Renard, puis le valide ou le jette.
**Décision.** `ffmpeg` (PATH, `spawn` sans shell) recode la partie choisie à l'image près : filtre `loudnorm` (-16 LUFS, EBU R128), H.264 par `h264_nvenc` (repli sur `libx264` si l'encodeur échoue), AAC, `+faststart`, écrit sous un nom `.partial` renommé à la fin dans `<dossier>\Confirmés\`, puis le clip brut passe dans `<dossier>\Traités\`. À côté du clip confirmé, un JSON de même nom (titre, phrase, début, fin, nom du clip brut, date) : un clip confirmé est une vidéo avec son JSON, ensemble, jamais dans `data/`. Un clip à la fois (409 sinon) ; en cas d'échec le clip brut ne bouge pas et ce que l'essai a créé part. Routes `POST /api/clips/confirm` et `POST /api/clips/discard` (le clip brut part dans Traités, sans clip confirmé).
**Renoncement.** Supprimer les clips jetés ou traités : rien n'est jamais effacé du disque (seul un fichier partiel d'un recodage raté l'est). Recoder avec `libx264` seulement : `h264_nvenc` (RTX 3070) est le plus rapide pendant un live, `libx264` ne reste que le repli.

## 2026-10-16 — L'émission de clips, étape 1 : l'onglet « Émission » liste les clips bruts d'OBS et les sert en flux

**Contexte.** Alexis sauvegarde les 2 dernières minutes du stream (tampon de relecture d'OBS) dans `C:\Users\alexi\Videos\Clips OBS` ; il veut les trier, les couper et les rejouer dans une source OBS (`/show`, étapes 2 à 4 de la V1).
**Décision.** Nouvelle dépendance externe : les binaires `ffprobe` (durée, étape 1) puis `ffmpeg` (étape 2), cherchés dans le PATH, lancés par `spawn` avec un tableau d'arguments, jamais par un shell. Réglage `showClipsFolder` (défaut dans settings.json, surchargeable dans settings.local.json, sans champ d'interface en V1). Routes `GET /api/clips` (liste et nombre de clips confirmés) et `GET /api/clips/video?name=` (flux disque avec `Range`, réponse 206, jamais le fichier entier en mémoire) ; le client désigne un clip par son nom, que le serveur n'accepte que s'il est un fichier vidéo (.mp4, .mkv, .mov) direct du dossier. `lexique.json` : nouveaux noms `clip` (un fichier vidéo du dossier : brut tant qu'il y reste) et `trim` (le début et la fin gardés d'un clip).
**Renoncement.** `show` n'entre pas au lexique : `Show` (fox-mode.rules) nomme déjà autre chose chez le renard, l'émission ne se nomme que par sa route, son onglet et le préfixe `show` de ses réglages. Un `<video>` qui lit un chemin disque : le navigateur n'a pas accès au disque, le serveur le sert.

## 2026-10-16 — La relance attend la première parole de Fenysk depuis le démarrage

**Contexte.** Au démarrage du serveur, 3 min après (`foxJabAfter`), le renard piquait Fenysk qui n'avait encore rien dit : la voix jamais entendue comptait comme un silence infini, et `jab.rules.test.ts` figeait ce comportement.
**Décision.** `isJabDue` exige une voix déjà entendue (`voiceSilentFor` fini) : la pique et le rappel, qui partagent ce minuteur, attendent la première parole ; ensuite le silence se compte depuis sa dernière parole, comme avant. Le clash de la récompense n'est pas lié au silence et ne change pas. L'assertion de `jab.rules.test.ts` est inversée à la demande d'Alexis ; la plomberie de test de `fox-mode.usecase.test.ts` gagne une option `isHeard`.
**Renoncement.** Compter le silence depuis le démarrage : c'était le défaut.

## 2026-10-15 — Le retour de Fenysk demande 1 s de voix sur 3 s : une toux ne finit pas l'absence

**Contexte.** Le premier level du mic au-dessus du threshold suffisait à finir l'absence : une toux ou un bruit de pièce déclenchait la phrase de `comeback`.
**Décision.** Le retour compte quand la voix de D (`isTalking`, mic non coupé) cumule 1 s sur les 3 dernières secondes ; avant, l'absence continue et sa durée dite court depuis le dernier vrai silence. Deux constantes dans `comeback.rules.ts`, aucun réglage ; un pas de 100 ms en retard ne compte pas plus de 250 ms. `lexique.json` : le sens de `comeback` suit.
**Renoncement.** Un réglage dans l'onglet Renard : un seuil de plus à expliquer pour une valeur qui ne bouge pas. `talkingFor` : il exige une parole continue, la consigne est une parole cumulée.

## 2026-10-15 — Jean-Renard salue le retour de Fenysk après une absence de sa voix : `comeback` entre au lexique, le client OBS suit la coupure du mic

**Contexte.** Alexis veut que le renard le salue d'une phrase moqueuse quand il reparle après des minutes de silence. Un mic coupé dans OBS doit compter comme muet ; OBS ne garantit pas ce que `InputVolumeMeters` envoie pour une source coupée, et la session de code n'a pas pu le constater en direct (OBS exige son mot de passe).
**Décision.** `comeback` : la voix de Fenysk (le `silentFor` de D, aucun second détecteur) est muette depuis `foxComebackAfter` (5 min), le serveur l'ayant déjà entendue depuis son démarrage ; quand il reparle, une seule phrase par absence, tirée sans répétition dans `foxComebackToFenysk` (miroir) et `foxComebackToChat`, avec `{absence}` (« 12 minutes »). Urgente, jamais coupée par sa voix, elle attend son silence et fait revenir le renard ; la case `foxShouldHailComeback` l'active. Le client OBS lit `GetInputMute` à la connexion et écoute `InputMuteStateChanged` : une entrée coupée rend le level plancher (-100 dB), pour le mic comme pour le desktop. `lexique.json` : nouveau nom `comeback` ; `absence` reste banni (`presence`), le code dit `gone`.
**Renoncement.** Se fier à `InputVolumeMeters` seul pour un mic coupé : non constaté en direct, et un bruit de pièce compterait comme un retour. Un second détecteur de voix pour le retour : deux définitions de « Fenysk parle ».

---

## 2026-10-15 — Biome ne lit plus les fichiers ignorés par git : `vcs.useIgnoreFile`

**Contexte.** Le gate échouait au lint dès que le serveur réécrivait `settings.local.json` (tableau `foxEmoteReactions` sur plusieurs lignes, Biome le veut sur une ligne). Le lint lisait aussi les JSON de `data/`, écrits comme lui par `src/infra` avec `JSON.stringify(…, null, 2)` : le vert dépendait des réglages du poste, pas du code.
**Décision.** `biome.json` : `vcs` activé (`clientKind: "git"`, `useIgnoreFile: true`), Biome saute ce que `.gitignore` ignore ; `files.includes` ne change pas. Mesuré avec `biome check --verbose` : 510 fichiers lus avant, 499 après, les 11 retirés sont dans `data/` ou `settings.local.json`, aucun n'est versionné. Un fichier ajouté de force malgré `.gitignore` sortirait aussi du lint : `git ls-files -ci --exclude-standard` les liste (vide ce jour).
**Renoncement.** Écrire le JSON au format Biome : six dépôts de `src/infra` à toucher, et la largeur de 110 colonnes à reproduire à la main. `!settings.local.json` dans `files.includes` : `data/` resterait lu, et chaque nouveau fichier local demanderait sa ligne.

---

## 2026-10-15 — Le plugin Stream Deck pilote les réglages du serveur : quatre actions génériques (Interrupteur, Cycle de valeurs, Phrase, Préréglage) et un inspecteur de propriétés React

**Contexte.** Alexis veut couper la lecture du tchat, passer la taille du texte à 32 px, changer d'expression, lancer un préréglage ou faire dire une phrase au renard depuis une touche, sans ouvrir `localhost:4747` en plein live. Une action par réglage ferait des dizaines d'entrées au manifest ; chaque touche choisit donc son réglage, ce qui demande une interface : l'entrée précédente renonçait à un inspecteur pour un port qui ne bouge pas, ici chaque touche a un réglage et des valeurs à choisir.
**Décision.** Les quatre actions partagent `ui/inspector.html`, construit par `streamdeck/vite.inspector.config.ts` dans le `.sdPlugin` (un seul fichier, scripts, styles et police dedans : le panneau s'ouvre depuis le disque, où le navigateur refuse module, CORS et fichiers voisins), hors de git et de Biome comme `bin/`. C'est une page React qui reprend `src/ui/design/` (apparence sombre forcée, Nunito). Elle ne parle jamais au serveur : le serveur n'ajoute aucun CORS, le JSON obligatoire de `http.ts` protège `PUT /api/settings` ; elle demande le catalogue au plugin (`sendToPlugin`), qui lit le serveur et répond (`sendToPropertyInspector`). Les touches montrent l'état réel : un seul minuteur de 10 s et une seule lecture de `GET /api/settings` pour toutes les touches visibles, la réponse d'un `PUT` réussi met à jour toutes les touches, et un appui relit d'abord le serveur pour agir sur la valeur effective du moment. Ce qu'une touche peut piloter (réglages offerts, forme de ce qu'elle garde, messages inspecteur-plugin) et les règles pures (valeur suivante, inverse, préréglage actif, valeur permise par le schéma du réglage) vont dans `src/domain/deck.schema.ts` et `deck.rules.ts`, sous tout le gate ; les libellés (lus dans les tables de l'interface), le minuteur, les requêtes et les classes du SDK dans `streamdeck/src/`. `tsconfig.json` et `vitest.config.ts` couvrent aussi `streamdeck/src/**/*.tsx`. `lexique.json` et `architecture.json` ne bougent pas.
**Renoncement.** Une action par réglage : un manifest de dizaines d'entrées, et chaque réglage de plus serait une version du plugin. `sdpi-components` : un second langage visuel à côté du design system. Un CORS sur le serveur pour que l'inspecteur l'appelle lui-même : n'importe quelle page web pourrait alors changer les réglages. Relire le serveur seulement à l'appui : la touche mentirait jusqu'au prochain appui quand Alexis change un réglage sur sa page.

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
**Décision.** `lexique.json` : nouveaux noms `chat`, `message`, `viewer`, `nickname`, `emote`, `fragment`, `command`, `bot`, avec leurs synonymes bannis (tchat, msg, pseudo, username, spectator, chatViewer, emoticon, smiley, segment, piece, cmd, robot…). Un ban et un timeout s'écrivent pareil dans le code : `viewer-messages-deleted`, les messages du viewer sortent de l'écran.
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

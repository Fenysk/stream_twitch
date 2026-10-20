# Téléphone (`/mobile`)

La page `/mobile` fait d'un téléphone une caméra pour OBS et une régie : scène, Plan, micro, sons, tchat. L'écran est le même, que le téléphone filme ou non.

## Ouvrir la page

La page s'ouvre en HTTPS par Tailscale. Safari ne donne la caméra et le micro qu'en HTTPS.

1. Mettre le téléphone sur Tailscale.
2. Ouvrir l'onglet Mobile des réglages.
3. Scanner le QR code du rôle voulu avec l'appareil photo du téléphone.
4. Autoriser la caméra et le micro quand Safari le demande.

L'adresse est `mobileOrigin` + `/mobile`, par exemple `https://pcmasterrace.tail2d6b0a.ts.net/mobile`. Tailscale Serve relie cette adresse à `http://127.0.0.1:4747`. Le serveur n'écoute que `127.0.0.1`.

`mobileOrigin` n'est pas dans l'interface. Sans lui, l'onglet Mobile demande de l'écrire dans `settings.json`, puis de relancer le serveur.

Testé avec Safari sur iPhone. Android n'est pas testé.

## Un seul onglet par téléphone

Tous les onglets Safari d'un même téléphone partagent son identifiant. Un seul onglet est actif à la fois.

- Le dernier onglet ouvert, ou ramené au premier plan, prend la main.
- Les autres arrêtent leur caméra, leur flux avec le serveur et leurs liaisons WebRTC.
- Ils affichent « Ouvert dans un autre onglet », avec le bouton « Reprendre ici ».
- Un onglet ouvert en arrière-plan ne prend pas la main avant d'être au premier plan.

Le navigateur choisit le mécanisme (`src/ui/mobile/active-tab.ts`) :

1. Web Locks, réservé aux contextes sécurisés (HTTPS).
2. Sinon un `BroadcastChannel` : chaque prise de main est annoncée, la plus récente gagne.
3. Sinon rien : l'onglet reste actif.

## Où ça se règle

Le téléphone ne règle rien : tout se règle sur le PC, dans l'onglet Mobile.

- Les QR codes qui ouvrent chaque rôle.
- Les adresses des deux sources OBS (image et mic) de chaque caméra connectée et de la prochaine libre, avec « Copier ».
- Les téléphones connectés : « Caméra N · Filme » ou « Régie · Ne filme pas ».
- Pour chaque caméra, la source image : « Source OBS connectée » ou « Pas de source OBS ».
- Pour chaque caméra, la source mic : « Mic OBS connecté » ou « Pas de mic OBS ».

## Le rôle

Au premier lancement sans rôle, la page demande « Ce téléphone sert de… ». Le choix reste sur le téléphone.

| Rôle | État à l'ouverture |
|---|---|
| Caméra | Il filme tout de suite, objectif arrière, 16:9. |
| Régie | Il ne filme pas. |
| Selfie | Il filme tout de suite, objectif avant, 9:16. |

Le rôle ne décide que de l'état de départ. L'écran est ensuite le même, et « Filmer » ou « Arrêter de filmer » le change.

- Le bouton aux deux flèches (« Changer de rôle ») ramène au choix.
- Un QR code ouvre `/mobile?role=camera`, `?role=control` ou `?role=selfie`. Le rôle de l'adresse est gardé sur le téléphone.
- Un téléphone dont le rôle gardé est Caméra ou Selfie filme à chaque ouverture de la page, même après « Arrêter de filmer ».

## L'écran

L'écran a trois dispositions.

Le téléphone ne filme pas, en portrait comme en paysage :

- En haut, la vignette Antenne, le bouton « Changer de rôle » et une légende de deux lignes. La ligne 1 est « Jeu · PC » (la scène, puis le Plan). La ligne 2 est « ● Live 1:42 · 12 » (la durée du live, puis les viewers), ou « Hors ligne ».
- Une ligne d'alerte orange, quand il y en a une.
- Le tchat, avec le bouton « Écrire ».
- La barre du bas : « Micro : X », « Filmer », « Sons ».

Le téléphone filme en portrait :

- L'aperçu de la caméra en haut, avec la pastille « Caméra N », le cadre rouge à l'antenne et le bouton de l'objectif.
- Dessous, le même haut, l'alerte et le tchat.
- La barre du bas : « Micro : X », « Montrer » ou « Cacher », « Sons ».

Le téléphone filme en paysage :

- L'aperçu plein écran, avec le cadre rouge à l'antenne, la pastille « Caméra N » et l'alerte en haut.
- La barre : « Micro : X », « Montrer » ou « Cacher », l'objectif, l'écran noir.
- Seules les feuilles Micro et Caméra s'ouvrent depuis cet écran.

## Filmer

« Filmer » démarre la caméra avec l'objectif et le cadrage de l'orientation au moment de l'appui.

- Portrait : objectif avant, 9:16, 1080 × 1920, jamais recadré.
- Paysage : objectif arrière, 16:9, 1920 × 1080.
- Tourner ensuite le téléphone ne change que la disposition. Ni l'objectif, ni le flux ne changent, et le cadrage de l'image dans OBS non plus : 16:9 reste horizontal, 9:16 reste vertical.
- Le cadrage gardé est celui de la première image reçue après « Filmer ». Si Safari retourne l'image à la rotation, l'appli la remet dans ce cadrage sur la piste en marche, par `applyConstraints`. Elle vérifie 0, 0,3, 1 et 2,5 s après la rotation, et fait au plus 4 demandes. La caméra n'est pas relancée, l'antenne ne coupe pas.
- Un autre objectif ou une caméra relancée reprennent le même cadrage.
- Le micro a le traitement vocal d'iOS : écho annulé, bruit réduit, gain automatique.
- L'aperçu est muet. Il est en miroir pour l'objectif avant seulement. L'image envoyée à OBS ne l'est jamais.
- L'écran ne se met pas en veille tant que le téléphone filme.
- Safari en arrière-plan coupe la caméra. Au retour : « La caméra s'est arrêtée — Touche pour relancer ». Si Safari refuse : « Caméra ou micro refusé — Touche pour réessayer ».

Le numéro de caméra est donné au premier « Filmer ». C'est le plus petit numéro libre, ou celui que le téléphone a gardé s'il est libre. Il va de 1 à 9999.

La pastille « Caméra N » ouvre la feuille Caméra :

- Le choix du numéro, avec « Prendre ce numéro ». Un numéro déjà pris est refusé.
- « Arrêter de filmer », qui rend le numéro.
- Si ce téléphone a le Plan ou le micro entendu, une confirmation dit le résultat. Exemple : « Le plan passe à Tête, le micro au PC. ». En Muet, elle ne parle pas de micro : « Le plan passe à Tête. ».

À côté du nom, la pastille dit où en est la caméra :

- « En attente d'OBS » puis « Connexion à OBS… » pendant la mise en relation.
- « Prête » : OBS reçoit la caméra, mais elle n'est pas à l'antenne.
- « À l'antenne », avec un point rouge : une source image de cette caméra est visible dans la scène du programme. Les scènes imbriquées et les groupes comptent.

L'écran noir (paysage) couvre l'écran de noir pur, pour économiser l'OLED. La caméra et le son continuent. Un toucher n'importe où rallume l'écran. Un petit point rouge dit que la caméra est à l'antenne.

## Les deux sources OBS d'une caméra

Chaque caméra a deux sources navigateur dans OBS : l'image et le mic. OBS ne mixe pas le son d'un élément de scène caché, ni celui d'une scène absente du programme. Le mic a donc sa propre source, dans une scène présente partout.

L'image :

- Adresse : `http://camera-N.localhost:4747/camera/N`, taille 1920 × 1080, fond transparent.
- Elle va dans la scène « Master - Webcam », la place caméra.
- L'image est centrée en entier dans la source (`object-fit: contain`). Fenysk la place et la dimensionne dans OBS.
- La page ne joue aucun son. La case « Contrôler l'audio via OBS » y est inutile.

Le mic :

- Adresse : `http://camera-N.localhost:4747/camera/N/mic`. La page est vide et transparente, et joue la piste audio du téléphone.
- Elle va dans une scène « Master - Micros », ajoutée à chaque scène.
- La case « Contrôler l'audio via OBS » est cochée, et le monitoring audio est désactivé ([obs](obs.md)).
- Le micro entendu s'entend dans toutes les scènes, que la caméra soit visible ou cachée.
- Chaque caméra a son curseur dans le mélangeur d'OBS, sous le nom de sa source mic.

Un hôte par caméra, partagé par ses deux pages, car OBS limite les connexions par hôte. Chaque page ouvre un seul flux SSE.

Le téléphone envoie sa piste vidéo à la page image et sa piste audio à la page mic. Ce sont deux liaisons WebRTC tirées du même flux `getUserMedia`. Changer d'objectif remplace la piste vidéo sans toucher à la liaison du mic.

Les liaisons passent par le réseau local, sans serveur STUN ni TURN. H.264 passe en premier. L'image est plafonnée à 6 Mb/s. Le serveur ne fait que mettre le téléphone et ses pages en relation.

Deux pages OBS de la même sorte sur le même numéro : la dernière ouverte reçoit l'image, ou le son.

Sans source mic dans OBS, le mic de la caméra est grisé dans la feuille Micro : « Source OBS introuvable ». Le refus dit où la créer.

## Antenne

La feuille Antenne s'ouvre par la vignette ou par la ligne 1 de la légende. Elle montre la scène du programme d'OBS en grand.

- « Scène » : une touche par scène d'OBS, dans l'ordre d'OBS. Les scènes dont le nom commence par « Master » sont des scènes imbriquées : elles n'y sont pas.
- « Plan » : PC, chaque caméra, Tête. Cette section n'existe que si OBS a une place caméra.
- Un toucher sur une autre touche fait le changement, et le Plan décide du micro (voir « Le micro »). La feuille reste ouverte pour voir l'antenne changer.
- Une caméra dont le téléphone ne filme pas vers OBS est grisée : « Le téléphone ne filme pas vers OBS ».

La vignette est une image de l'antenne, 640 px de large. Elle est relue 1 fois par seconde, et 4 fois par seconde quand la feuille est ouverte. Une seule capture est partagée entre tous les téléphones.

## Live

La feuille Live s'ouvre par la ligne 2 de la légende.

- « Fin prévue 23:40 » (« --:-- » sans fin), avec « −10 min » et « +10 min ». La feuille reste ouverte pour voir l'heure changer.
- « Bilan » : Jean-Renard dit le bilan du live au tchat.
- Une ligne « 12 viewers » (ou « Viewers ») qui ouvre la liste des personnes connectées au tchat, avec un bouton pour rafraîchir.
- « Arrêter le live », en rouge, pendant le live seulement. Elle ouvre « Arrêter le live ? » : « Annuler » ou « Arrêter ». L'application ne démarre jamais le live.

## Le micro

Le bouton « Micro : X » dit le micro entendu. Un toucher dessus ouvre la feuille Micro.

- « Micro : PC » ou « Micro : Caméra 1 ».
- « Micro : ce tél. » pour la caméra de ce téléphone.
- « Micro : Muet » quand aucun micro n'est ouvert.

La feuille Micro :

- Sous « Micro entendu », la liste : PC, puis chaque caméra connectée. Le micro entendu est en clair.
- Un toucher sur un micro l'ouvre dans OBS et coupe tous les autres.
- Un micro dont la source OBS manque est grisé : « Source OBS introuvable ». Pour une caméra, c'est sa source mic (`/camera/N/mic`).
- « Couper le micro » les coupe tous. Quand tout est coupé, le bouton devient « Micro coupé ». Choisir un micro le rallume.

Le micro d'une caméra est l'entrée OBS de sa source mic. Sa coupure, l'écoute de la tête et de Jean-Renard, et le boost de la voix suivent cette source.

Les règles :

1. Un seul micro est ouvert à la fois.
2. La tête et Jean-Renard écoutent le micro ouvert, celui du PC avant les caméras.
3. Le Plan décide du micro. Une caméra au Plan prend son micro, le PC au Plan prend celui du PC, la Tête au Plan n'y touche pas. Rien de cela en Muet (règle 8).
4. Un Plan changé à la main dans OBS décide du micro de la même façon, sauf si ce micro est déjà ouvert ou en Muet. Rien ne change au démarrage du serveur, ni à la première lecture d'OBS qui suit une coupure.
5. Un téléphone ne fait que prendre le micro. Le bouton « Prendre » de l'alerte « Le micro est au PC » redemande celui de sa caméra. Aucun bouton du téléphone ne rend le micro au PC. Le rendre passe par le choix « PC » de la feuille Micro.
6. Un micro ouvert ou coupé à la main dans OBS est suivi. Si plusieurs sont ouverts, la tête écoute le premier : le PC avant les caméras.
7. Un téléphone qui se déconnecte laisse sa source mic ouverte dans OBS. La tête continue de l'écouter tant qu'elle est ouverte, jusqu'au repli du micro (voir « Le Plan »).
8. En Muet, rien ne rouvre un micro tout seul. Muet veut dire qu'aucun micro n'est ouvert et qu'aucune source mic de caméra ne l'est dans OBS. Ni un changement de Plan (le téléphone, la touche Image du Stream Deck, OBS à la main) ni un repli (caméra qui ne filme plus, « Arrêter de filmer », téléphone parti) n'ouvre alors un micro. Le serveur écrit « Régie : Muet, le micro ne s'ouvre pas avec l'image. » dans son journal.
9. Seul un choix de micro sort du Muet : la feuille Micro, « Rallumer » ou « Prendre » sur un téléphone, ou une entrée rouverte à la main dans OBS. Après cela, le Plan décide de nouveau du micro.

## Le Plan

Le Plan est ce qui occupe la place caméra d'OBS : PC, Caméra N ou Tête.

- La place est la scène imbriquée `cameraSlotScene` (« Master - Webcam »). Sans elle, il n'y a pas de Plan à choisir. Le serveur la suit par son identifiant OBS ([obs](obs.md)).
- Les membres se reconnaissent à ce qu'ils sont. Une capture vidéo est « PC ». Une source navigateur vers `/head` est « Tête ». Une source navigateur vers `/camera/N`, la page image, est « Caméra N ». Le reste de la place n'est jamais touché, la source mic `/camera/N/mic` comprise.
- L'application affiche un seul membre à la fois. Elle relit OBS à chaque évènement : si Fenysk change une visibilité à la main, le Plan suit.
- Une caméra n'est disponible que si son téléphone est connecté, filme, et si la page image OBS de son numéro a une liaison vive. Le PC et la Tête sont toujours disponibles.
- Si la source mic d'une caméra manque dans OBS, le Plan change quand même. Le refus le dit ensuite : « l'image est passée à … ».

« Montrer » et « Cacher » sont les boutons du téléphone qui filme :

- « Montrer » met cette caméra au Plan. Le Plan décide du micro : elle prend le sien, sauf en Muet.
- « Cacher » rend le Plan à la Tête. La Tête ne touche pas au micro : il reste au téléphone, dont la source mic reste entendue caméra cachée.
- Le téléphone continue d'envoyer son image, et l'aperçu écrit « Caméra cachée · Tête au plan ».
- Le bouton suit l'état réel d'OBS, quel que soit le geste qui a changé le Plan.

Repli automatique, au bout de 3 s. Chaque repli suit sa propre liaison : l'image pour le Plan, le mic pour le micro.

- Une caméra au Plan dont l'image n'arrive plus dans OBS passe le Plan à la Tête (à défaut au PC). La Tête ne déplace pas le micro.
- Un micro de caméra dont le mic n'arrive plus dans OBS revient au PC. C'est le cas d'un téléphone déconnecté, d'une caméra arrêtée ou d'une liaison mic perdue.
- Une liaison image perdue alors que le mic arrive encore ne déplace donc pas le micro.
- Une caméra au Plan et au micro qui ne filme plus déclenche deux demandes : le Plan vers la Tête, le micro vers le PC.
- Faute de Tête dans la place, le Plan se replie vers le PC. Une seule demande part : le PC prend son micro avec le Plan, sauf en Muet.
- En Muet, aucun repli n'ouvre de micro : le Plan se replie, le micro du PC reste coupé.
- La source mic d'un téléphone parti est coupée à l'ouverture du PC. Une source coupée à la main dans OBS, ou un autre micro ouvert, annule l'attente.
- Rien ne revient tout seul quand le téléphone revient. Fenysk reprend le Plan avec « Montrer ».

## Les sons

« Sons » ouvre un tiroir qui monte du bas. Il se ferme par la poignée, par un toucher sur le voile, ou en le glissant vers le bas.

- « Couper le son » en tête : le son en cours s'arrête dans OBS et la file se vide.
- Puis 3 colonnes de touches, une par son de la soundboard. La liste est relue à chaque ouverture.
- Un toucher joue le son dans OBS. Le tiroir reste ouvert pour en enchaîner plusieurs.
- Un refus (OBS non joint, aucune page `/sounds`) s'annonce par un toast en haut de la page.

## Le tchat

Le tchat du téléphone montre tout ce que Fenysk voit sur Twitch, pas seulement ce qu'OBS affiche.

- Les messages arrivent du plus ancien en haut au plus récent en bas. À l'ouverture, le serveur envoie les 200 derniers.
- Un message que OBS masque (bot, commande) est atténué.
- Un message supprimé, ou d'un viewer banni, reste barré et atténué, avec « supprimé ».
- Collé en bas : tant qu'on est en bas, le tchat suit les nouveaux messages. Si on remonte, une pastille « Nouveaux messages » ramène en bas.
- « Écrire » ouvre un champ et un bouton Envoyer, au nom du compte connecté à Twitch. 1 à 500 caractères. Un refus s'écrit sous le champ.

Écrire demande le droit `user:write:chat`, et la liste des viewers `moderator:read:chatters` ([twitch](twitch.md)).

## Les alertes

Une ligne orange sous le bandeau, une seule à la fois, la plus prioritaire. Elle apparaît quand sa condition dure depuis 3 s, sauf « Le live s'est arrêté » qui apparaît tout de suite.

| Alerte | Quand | Bouton |
|---|---|---|
| Connexion perdue · reconnexion… | Le flux du serveur est périmé. | Aucun, la reconnexion est automatique. |
| Le live s'est arrêté | Le live passe à hors ligne sans appui sur « Arrêter » de ce téléphone dans les 30 s. | OK |
| OBS non joint | Le flux est vivant, le serveur n'est pas joint à OBS. | Aucun |
| Muet depuis m:ss | En live, aucun micro n'est ouvert. | Rallumer |
| Ta caméra s'est arrêtée | La caméra de ce téléphone est interrompue, refusée ou introuvable. | Relancer |
| Ta caméra est prête | La caméra est relancée, avait le Plan, et la Tête l'a repris. | Montrer |
| Le micro est au PC (ou sur Caméra 2) | Ce téléphone a le Plan, le micro entendu n'est pas le sien. | Prendre |

- « Rallumer » rouvre le dernier micro vu ouvert sur ce téléphone, sinon le PC.
- « Prendre » ouvre le micro de la caméra de ce téléphone, même s'il est déjà ouvert.
- Le téléphone ne filme pas : les quatre premières alertes.
- Il filme en portrait : les sept.
- Il filme en paysage : seulement « Connexion perdue » et « Ta caméra est prête », car l'avis de caméra arrêtée couvre déjà l'aperçu.
- Pas d'alerte pour la balance du son, la fin du live, la batterie ni les viewers.

Le serveur envoie un battement toutes les 5 s. Le téléphone tient le flux pour périmé après 15 s sans message. La durée du live cesse alors d'avancer, le bandeau est grisé, et « Connexion perdue » s'affiche. Le téléphone rouvre la connexion.

## Le boost de la voix

Quand le micro entendu est une caméra, le serveur remonte sa voix si elle arrive trop faible.

- Il suit les crêtes de la voix de Fenysk sur l'entrée OBS de la source mic de cette caméra. Les silences et le bruit de fond sont écartés.
- Si les crêtes sont sous `cameraBoostTarget` (-17 dB), il monte le filtre « Gain (appli) » posé sur la source mic de cette caméra. Un cran toutes les 2 s, de la moitié de l'écart et de 6 dB au plus, de 0 à +30 dB.
- Il ne baisse jamais le boost posé. Un filtre « Limiteur (appli) » vers -3 dB tient les crêtes. Un limiteur déjà là n'est jamais écrasé.
- Le micro du PC n'est jamais touché.

## Limites connues

- L'interface dit « Muet » dans le bouton « Micro : Muet » et dans l'alerte « Muet depuis m:ss ». Elle dit « Micro coupé » dans la feuille Micro. C'est le même état.
- Le tchat du téléphone ne se rouvre pas seul quand le serveur répond une erreur, par exemple pendant un redémarrage. Recharger la page.
- Après une relance du serveur, la caméra au Plan doit rouvrir sa liaison image en moins de 3 s. Sinon le Plan se replie sur la Tête.
- Après une relance du serveur, le micro d'une caméra doit rouvrir sa liaison mic en moins de 3 s. Sinon le micro revient au PC.
- Hors du Wi-Fi de la maison, la liaison n'est pas prouvée : le transport n'utilise aucun serveur STUN ni TURN.

## Pour coder

Fichiers clés :

- `src/ui/mobile/phone-screen.tsx`, `phone-bodies.tsx`, `use-phone-screen.ts` : l'écran et ses trois dispositions.
- `src/ui/mobile/control-keys.ts`, `control-view.ts`, `alert-text.ts` : les libellés.
- `src/domain/control.rules.ts`, `picture.rules.ts`, `fallback.rules.ts`, `alert.rules.ts`, `phone-layout.rules.ts`, `boost.rules.ts` : les règles pures.
- `src/domain/camera.rules.ts` : les adresses des deux sources d'une caméra (`toCameraAddress`, `toCameraMicAddress`).
- `src/usecase/phone.usecase.ts` : les téléphones et la mise en relation (`isReceiving` pour l'image, `isHeard` pour le mic).
- `src/usecase/control.usecase.ts` : la régie (scène, micro, Plan, repli, fin du live).
- `src/usecase/camera-boost.usecase.ts`, `monitor.usecase.ts`.
- `src/app/server/phone-stream.ts` : ce que le flux envoie à un téléphone.
- `src/app/routes/camera/$number/index.tsx` et `mic.tsx` : les deux pages OBS d'une caméra. `src/ui/mobile/camera-screen.tsx` et `camera-mic-screen.tsx` les dessinent.
- `src/ui/mobile/active-tab.ts`, `use-active-tab.ts`, `other-tab.tsx` : l'onglet unique.
- `src/ui/settings/mobile-settings-tab.tsx`, `camera-sources.tsx` : l'onglet Mobile.

Routes utiles :

- `GET /api/mobile/phone` : le flux d'un téléphone (régie, numéro, signaux, battement).
- `GET /api/mobile/screen` : le flux d'une page OBS de caméra. Le paramètre `kind` vaut `image` ou `mic`.
- `POST /api/mobile/link` : le téléphone dit s'il filme, chaque page OBS dit si sa liaison est vive.
- `POST /api/obs/scene`, `/api/obs/mic`, `/api/obs/picture`, `/api/obs/stream/stop` : les gestes de la régie.
- `GET /api/obs/monitor` : l'image de l'antenne.
- `POST /api/fox/end`, `/api/fox/review`, `/api/chat/send`, `GET /api/chat/viewers`.

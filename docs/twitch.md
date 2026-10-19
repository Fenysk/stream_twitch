# Connexion à Twitch

Cette page dit ce que le serveur fait avec Twitch, ce qui marche sans connexion, et comment connecter le compte de Fenysk.

## Ce qui marche sans connexion

Le serveur lit le tchat comme un visiteur. Il demande aussi quelques données publiques avec un jeton d'application.

| Fonction | Ce qu'il faut |
|---|---|
| Lire le tchat, ses subs, resubs, subs offerts, cheers et raids | Rien. Tout vient du tchat (ComfyJS). |
| Nombre de viewers du live (`{viewers}`, bandeau du téléphone, touche Viewers) | `TWITCH_CLIENT_ID` et `TWITCH_CLIENT_SECRET` dans `.env`. Relu toutes les 60 s. |
| Prochain live du planning (rappels de Jean-Renard) | Les mêmes deux variables. Relu toutes les 30 min. |
| Emotes 7TV, BTTV et FFZ | Rien. |

Une seule variable manquante suffit pour que ces fonctions attendent. `server.log` le dit une fois au démarrage.

L'application Twitch est celle de LivePlace. `.env.example` donne les noms des variables, jamais leurs valeurs.

## Ce qui demande la connexion

Les follows, les récompenses de points de chaîne et les prédictions ne passent pas par le tchat. Twitch les donne par EventSub, avec le jeton du compte de la chaîne.

| Fonction | Droit demandé à Twitch |
|---|---|
| Follows | `moderator:read:followers` |
| Rachats de points de chaîne, et créer, modifier, supprimer, marquer une récompense | `channel:manage:redemptions` |
| Prédictions terminées | `channel:read:predictions` |
| « Écrire » dans la régie du téléphone | `user:write:chat` |
| Liste des viewers de la régie | `moderator:read:chatters` |

Sans connexion, rien d'autre ne casse : le tchat, les subs, les cheers et les raids marchent.

## Se connecter

À faire une fois. Le jeton est ensuite gardé et reprend au redémarrage du serveur, sans nouvelle autorisation.

1. Vérifier que `TWITCH_CLIENT_ID` et `TWITCH_CLIENT_SECRET` sont dans `.env`, puis relancer le serveur.
2. Ouvrir la console développeur de Twitch, application LivePlace.
3. Ajouter aux « OAuth Redirect URLs » exactement `http://localhost:4747/auth/twitch/callback`. Twitch la compare à la lettre, port compris.
4. Ouvrir l'onglet Twitch des réglages, bloc « Connexion à Twitch ».
5. Cliquer « Se connecter à Twitch ». Twitch s'ouvre dans un autre onglet.
6. Cliquer « Autoriser » sur Twitch.
7. Le navigateur revient sur l'onglet Twitch : « Connecté en tant que … ».

Le compte connecté est le modérateur de l'abonnement. Pour la chaîne de Fenysk, c'est Fenysk.

## Se reconnecter

Un jeton peut ne pas couvrir tous les droits. Il écoute alors ce qu'il permet, et le reste attend.

- Droits d'abonnement manquants (follows, récompenses, prédictions) : l'onglet Twitch écrit « Reconnecte-toi : l'autorisation actuelle ne couvre pas … ». Il propose « Se reconnecter à Twitch ». `server.log` le dit aussi au démarrage.
- Droit d'écriture ou de liste manquant : `/mobile` répond « Reconnecte Twitch dans l'onglet Twitch : … demande une autorisation de plus ». Cliquer « Se déconnecter », puis « Se connecter à Twitch ».
- Sans le droit `channel:manage:redemptions`, le serveur ne s'abonne pas aux rachats. Les récompenses de l'application attendent, et « Clasher » et « Réveiller » ne marchent pas.
- La page Direct, carte Twitch, rappelle « Reconnecte-toi dans l'onglet Twitch » quand le jeton est incomplet.

## Se déconnecter

« Se déconnecter » efface `data/twitch-token.json`, retire le jeton chez Twitch et ferme le flux EventSub. Les follows, récompenses et prédictions ne sont plus écoutés.

Si Twitch refuse le renouvellement (accès retiré dans les réglages de Twitch), le serveur efface le jeton et l'écrit dans `server.log`. L'onglet repasse à « Non connecté » avec la raison.

## Le jeton et le flux

- Le jeton est dans `data/twitch-token.json`, hors de git. Il n'apparaît ni dans `server.log` ni dans une page.
- Les pages reçoivent seulement l'état : indisponible, déconnecté (avec la raison du dernier échec), ou connecté avec le compte. Route : `GET /api/twitch/status`.
- Le jeton est renouvelé à la demande, quand il reste moins d'1 min. Il est vérifié chaque heure.
- Le flux EventSub est un seul WebSocket. Il se reconnecte tout seul, donne chaque notification une fois, et ignore les messages de plus de 10 min.
- Il s'abonne à ce que le jeton permet. Un abonnement refusé est écrit dans `server.log` sans couper les autres.

## Dans server.log

Lignes à connaître :

- « Twitch : pas encore connecté, les follows attendent » : aucun jeton. Se connecter.
- « Twitch : connecté en tant que … » : le jeton est repris au démarrage.
- « Viewers : 12 en ce moment » ou « Viewers : live hors ligne, nombre inconnu » : le nombre de viewers.
- « Planning : … » : le prochain live lu sur Twitch.

## Limites connues

- L'adresse de retour est fixe, sur le port 4747. Un serveur de preuve sur un autre `PORT` ne peut pas finir la connexion.
- Le jeton est celui d'un seul compte.
- Twitch ne donne la liste des viewers qu'au compte de la chaîne ou à un modérateur. Sinon il refuse (403) et la raison s'affiche.
- La liste ne montre que les viewers connectés à Twitch. Le nombre du bandeau compte tout le monde.

## Pour coder

Fichiers clés :

- `src/usecase/twitch-connection.usecase.ts` : le jeton, le flux, la connexion et la déconnexion.
- `src/domain/twitch.rules.ts` : les droits demandés, l'adresse de retour, la validité du jeton.
- `src/app/server/twitch-app.ts` : lit `TWITCH_CLIENT_ID` et `TWITCH_CLIENT_SECRET`.
- `src/infra/twitch-events.client.ts` : EventSub. `twitch-auth.client.ts` : OAuth. `twitch-rewards.client.ts`, `twitch-chat.client.ts`, `twitch-chat-viewers.client.ts` : Helix.
- `src/usecase/viewers.usecase.ts` et `timetable.usecase.ts` : le nombre de viewers et le planning.
- `src/ui/settings/twitch-block.tsx` : le bloc de l'onglet Twitch.

Routes utiles :

- `GET /auth/twitch/start` : envoie vers l'autorisation de Twitch.
- `GET /auth/twitch/callback` : le retour de Twitch, qui ramène sur `/settings/twitch`.
- `GET /api/twitch/status` : l'état de la connexion.
- `GET /api/twitch/viewers` : le nombre de viewers.
- `POST /api/twitch/disconnect` : se déconnecter.

# Tête South Park et tchat

Cette page décrit la tête de Fenysk et le tchat que OBS affiche, et les onglets qui les règlent.

## La tête

La tête est une image coupée en deux moitiés. La moitié haute s'ouvre quand Fenysk parle.

- Source OBS : `http://localhost:4747/head`, taille 800 × 700, fond transparent.
- La bouche s'ouvre quand le niveau du micro dépasse `threshold` (-40 dB).
- Elle reste ouverte `delay` (250 ms) après le dernier niveau au-dessus du seuil.
- Plus la voix est forte, plus la bouche s'ouvre et plus la tête s'incline (`voiceEffect`).
- Au repos, la tête change de pose toutes les 2 à 5 s : neutre, penchée à gauche ou à droite, levée.
- Quand Fenysk parle, elle change de pose toutes les 0,6 à 1,5 s, sauf si « Penché en parlant » est à 0°.
- La tête écoute le micro ouvert dans OBS : « Micro PC », ou la caméra d'un téléphone si Fenysk l'a choisie (voir [telephone](telephone.md)).

## Régler la tête

Trois onglets règlent la tête. Chaque choix s'applique tout de suite dans OBS, sans enregistrer.

| Onglet | Ce qu'on y fait |
|---|---|
| Direct | Voir le niveau du micro, choisir l'expression. |
| Tête South Park | Choisir l'expression, régler six curseurs, suivre l'aperçu. |
| Découpe | Créer une expression à partir d'une image. |

Les six curseurs de l'onglet Tête South Park :

- « Seuil du micro » (`threshold`) : sous ce niveau, la bouche reste fermée.
- « Pivot » (`tilt`) : angle du haut de la tête.
- « Ouverture » (`opening`) : écart entre le haut et la mâchoire.
- « Effet de la voix » (`voiceEffect`) : plus la voix est forte, plus ça s'ouvre.
- « Penché au repos » (`idleAngle`) et « Penché en parlant » (`talkAngle`).

« Revenir aux valeurs par défaut » remet ces six curseurs et l'expression.

Les autres réglages de la tête ne sont pas dans l'interface : `delay`, `quietLevel`, `loudLevel`, `quietScale`, `loudScale`, `idleMin`, `idleMax`, `idleLift`, `talkMin`, `talkMax`. Ils se changent dans `settings.json`, puis il faut relancer le serveur.

## Créer une expression

Une expression est un visage : une image, sa coupe et ses lèvres. L'expression par défaut est la photo de `tete-south-park/`.

1. Ouvrir l'onglet Découpe.
2. Cliquer « Importer une image », ou glisser ou coller une image dans la page.
3. Lire la phrase sous le plateau : « Coupe trouvée dans l'image » ou « Coupe devinée : ajuste-la ».
4. Déplacer les deux points de la coupe sur le plateau.
5. Régler « Lèvres noires », « Épaisseur » et « Fermeture » sur le côté du plateau.
6. Taper un « Nom », puis cliquer « Enregistrer ».
7. Ouvrir l'onglet Tête South Park : la vignette de l'expression est là, un clic l'affiche dans OBS.

Une expression enregistrée se rouvre depuis la liste « Expressions enregistrées » de l'onglet Découpe. On peut la retoucher ou la supprimer, avec une confirmation.

Si l'expression choisie est supprimée, la photo reprend. Les expressions sont dans `data/heads/<id>/`, hors de git.

## Le tchat

Le tchat de la chaîne `fenysk` s'affiche dans OBS. Le serveur le lit sans jeton Twitch.

- Source OBS : `http://localhost:4747/chat`, taille 480 × 640, fond transparent, messages récents en bas.
- Le serveur rejoint la chaîne `chatChannel` comme un visiteur, par ComfyJS. Il marche sans OBS.
- Les commandes (`!lurk`…) et les bots de `chatBots` sont masqués.
- Un message supprimé par un modo disparaît, avec tous les messages d'un viewer banni ou en timeout.
- Les badges et les évènements (subs, follows, raids) ne s'affichent pas.
- `server.log` écrit « Tchat : #fenysk rejoint, lecture sans jeton ».

## Régler le tchat

L'onglet Tchat règle l'allure du tchat. L'aperçu montre un message de test toutes les 2,5 s, jamais dans OBS.

| Réglage | Clé | Valeurs |
|---|---|---|
| Style | `chatStyle` | Pills, Texte seul, Panneau |
| Opacité du fond | `chatOpacity` | en % |
| Taille du texte | `chatTextSize` | en px |
| Durée d'affichage | `chatDuration` | en secondes, « Toujours » vaut 0 |
| Messages à l'écran | `chatMaxMessages` | nombre |
| Animation d'apparition | `chatAnimation` | Du bas, Pop, Du côté, Fondu |
| Afficher les commandes et les bots | `chatShouldShowHidden` | case à cocher |

La liste des bots se règle dans l'onglet Renard, carte « Lecture du tchat », champ « Comptes ignorés ».

## Limites connues

- Un message réduit à une seule mention (`@pseudo` seul) n'arrive pas. ComfyJS 1.1.29 lève une erreur et `server.log` écrit « ComfyJS signale une erreur ».
- Une commande affichée perd sa casse : `!Lurk` devient `!lurk`.

## Pour coder

Fichiers clés :

- `src/usecase/head.usecase.ts` : la boucle de la tête (bouche, repos, effet de la voix).
- `src/domain/mouth.rules.ts`, `idle.rules.ts`, `head.rules.ts` : les règles pures.
- `src/ui/Head.tsx` et `src/app/routes/head.tsx` : la page `/head`.
- `src/usecase/expression.usecase.ts` et `src/ui/cut/` : les expressions et l'onglet Découpe.
- `src/usecase/chat.usecase.ts` et `src/infra/chat.client.ts` : le tchat et ComfyJS.
- `src/ui/settings/head-fields.ts` et `chat-fields.ts` : les curseurs et les choix.

Routes utiles :

- `GET /api/head/events` : le flux de la tête, ouvert par la page `/head`.
- `GET /api/chat/events` : le flux du tchat, ouvert par `/chat` et par `/mobile`.
- `GET /api/mic/stream` : le niveau du micro, pour le vumètre.

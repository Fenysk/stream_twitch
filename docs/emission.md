# Émission de clips

Cette page décrit l'émission : Jean-Renard passe des clips pendant que Fenysk est absent. Elle couvre la source `/show`, le décompte `/countdown` et l'onglet Émission.

## Ce que fait l'émission

Une émission a un début et une fin. Tout se passe dans la page `/show`, qui est transparente tant que l'émission n'a pas commencé.

1. Ouverture : un bandeau « Ce soir — Les bêtises de Fenysk » glisse depuis la gauche. Jean-Renard, grand à droite, dit une phrase de `showOpeningPhrases`.
2. Pour chaque clip, le carton : la première image du clip, floue et assombrie. Un bandeau porte le jour d'enregistrement en petit (« 16 octobre ») et le titre en gros. Jean-Renard dit la phrase de début du clip.
3. Le carton reste 3 s au moins, et jusqu'à la fin de la phrase plus 0,5 s.
4. Le flou se lève et le clip joue en plein écran. Son titre est en petit en haut à gauche, Jean-Renard petit dans le coin en bas à droite.
5. Les rires du clip partent à leur instant. Puis Jean-Renard dit la phrase de fin du clip, s'il en a une, et le clip s'efface 0,5 s plus tard.
6. Clôture : le bandeau « Fin de l'émission — À la prochaine ! » et une phrase de `showClosingPhrases`. La page redevient transparente.

Les clips d'une émission sont les moins passés d'abord. Le compteur `playCount` monte de 1 au début de chaque passage. Entre clips passés autant de fois, le choix est au hasard.

Les phrases d'ouverture et de clôture se tirent sans répéter avant d'avoir tout dit, d'une émission à l'autre.

## Pendant le clip

La page suit la vidéo.

- Le tchat d'origine défile en bas à gauche, avec le rendu de la page `/chat`. Chaque message paraît `showChatLead` ms plus tôt (4000 par défaut). Un clip sans fichier `.chat.json` n'a pas de tchat.
- Jean-Renard sursaute, petit dans son coin, sur chaque pic du son du clip. Les règles sont celles du sursaut du jeu (`foxStartle*`).
- Les rires jouent par-dessus le son du clip. Plusieurs rires peuvent se chevaucher. Un rire dont le son est supprimé est sauté.
- Un rire qui dépasse la fin du clip garde la dernière image à l'écran jusqu'à la fin du dernier rire.

Tout le son de l'émission baisse à 15 % quand Fenysk parle : vidéos, rires et voix de Jean-Renard. Le fondu dure 300 ms. Le son remonte à 100 % `delay` + 2 s après la fin de sa voix.

La tête de Fenysk surgit alors par le bas, à gauche, devant le reste. Elle redescend au moment où le son remonte.

## Dans OBS

Deux sources navigateur.

| Source OBS | Adresse | Taille |
|---|---|---|
| Show | `http://127.0.0.1:4747/show` | 1920 × 1080, fond transparent |
| Countdown | `http://countdown.localhost:4747/countdown` | environ 800 × 100, fond transparent |

La case « Contrôler l'audio via OBS » reste décochée pour les deux ([obs](obs.md)). La source Show est sur `127.0.0.1` pour échapper à la limite de 6 connexions de `localhost`.

La source Countdown affiche une pill « Retour de Fenysk dans 4 min » (minute supérieure), puis « dans moins d'une minute ». Hors émission, elle n'affiche rien.

Le serveur estime l'instant du retour au début, puis à chaque temps que `/show` rapporte. Il additionne la durée gardée des clips restants et environ 6 s par phrase de Jean-Renard.

## Démarrer et arrêter

Il n'y a pas de bouton. L'émission suit OBS.

- Elle commence quand la scène du programme contient une source navigateur dont l'adresse est `/show` du serveur, et que cette source est visible. Les scènes imbriquées et les groupes comptent, sur trois niveaux. Le mode studio ne change rien : c'est la scène du programme.
- Le serveur interroge OBS 150 ms après chaque évènement de scène, d'élément ou de source.
- Elle s'arrête tout de suite quand la source n'est plus visible : scène changée, source cachée, connexion à OBS perdue. C'est une émission coupée.
- Une fois finie, la source visible ne la relance pas. Il faut la cacher puis la remettre. L'onglet dit « Émission terminée. Cache puis remets la source pour la relancer. »
- Sans aucun clip confirmé, elle ne commence pas. `server.log` écrit « aucun clip confirmé, rien à passer ».
- Une page `/show` rechargée en pleine émission rejoue le déroulé depuis l'ouverture. Sans aucune page `/show` connectée pendant 20 s, l'émission s'arrête.

## Jean-Renard pendant l'émission

Jean-Renard n'est qu'à un endroit : `/show`. Détails dans [renard](renard.md).

- Au lancement, il glisse hors de `/fox` sans bâiller. La page `/show` attend la fin de cette sortie avant l'ouverture. S'il était déjà parti, elle n'attend pas.
- `/fox` et l'aperçu des réglages le cachent et se taisent. « Faire parler » répond 409.
- Les remerciements et les phrases de récompense attendent la fin de l'émission. Tout le reste est jeté : messages, piques, rappels, cris, heures, bilan.
- À la fin normale, ou après 20 s sans page `/show`, il revient en sautant, sans phrase.
- Émission coupée : il revient en sautant, attend le silence de Fenysk et dit une phrase de `showGrumblePhrases`. Liste vide : il revient sans phrase.
- À l'arrêt du serveur, il ne revient pas.

## L'onglet Émission

L'onglet Émission règle l'émission et prépare les clips.

- Carte « Source OBS » : l'adresse de `/show` et le nombre de clips confirmés.
- Carte « Émission » : où en est l'émission (« Émission arrêtée », « Émission en cours : clip 2 sur 5 »).
- « Clips par émission » : de 1 à 20, 5 par défaut.
- « Durée estimée : 5 à 7 min » et « Scène après l'émission ».
- Carte « Phrases de Jean-Renard » : l'ouverture, la clôture et « Phrases si l'émission est coupée », une par ligne.
- Cartes « Clips bruts » et « Clips de l'émission ».

« Durée estimée » suit le curseur. C'est l'émission la plus courte et la plus longue que le tirage peut faire, arrondies à la minute.

« Scène après l'émission » propose « Rester sur la scène de l'émission » (par défaut), puis chaque scène d'OBS. Le serveur suit la scène choisie par son identifiant OBS ([obs](obs.md)). Renommée dans OBS, elle reste la scène de fin, et `showEndScene` prend son nouveau nom. À la fin normale seulement, le serveur fait passer le programme d'OBS sur cette scène. La transition réglée dans OBS fait le fondu. Une émission coupée, arrêtée après 20 s ou par l'arrêt du serveur ne change pas de scène. Si OBS refuse, rien ne change et `server.log` le dit.

Deux réglages n'ont pas de champ : `showClipsFolder` (le dossier des clips) et `showChatLead`. `settings.local.json` peut les changer.

## Préparer les clips

Les clips bruts sont les enregistrements du tampon de relecture d'OBS, dans le dossier `showClipsFolder` (`settings.json`). Seuls les fichiers `.mp4`, `.mkv` et `.mov` directement dans ce dossier comptent, pas ceux de ses sous-dossiers.

Dépendance : `ffprobe` et `ffmpeg` doivent être dans le `PATH` (installés par winget). Sans eux, la liste affiche « durée inconnue » et le recodage échoue.

Valider un clip :

1. Onglet Émission, carte « Clips bruts » : cliquer un clip. Il s'ouvre dans l'éditeur.
2. Placer le début et la fin sur la piste « Coupe ». Par défaut, c'est tout le clip.
3. Écrire le « Titre » (obligatoire).
4. Écrire la « Phrase de début » et la « Phrase de fin », facultatives. Vide, Jean-Renard se tait. 500 caractères au plus.
5. Poser des rires si besoin (voir plus bas).
6. Cliquer « Valider ».

« Valider » recode la partie choisie : son égalisé (`loudnorm`, -16 LUFS), H.264 par `h264_nvenc` avec repli sur `libx264`, AAC, `+faststart`. Le résultat va dans `Confirmés\` avec un JSON de même nom. Le clip brut passe dans `Traités\`. Le recodage prend jusqu'à une minute.

Un seul clip est traité à la fois (409 sinon). En cas d'échec, le clip brut ne bouge pas et le fichier partiel part.

« Jeter » range le clip brut dans `Traités`, sans clip confirmé. Rien n'est jamais supprimé du disque. Un nom déjà pris reçoit un « (2) ».

L'éditeur :

- Sous le lecteur, une timeline : une règle de temps, la piste « Coupe » et la piste « Rires ».
- La piste « Coupe » a deux poignées, calées sur les images (1/60 s).
- Raccourcis : `I` pose le début, `O` la fin, `R` un rire, `Suppr` retire le rire choisi.
- `←` et `→` avancent d'une image, vidéo en pause. `Espace` lit ou arrête.
- « Lire la sélection » lit du début à la fin choisis, avec les rires.

## Les rires

Un rire est un son de la soundboard posé à un instant du clip. Un clip a 50 rires au plus.

- `R` ou « Rire ici » pose un rire sur l'image affichée, avec le dernier son choisi.
- Un clic sur un bloc le choisit. Le glisser le déplace. `←` et `→` le déplacent d'une image (`Maj` : 1 s).
- Sous la timeline : « Rire 2 sur 3 · à 0:12.50 », le choix du son, et « Retirer ».
- Le curseur « Volume des rires » (0 à 100 %) règle tous les rires du clip. Un rire joue au volume de son son, fois ce curseur.
- « Dépasse la fin : la dernière image attend » : le son finit après la fin gardée.
- « Hors de la partie gardée : il ne sera pas joué » : le bloc est estompé.

Les rires se modifient même quand la coupe est verrouillée, car ils ne demandent aucun recodage.

## Modifier un clip validé

La carte « Clips de l'émission » liste les clips confirmés (titre, durée, date de validation). Un clic les ouvre dans le même éditeur, rempli.

- « Enregistrer » réécrit le JSON si seuls le titre, les phrases, les rires ou leur volume changent. Il ne recode pas.
- Un autre début ou une autre fin recodent depuis le clip brut de `Traités` et remplacent la vidéo confirmée. La vidéo remplacée passe dans `Traités` sous « … (ancienne version).mp4 ».
- « Retirer de l'émission » range la vidéo, son JSON et son `.chat.json` dans `Traités`. Le clip quitte l'émission.
- Si le clip brut n'est plus dans `Traités`, les poignées sont désactivées. Seuls le titre, les phrases et les rires se modifient.

## Le tchat de chaque clip

Le serveur garde en mémoire les messages des 3 dernières minutes. Quand OBS sauvegarde le tampon de relecture, il attend 10 s, puis écrit `<nom du clip>.chat.json` à côté du clip brut.

- Le fichier contient les messages de la sauvegarde moins la durée du clip, jusqu'à la sauvegarde plus 10 s.
- Seul un clip directement dans `showClipsFolder` est gardé.
- Le fichier suit le clip dans `Traités`. « Valider » en copie un à côté du clip confirmé.

## Limites connues

- Relancer le serveur pendant une émission la fait repartir de l'ouverture si la source `/show` est visible.
- Les pics de son d'un clip sont mesurés une fois. Changer les règles du sursaut ne recalcule pas un clip déjà mesuré.
- OBS limite les connexions par hôte. La page `/show` ouvre trois flux et télécharge chaque fichier de rire une seule fois par émission, avant son clip.

## Pour coder

Fichiers clés :

- `src/usecase/show-director.usecase.ts` : le départ, la fin, l'état de l'émission, la voix.
- `src/usecase/clip.usecase.ts`, `clip-analysis.usecase.ts`, `clip-chat.usecase.ts` : les clips, leurs pics, leur tchat.
- `src/domain/show.rules.ts` : le tirage, les durées, le décompte, le son qui baisse.
- `src/infra/ffmpeg.client.ts` et `clip-files.repository.ts` : le recodage et les dossiers.
- `src/ui/show/` : la page `/show` et `/countdown`. `src/ui/clips/` : l'éditeur.
- `src/ui/settings/show-settings-tab.tsx`.

Routes utiles :

- `GET /api/show/events` : l'état de l'émission (`?place=page` pour la page `/show`).
- `POST /api/show/progress` : la page dit où elle en est. `POST /api/show/speak` : elle demande une phrase.
- `GET /api/clips` : les clips bruts et confirmés. `POST /api/clips/confirm`, `discard`, `revise`, `withdraw`.
- `GET /api/obs/scenes` : les scènes d'OBS, pour « Scène après l'émission ».

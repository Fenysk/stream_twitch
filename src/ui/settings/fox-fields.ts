// Les curseurs de l'onglet « Renard » : chaque durée et chaque seuil de A (il parle), B (il est au repos), C (il cligne), D (il
// t'écoute), E et G (réaction et coucou), F et H (il bâille, s'en va et revient), K (il sursaute quand tu cries), puis la
// lecture du tchat.
// La voix se choisit dans une liste, pas à un curseur. Les crans, leur libellé et le type d'un curseur sont ceux de la tête.

import { END_PANIC_MINUTES, END_SOON_MINUTES } from "../../domain/hours.rules";
import {
  END_AT_CODEC,
  type ListSpec,
  type SliderKey,
  type SliderSpec,
  type TimeSpec,
  type ToggleSpec,
  toSteps,
} from "./head-fields";

// La virgule française : 4 s, 1,5 s ; 1,5 %.
const toSeconds = (ms: number): string => `${String(ms / 1000).replace(".", ",")} s`;
const toPercent = (fraction: number): string =>
  `${String(Math.round(fraction * 1000) / 10).replace(".", ",")} %`;
const toDecibels = (value: number): string => `${value} dB`;
// 30 s, 1 min, 1,5 min, 3 min.
const toDelay = (ms: number): string =>
  ms < 60_000 ? toSeconds(ms) : `${String(ms / 60_000).replace(".", ",")} min`;
const HOUR_MS = 3_600_000;
const DAY_MS = 86_400_000;
const toHours = (ms: number): string => `${ms / HOUR_MS} h`;
const toDays = (ms: number): string => `${ms / DAY_MS} ${ms === DAY_MS ? "jour" : "jours"}`;

// Un groupe de l'onglet : des cases, des curseurs, des heures, puis des listes de phrases (une phrase par ligne).
export type FoxGroup = {
  title: string;
  toggles?: readonly ToggleSpec[];
  sliders: readonly SliderSpec[];
  times?: readonly TimeSpec[];
  lists?: readonly ListSpec[];
};

export const FOX_GROUPS: readonly FoxGroup[] = [
  {
    title: "Quand il parle",
    sliders: [
      {
        key: "foxSmallThreshold",
        label: "Seuil de la petite bouche",
        help: "En dessous, la bouche reste fermée.",
        steps: toSteps(-60, 0, 1, toDecibels),
        fallback: -36,
      },
      {
        key: "foxMediumThreshold",
        label: "Seuil de la bouche moyenne",
        help: "Au-dessus, la bouche s'ouvre plus.",
        steps: toSteps(-60, 0, 1, toDecibels),
        fallback: -22,
      },
      {
        key: "foxLargeChance",
        label: "Grande bouche",
        help: "Parfois, elle remplace la moyenne.",
        steps: toSteps(0, 1, 0.05, (value) => `${Math.round(value * 100)} %`),
        fallback: 0.3,
      },
      {
        key: "foxBounce",
        label: "Rebond",
        help: "Le corps s'écrase et s'étire en parlant.",
        steps: toSteps(0, 0.08, 0.005, toPercent),
        fallback: 0.03,
      },
    ],
  },
  {
    title: "Au repos",
    sliders: [
      {
        key: "foxBreathPeriod",
        label: "Respiration : durée",
        help: "Le temps d'une respiration.",
        steps: toSteps(2000, 8000, 250, toSeconds),
        fallback: 4000,
      },
      {
        key: "foxBreath",
        label: "Respiration : étirement",
        help: "De combien le corps s'étire.",
        steps: toSteps(0, 0.03, 0.0025, toPercent),
        fallback: 0.015,
      },
      {
        key: "foxGazeMin",
        label: "Regard : au plus court",
        help: "Délai minimum avant de regarder ailleurs.",
        steps: toSteps(1000, 30_000, 500, toSeconds),
        fallback: 5000,
      },
      {
        key: "foxGazeMax",
        label: "Regard : au plus long",
        help: "Délai maximum avant de regarder ailleurs.",
        steps: toSteps(1000, 30_000, 500, toSeconds),
        fallback: 15000,
      },
    ],
  },
  {
    title: "Clignement",
    sliders: [
      {
        key: "foxBlinkMin",
        label: "Entre deux clignements : minimum",
        help: "Jamais pendant qu'il parle.",
        steps: toSteps(1000, 10_000, 250, toSeconds),
        fallback: 3000,
      },
      {
        key: "foxBlinkMax",
        label: "Entre deux clignements : maximum",
        help: "Jamais pendant qu'il parle.",
        steps: toSteps(1000, 10_000, 250, toSeconds),
        fallback: 6000,
      },
      {
        key: "foxBlinkDuration",
        label: "Durée du clignement",
        help: "Le temps yeux fermés.",
        steps: toSteps(50, 500, 10, (value) => `${value} ms`),
        fallback: 150,
      },
    ],
  },
  {
    title: "Quand tu parles",
    sliders: [
      {
        key: "foxListenMin",
        label: "Écoute : regard au plus court",
        help: "Délai minimum avant de changer de regard.",
        steps: toSteps(1000, 10_000, 250, toSeconds),
        fallback: 2000,
      },
      {
        key: "foxListenMax",
        label: "Écoute : regard au plus long",
        help: "Délai maximum avant de changer de regard.",
        steps: toSteps(1000, 10_000, 250, toSeconds),
        fallback: 4000,
      },
      {
        key: "foxReadSilence",
        label: "Silence avant de lire",
        help: "Ton silence requis avant de lire.",
        steps: toSteps(250, 5000, 250, toSeconds),
        fallback: 1000,
      },
      {
        key: "foxStopAfter",
        label: "Coupure quand tu parles",
        help: "Si tu parles plus, il arrête.",
        steps: toSteps(250, 5000, 250, toSeconds),
        fallback: 1000,
      },
    ],
  },
  {
    title: "Réaction et coucou",
    sliders: [
      {
        key: "foxReactionDuration",
        label: "Durée de la réaction, du coucou et du sursaut",
        help: "Avant de lire le message.",
        steps: toSteps(250, 3000, 250, toSeconds),
        fallback: 1000,
      },
    ],
    lists: [
      {
        key: "foxEmoteReactions",
        label: "Emotes qui changent sa tête",
        help: "Une emote par ligne : nom = sourire, choc ou clin. Le nom s'écrit exactement, majuscules comprises. Un message qui la contient donne cette réaction avant sa lecture ; un message d'emotes seules la donne sans rien lire, s'il est visible et se tait.",
        rows: 8,
      },
    ],
  },
  {
    title: "Habitués",
    toggles: [
      {
        key: "foxShouldWelcome",
        label: "Accueillir les habitués",
        help: "Au premier message d'un viewer dans un live, une phrase d'accueil avant de le lire. Sa venue est retenue dans data/viewers.json, même case décochée.",
        fallback: true,
      },
    ],
    sliders: [
      {
        key: "foxWelcomeLiveGap",
        label: "Silence entre deux lives",
        help: "Après ce silence, un live de plus.",
        steps: toSteps(HOUR_MS, 24 * HOUR_MS, HOUR_MS, toHours),
        fallback: 6 * HOUR_MS,
      },
      {
        key: "foxWelcomeReturnAfter",
        label: "Absence avant « sans nouvelles »",
        help: "À partir de ce nombre de jours.",
        steps: toSteps(DAY_MS, 90 * DAY_MS, DAY_MS, toDays),
        fallback: 14 * DAY_MS,
      },
    ],
    lists: [
      {
        key: "foxWelcomeLiveCounts",
        label: "Paliers de lives",
        help: "Un nombre par ligne : le viewer qui atteint ce nombre de lives est fêté.",
        rows: 4,
      },
      {
        key: "foxWelcomeMilestone",
        label: "Palier de lives",
        help: "Dite au tchat. Liste vide : pas de phrase pour ce cas.",
        rows: 3,
      },
      {
        key: "foxWelcomeReturn",
        label: "Retour après une absence",
        help: "Jamais pendant les 14 premiers jours du fichier : l'absence ne serait pas prouvée.",
        rows: 3,
      },
      {
        key: "foxWelcomeYesterday",
        label: "Venu la veille",
        help: "Sa dernière venue date du jour d'avant, à l'heure de Paris.",
        rows: 3,
      },
      {
        key: "foxWelcomeFirst",
        label: "Tout premier message",
        help: "Jamais pendant les 14 premiers jours du fichier : rien ne prouve qu'il est nouveau.",
        rows: 3,
      },
    ],
  },
  {
    title: "Humeur du tchat",
    sliders: [
      {
        key: "foxCheerfulCount",
        label: "Messages pour être joyeux",
        help: "Acceptés dans la période ci-dessous.",
        steps: toSteps(5, 100, 5, (value) => `${value} messages`),
        fallback: 15,
      },
      {
        key: "foxCheerfulPeriod",
        label: "Période de ces messages",
        help: "Seuls les plus récents comptent.",
        steps: toSteps(60_000, 900_000, 60_000, toDelay),
        fallback: 300_000,
      },
      {
        key: "foxSulkAfter",
        label: "Silence du tchat avant qu'il boude",
        help: "Il ne regarde plus vers le tchat.",
        steps: toSteps(30_000, 600_000, 30_000, toDelay),
        fallback: 90_000,
      },
      {
        key: "foxResumeAfter",
        label: "Silence du tchat avant la reprise",
        help: "Le premier message qui suit le surprend.",
        steps: toSteps(60_000, 1_800_000, 60_000, toDelay),
        fallback: 300_000,
      },
    ],
    lists: [
      {
        key: "foxResumePhrases",
        label: "Reprise du tchat",
        help: "Une phrase par ligne, dite au tchat avant de lire le premier message qui suit un long silence, au plus une toutes les 30 min. Elle passe avant l'accueil d'un habitué. Joyeux, il sourit parfois en regardant ailleurs ; boudeur, il ne regarde plus vers le tchat. Liste vide : pas de phrase.",
        rows: 3,
      },
    ],
  },
  {
    title: "Quand il s'ennuie",
    sliders: [
      {
        key: "foxAwayAfter",
        label: "Délai avant de partir",
        help: "Sans parler, il bâille puis s'en va.",
        steps: toSteps(30_000, 600_000, 30_000, toDelay),
        fallback: 180_000,
      },
      {
        key: "foxYawnDuration",
        label: "Durée du bâillement",
        help: "Avant de s'accroupir et de sauter.",
        steps: toSteps(500, 5000, 250, toSeconds),
        fallback: 2000,
      },
      {
        key: "foxCrouchDuration",
        label: "Durée de l'accroupissement",
        help: "Il s'écrase avant de sauter.",
        steps: toSteps(100, 1000, 50, toSeconds),
        fallback: 300,
      },
      {
        key: "foxJumpDuration",
        label: "Durée du saut",
        help: "Il saute vers le haut.",
        steps: toSteps(100, 1500, 50, toSeconds),
        fallback: 400,
      },
      {
        key: "foxDiveDuration",
        label: "Durée du plongeon",
        help: "Il plonge hors de la source.",
        steps: toSteps(200, 2500, 50, toSeconds),
        fallback: 800,
      },
      {
        key: "foxReturnDuration",
        label: "Durée du saut pour revenir",
        help: "Il remonte en sautant.",
        steps: toSteps(200, 3000, 100, toSeconds),
        fallback: 800,
      },
    ],
  },
  {
    title: "Relance",
    sliders: [
      {
        key: "foxJabAfter",
        label: "Silence avant de revenir piquer Fenysk",
        help: "Silence total, après ta première parole.",
        steps: toSteps(30_000, 900_000, 30_000, toDelay),
        fallback: 180_000,
      },
      {
        key: "foxJabGap",
        label: "Écart entre deux piques",
        help: "Au plus une pique dans ce délai.",
        steps: toSteps(60_000, 1_800_000, 60_000, toDelay),
        fallback: 600_000,
      },
    ],
    lists: [
      {
        key: "foxJabs",
        label: "Piques",
        help: "Une pique par ligne, dite à Fenysk. Il pioche sans répéter avant d'avoir tout dit.",
        rows: 10,
      },
      {
        key: "foxReminders",
        label: "Rappels",
        help: "Un rappel par ligne, dit au tchat. Ils alternent avec les piques, et le prochain live de ton planning Twitch s'y ajoute s'il existe.",
        rows: 4,
      },
    ],
  },
  {
    title: "Remerciements",
    toggles: [
      {
        key: "foxShouldThank",
        label: "Remercier les follows, subs et cheers",
        help: "Il revient, réagit, puis remercie par une phrase tirée dans la liste de l'évènement, lurks, raids et prédictions compris.",
        fallback: true,
      },
    ],
    sliders: [
      {
        key: "foxThankGap",
        label: "Un follow nommé toutes les",
        help: "Les autres sont groupés, sans pseudo.",
        steps: toSteps(1000, 60_000, 1000, toSeconds),
        fallback: 10_000,
      },
      {
        key: "foxJoyDuration",
        label: "Durée du saut de joie",
        help: "Sub, resub ou sub offert.",
        steps: toSteps(200, 2000, 100, toSeconds),
        fallback: 800,
      },
      {
        key: "foxRaidDuration",
        label: "Durée du long coucou d'un raid",
        help: "Les deux images du coucou alternent.",
        steps: toSteps(1000, 10_000, 500, toSeconds),
        fallback: 3000,
      },
      {
        key: "foxTalkativeMessages",
        label: "Messages d'un viewer très impliqué",
        help: "Atteints, il le remercie une fois.",
        steps: toSteps(10, 500, 10, (value) => `${value} messages`),
        fallback: 50,
      },
    ],
    lists: [
      {
        key: "foxThanksFollow",
        label: "Follow",
        help: "Un sourire d'1 s, puis la phrase. Une phrase avec {viewers} n'est dite que si le nombre de viewers est connu.",
        rows: 10,
      },
      {
        key: "foxThanksFollowGeneric",
        label: "Follows groupés",
        help: "Dite pour plusieurs follows d'un coup, ou quand le pseudo est refusé. Sans pseudo.",
        rows: 6,
      },
      {
        key: "foxThanksSub",
        label: "Sub et resub",
        help: "Un saut de joie, puis la phrase, puis le message du sub s'il passe le filtre.",
        rows: 10,
      },
      {
        key: "foxThanksGiftOne",
        label: "Sub offert à quelqu'un",
        help: "Un saut de joie, puis la phrase.",
        rows: 6,
      },
      {
        key: "foxThanksGiftMany",
        label: "Série de subs offerts",
        help: "Une seule phrase pour toute la série.",
        rows: 6,
      },
      {
        key: "foxThanksCheer",
        label: "Cheer (bits)",
        help: "Un sourire d'1 s, puis la phrase, puis le message du cheer s'il passe le filtre.",
        rows: 8,
      },
      {
        key: "foxThanksLurk",
        label: "Lurk (!lurk)",
        help: "Un sourire d'1 s, puis la phrase, une fois par viewer. Le message n'est jamais lu.",
        rows: 6,
      },
      {
        key: "foxThanksLurkGeneric",
        label: "Lurk, pseudo refusé",
        help: "Dite quand le pseudo de celui qui lurke est refusé. Sans pseudo.",
        rows: 3,
      },
      {
        key: "foxThanksTalkative",
        label: "Viewer très impliqué",
        help: "Un sourire d'1 s, puis la phrase, quand un viewer atteint le nombre de messages réglé depuis le démarrage du serveur. Jamais de classement.",
        rows: 4,
      },
      {
        key: "foxThanksRaid",
        label: "Raid",
        help: "Un long coucou, puis la phrase au tchat. {viewers} s'écrit « 1 personne », « 12 personnes ».",
        rows: 6,
      },
      {
        key: "foxThanksRaidGeneric",
        label: "Raid, pseudo refusé",
        help: "Dite quand le pseudo du streamer qui arrive est refusé. Sans pseudo.",
        rows: 3,
      },
      {
        key: "foxThanksPrediction",
        label: "Prédiction terminée",
        help: "Dite au tchat sans rien montrer avant, quand des viewers perdent. {perdants} s'écrit « 1 personne », « 12 personnes » ; {issue} est l'issue perdante la plus suivie. Une prédiction annulée ne dit rien. Demande la connexion à Twitch.",
        rows: 4,
      },
      {
        key: "foxThanksPredictionNoLoser",
        label: "Prédiction, sans perdant",
        help: "Dite quand tout le monde a gagné.",
        rows: 3,
      },
    ],
  },
  {
    title: "Récompenses de points de chaîne",
    sliders: [
      {
        key: "foxFlinchDelay",
        label: "Délai avant qu'il se retourne",
        help: "Compté depuis le départ du son.",
        steps: toSteps(0, 3000, 100, toSeconds),
        fallback: 1000,
      },
    ],
    lists: [
      {
        key: "foxClashRewards",
        label: "Titres de « Clasher Fenysk »",
        help: "Un titre par ligne, comme sur Twitch (majuscules ignorées) ; tu crées la récompense toi-même. Le viewer paie : une pique tout de suite, tournée vers Fenysk. Liste vide : récompense ignorée. Suit la case « Remercier les follows, subs et cheers » ; demande la connexion à Twitch ci-dessous.",
        rows: 2,
      },
      {
        key: "foxClashIntros",
        label: "Avant la pique du clash",
        help: "Une phrase par ligne, dite avant la pique. Elle n'attend pas l'écart de la relance et n'y compte pas ; elle s'arrête si Fenysk parle plus d'1 s.",
        rows: 3,
      },
      {
        key: "foxWakeRewards",
        label: "Titres de « Réveiller Jean-Renard »",
        help: "Un titre par ligne, comme sur Twitch (majuscules ignorées). Le texte que le viewer y joint n'est jamais lu. Liste vide : récompense ignorée.",
        rows: 2,
      },
      {
        key: "foxThanksWakeAsleep",
        label: "Réveil : il n'était pas visible",
        help: "Dite au tchat : il revient en sautant, puis la phrase.",
        rows: 4,
      },
      {
        key: "foxThanksWakeAwake",
        label: "Réveil : il était visible",
        help: "Dite au tchat, sans rien montrer avant.",
        rows: 3,
      },
      {
        key: "foxFlinchRewards",
        label: "Titres des récompenses qui le choquent",
        help: "Un titre par ligne, comme sur Twitch (majuscules ignorées). Après le délai ci-dessus (0 : en même temps), compté depuis le départ du son de la récompense, il se tourne vers Fenysk, la tête choquée, le temps d'une réaction. Sans son relié : tout de suite. Liste vide : rien.",
        rows: 2,
      },
    ],
  },
  {
    title: "Quand tu cries",
    sliders: [
      {
        key: "foxShoutThreshold",
        label: "Seuil d'un cri",
        help: "Au-dessus, c'est un cri.",
        steps: toSteps(-20, 0, 1, toDecibels),
        fallback: -5,
      },
      {
        key: "foxShoutMerge",
        label: "Cris collés : écart maximum",
        help: "Deux cris plus proches ne font qu'un.",
        steps: toSteps(250, 5000, 250, toSeconds),
        fallback: 1000,
      },
      {
        key: "foxShoutCount",
        label: "Nombre de cris avant une phrase",
        help: "Dans la période ci-dessous.",
        steps: toSteps(2, 10, 1, (value) => String(value)),
        fallback: 3,
      },
      {
        key: "foxShoutPeriod",
        label: "Période de ces cris",
        help: "Pendant ce temps, ils se cumulent.",
        steps: toSteps(30_000, 600_000, 30_000, toDelay),
        fallback: 120_000,
      },
      {
        key: "foxShoutLong",
        label: "Durée d'un cri pénible",
        help: "Plus long, il parle tout de suite.",
        steps: toSteps(1000, 10_000, 500, toSeconds),
        fallback: 3000,
      },
      {
        key: "foxShoutGap",
        label: "Écart entre deux phrases de cri",
        help: "Au plus une phrase dans ce délai.",
        steps: toSteps(60_000, 1_800_000, 60_000, toDelay),
        fallback: 600_000,
      },
    ],
    lists: [
      {
        key: "foxShouts",
        label: "Phrases de cri",
        help: "Une phrase par ligne, dite à Fenysk. Seul un cri pénible en déclenche une ; un cri simple fait seulement sursauter.",
        rows: 4,
      },
    ],
  },
  {
    title: "Quand tu parles longtemps",
    sliders: [
      {
        key: "foxTunnelAfter",
        label: "Durée avant qu'il bâille",
        help: "Tu parles sans pause longue.",
        steps: toSteps(30_000, 600_000, 30_000, toDelay),
        fallback: 180_000,
      },
      {
        key: "foxTunnelPause",
        label: "Silence qui coupe ce monologue",
        help: "Une pause plus longue remet à zéro.",
        steps: toSteps(1000, 30_000, 1000, toSeconds),
        fallback: 5000,
      },
      {
        key: "foxTunnelGap",
        label: "Écart entre deux monologues",
        help: "Au plus un bâillement dans ce délai.",
        steps: toSteps(60_000, 1_800_000, 60_000, toDelay),
        fallback: 600_000,
      },
    ],
    lists: [
      {
        key: "foxTunnelToFenysk",
        label: "Phrases pour Fenysk",
        help: "Après le bâillement, tournées vers Fenysk. Tirées avec les phrases pour le tchat, sans répéter.",
        rows: 6,
      },
      {
        key: "foxTunnelToChat",
        label: "Phrases pour le tchat",
        help: "Après le bâillement, tournées vers le tchat.",
        rows: 4,
      },
    ],
  },
  {
    title: "Quand tu reviens",
    toggles: [
      {
        key: "foxShouldHailComeback",
        label: "Saluer mon retour",
        help: "Quand tu reparles après une absence, il te salue d'une phrase tirée dans les deux listes. Un micro coupé dans OBS compte comme muet.",
        fallback: true,
      },
    ],
    sliders: [
      {
        key: "foxComebackAfter",
        label: "Durée d'absence",
        help: "Ta voix muette, micro coupé compris.",
        steps: toSteps(60_000, 1_800_000, 60_000, toDelay),
        fallback: 300_000,
      },
    ],
    lists: [
      {
        key: "foxComebackToFenysk",
        label: "Phrases pour Fenysk",
        help: "Dites à ton retour, tournées vers Fenysk. Tirées avec les phrases pour le tchat, sans répéter. {absence} s'écrit « 12 minutes », « 1 heure 10 ».",
        rows: 5,
      },
      {
        key: "foxComebackToChat",
        label: "Phrases pour le tchat",
        help: "Dites à ton retour, tournées vers le tchat. {absence} s'écrit de même.",
        rows: 5,
      },
    ],
  },
  {
    title: "Balance du son",
    sliders: [
      {
        key: "foxBalanceMargin",
        label: "Écart du jeu sur ta voix",
        help: "Écart à partir duquel il alerte.",
        steps: toSteps(-12, 12, 1, toDecibels),
        fallback: 0,
      },
      {
        key: "foxBalanceAfter",
        label: "Durée du jeu trop fort",
        help: "Cumulée sur le temps où tu parles.",
        steps: toSteps(2000, 30_000, 1000, toSeconds),
        fallback: 10_000,
      },
      {
        key: "foxBalanceGap",
        label: "Écart entre deux alertes",
        help: "Au plus une alerte dans ce délai.",
        steps: toSteps(60_000, 1_800_000, 60_000, toDelay),
        fallback: 300_000,
      },
    ],
    lists: [
      {
        key: "foxBalanceAlerts",
        label: "Alertes du son",
        help: "Une alerte par ligne, dite à Fenysk quand le jeu couvre sa voix. Le son du PC se choisit dans settings.json (desktopName).",
        rows: 3,
      },
    ],
  },
  {
    title: "Quand le jeu explose",
    sliders: [
      {
        key: "foxStartleRise",
        label: "Hausse du son du PC",
        help: "Au moins cette hausse, en dB.",
        steps: toSteps(5, 60, 1, toDecibels),
        fallback: 20,
      },
      {
        key: "foxStartleWithin",
        label: "Durée de cette hausse",
        help: "En moins de ce temps.",
        steps: toSteps(50, 1000, 50, toSeconds),
        fallback: 300,
      },
      {
        key: "foxStartleLevel",
        label: "Level du son à dépasser",
        help: "Le pic doit aller au-dessus.",
        steps: toSteps(-40, 0, 1, toDecibels),
        fallback: -15,
      },
      {
        key: "foxStartleGap",
        label: "Écart entre deux sursauts",
        help: "Au plus un sursaut dans ce délai.",
        steps: toSteps(5000, 300_000, 5000, toDelay),
        fallback: 30_000,
      },
    ],
  },
  {
    title: "Heure du live",
    toggles: [
      {
        key: "foxShouldReviewAtEnd",
        label: "Bilan à la fin prévue",
        help: "Juste après l'annonce de la fin prévue, il dit le bilan du live : messages, personnes, le plus bavard, le premier arrivé. Le bouton « Faire le bilan » le dit à la demande.",
        fallback: true,
      },
    ],
    sliders: [
      {
        key: "foxOvertimeGap",
        label: "Écart entre deux rappels de fin",
        help: "Après la fin prévue.",
        steps: toSteps(60_000, 1_800_000, 60_000, toDelay),
        fallback: 600_000,
      },
      {
        key: "foxLateYawnMin",
        label: "Bâillement tardif : au plus tôt",
        help: "Au repos, sans partir.",
        steps: toSteps(60_000, 1_800_000, 60_000, toDelay),
        fallback: 300_000,
      },
      {
        key: "foxLateYawnMax",
        label: "Bâillement tardif : au plus tard",
        help: "Au repos, sans partir.",
        steps: toSteps(60_000, 1_800_000, 60_000, toDelay),
        fallback: 600_000,
      },
    ],
    times: [
      {
        key: "foxEndAt",
        label: "Fin prévue",
        help: "HH:MM, la prochaine fois qu'elle sonne. Vide : pas de fin prévue.",
        codec: END_AT_CODEC,
      },
      {
        key: "foxLateAfter",
        label: "Il bâille à partir de",
        help: "HH:MM, quand il n'y a pas de fin prévue. Avec une fin prévue, il bâille après elle.",
      },
    ],
    lists: [
      {
        key: "foxHourPhrases",
        label: "Heures pleines",
        help: "Une phrase par ligne, dite au tchat à chaque heure de live.",
        rows: 5,
      },
      {
        key: "foxEndWarningMarks",
        label: "Paliers d'avertissement",
        help: "Une ligne par palier, en minutes avant la fin prévue. Liste vide : aucun avertissement.",
        rows: 4,
      },
      {
        key: "foxEndWarningPhrases",
        label: "Avertissement calme",
        help: `Dit à Fenysk, plus de ${END_SOON_MINUTES} min avant la fin.`,
        rows: 3,
      },
      {
        key: "foxEndSoonPhrases",
        label: "Avertissement pressant",
        help: `Dit à Fenysk, de ${END_SOON_MINUTES} à ${END_PANIC_MINUTES + 1} min avant la fin.`,
        rows: 3,
      },
      {
        key: "foxEndPanicPhrases",
        label: "Avertissement paniqué",
        help: `Dit à Fenysk, ${END_PANIC_MINUTES} min et moins avant la fin.`,
        rows: 3,
      },
      {
        key: "foxEndPhrases",
        label: "Fin prévue",
        help: "Dit à Fenysk à l'heure de la fin prévue.",
        rows: 5,
      },
      {
        key: "foxOvertimePhrases",
        label: "Rappels après la fin",
        help: "Dits à Fenysk, un rappel par écart. Le troisième est remplacé par le coucher.",
        rows: 5,
      },
      {
        key: "foxBedtimePhrases",
        label: "Coucher",
        help: "Dit à la place du troisième rappel. Puis il s'en va, et ne rappelle plus la fin.",
        rows: 3,
      },
    ],
  },
  {
    title: "Prononciation",
    sliders: [],
    lists: [
      {
        key: "foxPronunciations",
        label: "Abréviations et noms",
        help: "Une ligne par mot : abréviation = forme dite. Pour tout ce qu'il dit, pseudos compris ; les majuscules sont ignorées.",
        rows: 14,
      },
    ],
  },
];

// La lecture du tchat : cinq curseurs et une liste ; les deux interrupteurs (« Lire le tchat », « Lire mes messages ») sont des
// cases (fox-settings-tab.tsx). Un message du tchat tient dans 500 caractères ; la valeur de repli est celle de settings.json.
export const FOX_READ_SLIDERS: readonly SliderSpec[] = [
  {
    key: "foxReadMaxLength",
    label: "Longueur d'un message lu",
    help: "Plus long, il n'est pas lu.",
    steps: toSteps(20, 300, 10, (value) => `${value} caractères`),
    fallback: 150,
  },
  {
    key: "foxCapitalsMaxLength",
    label: "Majuscules permises jusqu'à",
    help: "Un message court en majuscules est lu.",
    steps: toSteps(5, 60, 5, (value) => `${value} caractères`),
    fallback: 15,
  },
  {
    key: "foxReadGap",
    label: "Un message par viewer toutes les",
    help: "Un viewer ne repasse pas avant.",
    steps: toSteps(1000, 60_000, 1000, toSeconds),
    fallback: 10_000,
  },
  {
    key: "foxReadQueueSize",
    label: "Messages en attente",
    help: "Au-delà, le suivant n'est pas lu.",
    steps: toSteps(1, 10, 1, (value) => String(value)),
    fallback: 3,
  },
  {
    key: "foxReadMaxWait",
    label: "Attente d'un message au plus",
    help: "Plus ancien, il n'est plus lu.",
    steps: toSteps(30_000, 600_000, 30_000, toDelay),
    fallback: 120_000,
  },
];

// La liste de la lecture du tchat : les comptes masqués et jamais lus (chatBots).
export const FOX_READ_LISTS: readonly ListSpec[] = [
  {
    key: "chatBots",
    label: "Comptes ignorés",
    help: "Un compte par ligne. Leurs messages sont masqués du tchat affiché et jamais lus par Jean-Renard.",
    rows: 8,
  },
];

export const FOX_SLIDERS: readonly SliderSpec[] = [
  ...FOX_GROUPS.flatMap(({ sliders }) => sliders),
  ...FOX_READ_SLIDERS,
];

export const FOX_SLIDER_KEYS: readonly SliderKey[] = FOX_SLIDERS.map(({ key }) => key);

// Les listes de l'onglet : celles de tous ses groupes, puis celle de la lecture du tchat.
export const FOX_LISTS: readonly ListSpec[] = [
  ...FOX_GROUPS.flatMap(({ lists }) => lists ?? []),
  ...FOX_READ_LISTS,
];

// Les heures des groupes de l'onglet.
export const FOX_TIMES: readonly TimeSpec[] = FOX_GROUPS.flatMap(({ times }) => times ?? []);

// Les cases des groupes de l'onglet (les deux de la lecture du tchat sont à part).
export const FOX_TOGGLES: readonly ToggleSpec[] = FOX_GROUPS.flatMap(({ toggles }) => toggles ?? []);

// Tout ce que l'onglet règle : « Revenir aux valeurs par défaut » ne touche qu'à ces clés.
export const FOX_KEYS: readonly string[] = [
  ...FOX_SLIDER_KEYS,
  ...FOX_LISTS.map(({ key }) => key),
  ...FOX_TIMES.map(({ key }) => key),
  ...FOX_TOGGLES.map(({ key }) => key),
  "foxVoice",
  "foxShouldReadChat",
  "foxShouldReadOwn",
];

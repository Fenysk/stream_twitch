// Les curseurs de l'onglet « Renard » : chaque durée et chaque seuil de A (il parle), B (il est au repos), C (il cligne), D (il
// t'écoute), E et G (réaction et coucou), F et H (il bâille, s'en va et revient), puis la lecture du tchat.
// La voix se choisit dans une liste, pas à un curseur. Les crans, leur libellé et le type d'un curseur sont ceux de la tête.

import { type ListSpec, type SliderKey, type SliderSpec, type ToggleSpec, toSteps } from "./head-fields";

// La virgule française : 4 s, 1,5 s ; 1,5 %.
const toSeconds = (ms: number): string => `${String(ms / 1000).replace(".", ",")} s`;
const toPercent = (fraction: number): string =>
  `${String(Math.round(fraction * 1000) / 10).replace(".", ",")} %`;
const toDecibels = (value: number): string => `${value} dB`;
// 30 s, 1 min, 1,5 min, 3 min.
const toDelay = (ms: number): string =>
  ms < 60_000 ? toSeconds(ms) : `${String(ms / 60_000).replace(".", ",")} min`;

// Un groupe de l'onglet : des cases, des curseurs, puis des listes de phrases (une phrase par ligne).
export type FoxGroup = {
  title: string;
  toggles?: readonly ToggleSpec[];
  sliders: readonly SliderSpec[];
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
        label: "Durée de la réaction et du coucou",
        help: "Avant de lire le message.",
        steps: toSteps(250, 3000, 250, toSeconds),
        fallback: 1000,
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
        help: "Silence total, depuis son départ.",
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
    ],
  },
  {
    title: "Remerciements",
    toggles: [
      {
        key: "foxShouldThank",
        label: "Remercier les follows, subs et cheers",
        help: "Il revient, réagit, puis remercie par une phrase tirée dans la liste de l'évènement.",
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

// La lecture du tchat : cinq curseurs ; les deux interrupteurs (« Lire le tchat », « Lire mes messages ») sont des cases
// (fox-settings-tab.tsx). Un message du tchat tient dans 500 caractères ; la valeur de repli est celle de settings.json.
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

export const FOX_SLIDERS: readonly SliderSpec[] = [
  ...FOX_GROUPS.flatMap(({ sliders }) => sliders),
  ...FOX_READ_SLIDERS,
];

export const FOX_SLIDER_KEYS: readonly SliderKey[] = FOX_SLIDERS.map(({ key }) => key);

// Les listes de phrases de l'onglet, de tous ses groupes.
export const FOX_LISTS: readonly ListSpec[] = FOX_GROUPS.flatMap(({ lists }) => lists ?? []);

// Les cases des groupes de l'onglet (les deux de la lecture du tchat sont à part).
export const FOX_TOGGLES: readonly ToggleSpec[] = FOX_GROUPS.flatMap(({ toggles }) => toggles ?? []);

// Tout ce que l'onglet règle : « Revenir aux valeurs par défaut » ne touche qu'à ces clés.
export const FOX_KEYS: readonly string[] = [
  ...FOX_SLIDER_KEYS,
  ...FOX_LISTS.map(({ key }) => key),
  ...FOX_TOGGLES.map(({ key }) => key),
  "foxVoice",
  "foxShouldReadChat",
  "foxShouldReadOwn",
];

import { z } from "zod";

// Les 12 images du renard, toutes sur la même toile : le corps ne bouge pas d'une image à l'autre (CDC du renard, §1).
export const FOX_IMAGES = [
  "left-closed-rest",
  "left-small-rest",
  "left-medium-rest",
  "left-large-rest",
  "right-closed-rest",
  "front-closed-rest",
  "shut-closed-rest",
  "front-smile-rest",
  "shut-yawn-cover",
  "front-smile-wave",
  "front-small-wave",
  "wink-tongue-rest",
] as const;

export const FoxImageSchema = z.enum(FOX_IMAGES);
export type FoxImage = z.infer<typeof FoxImageSchema>;

// La toile des images une fois recadrées (px) : le rapport de la page, et la taille conseillée de la source OBS.
export const FOX_CANVAS = { width: 648, height: 920 } as const;

// Les règles de l'animation (settings.json, `fox*`) : des dB, des ms, des fractions du corps.
export const FoxRulesSchema = z.object({
  smallThreshold: z.number(),
  mediumThreshold: z.number(),
  largeChance: z.number().min(0).max(1),
  bounce: z.number().min(0),
  breathPeriod: z.number().positive(),
  breath: z.number().min(0),
  gazeMin: z.number().positive(),
  gazeMax: z.number().positive(),
  blinkMin: z.number().positive(),
  blinkMax: z.number().positive(),
  blinkDuration: z.number().positive(),
  // Le temps entre deux regards quand il écoute (front ou droite).
  listenMin: z.number().positive(),
  listenMax: z.number().positive(),
  // H : les trois temps de son départ (il s'accroupit, saute, plonge hors de la source), puis son saut pour revenir (ms).
  // Le saut de joie d'un sub (ms).
  joyMs: z.number().positive(),
  crouchMs: z.number().positive(),
  jumpMs: z.number().positive(),
  diveMs: z.number().positive(),
  returnMs: z.number().positive(),
});
export type FoxRules = z.infer<typeof FoxRulesSchema>;

// Les trois réactions de E : l'image que le renard montre avant de lire un message qui contient un mot-clé.
export const REACTION_IMAGES = ["front-smile-rest", "left-large-rest", "wink-tongue-rest"] as const;
export const ReactionImageSchema = z.enum(REACTION_IMAGES);
export type ReactionImage = z.infer<typeof ReactionImageSchema>;

// Ce que le renard montre en plus de sa bouche (le serveur le décide, la page l'affiche) : rien de particulier, il écoute
// Alexis, il réagit à un message, il fait coucou à un viewer, il bâille, il s'adresse à Fenysk (tourné vers la droite, en
// miroir), il saute de joie (un sub), il sursaute (Fenysk crie : tourné vers lui, la tête choquée), il sursaute avec le jeu
// (un pic du son du PC : la tête choquée, tourné vers le tchat).
export const FoxModeSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("idle") }),
  z.object({ kind: z.literal("listening") }),
  z.object({ kind: z.literal("reaction"), image: ReactionImageSchema }),
  z.object({ kind: z.literal("wave") }),
  z.object({ kind: z.literal("yawn") }),
  z.object({ kind: z.literal("address") }),
  z.object({ kind: z.literal("joy") }),
  z.object({ kind: z.literal("flinch") }),
  z.object({ kind: z.literal("startle") }),
]);
export type FoxMode = z.infer<typeof FoxModeSchema>;

// Son humeur selon le tchat : ordinaire, joyeux (le tchat s'anime) ou boudeur (le tchat se tait). Elle ne change que ses regards
// au repos (la page les tire) et la phrase de la reprise (le serveur la dit).
export const AttitudeSchema = z.enum(["plain", "cheerful", "sulking"]);
export type Attitude = z.infer<typeof AttitudeSchema>;

// H : s'il est visible, s'il glisse vers le bas, s'il est parti, ou s'il revient en sautant.
export const PresenceViewSchema = z.enum(["visible", "leaving", "away", "returning"]);
export type PresenceView = z.infer<typeof PresenceViewSchema>;

// Où une page montre le renard : `screen`, la page `/fox` (la source d'OBS) ; `preview`, l'aperçu de l'onglet Renard.
// Chaque page le déclare en se connectant au flux.
export const FoxPlaceSchema = z.enum(["screen", "preview"]);
export type FoxPlace = z.infer<typeof FoxPlaceSchema>;

// Ce que le serveur envoie aux pages du renard : les règles appliquées (à la connexion, puis à chaque changement),
// l'adresse du WAV quand il doit parler, l'arrêt de la phrase en cours, et le nombre de pages `/fox` connectées (à la connexion, puis chaque fois qu'il
// change : c'est ce qui rend l'aperçu muet quand OBS a la page).
export const FoxEventSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("rules"), rules: FoxRulesSchema }),
  z.object({ kind: z.literal("speech"), url: z.string().min(1) }),
  z.object({ kind: z.literal("screens"), count: z.number().int().min(0) }),
  // La phrase en cours s'arrête (le message qu'il lisait vient d'être supprimé par un modo, ou Alexis parle).
  z.object({ kind: z.literal("stop") }),
  // Ce qu'il montre en plus de sa bouche (à la connexion, puis à chaque changement).
  z.object({ kind: z.literal("mode"), mode: FoxModeSchema }),
  // Sa présence (à la connexion, puis à chaque phase), avec le temps déjà écoulé dans cette phase.
  z.object({ kind: z.literal("presence"), presence: PresenceViewSchema, elapsed: z.number().min(0) }),
  // Son humeur (à la connexion, puis à chaque changement).
  z.object({ kind: z.literal("attitude"), attitude: AttitudeSchema }),
]);
export type FoxEvent = z.infer<typeof FoxEventSchema>;

// « Faire parler » : le texte que l'interface envoie, et l'adresse du WAV que le serveur rend.
export const SpeakRequestSchema = z.object({ text: z.string() });
export const SpeakAnswerSchema = z.object({ url: z.string().min(1) });

// « Faire le bilan » : le bilan que le serveur va dire.
export const ReviewAnswerSchema = z.object({ text: z.string().min(1) });

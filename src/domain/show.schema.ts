import { z } from "zod";
import { ChatMessageSchema } from "./chat.schema";

// Un rire enregistré d'un clip : le sound de la soundboard que la page joue elle-même, à l'instant `at` (ms depuis le début du clip
// confirmé). Sa version (l'adresse du fichier la porte) et son fader (un pourcentage) viennent de la soundboard au début de l'émission.
export const ShowLaughSchema = z.object({
  id: z.string().min(1),
  version: z.string().min(1),
  fader: z.number().min(0).max(100),
  at: z.number().int().min(0),
});
export type ShowLaugh = z.infer<typeof ShowLaughSchema>;

// Ce que la page `/show` reçoit d'un clip de l'émission : le nom de sa vidéo, son titre, sa version, le jour où il a été enregistré
// (AAAA-MM-JJ, écrit en petit au-dessus du titre du carton), la durée de sa partie gardée (ms, de quoi estimer le retour de Fenysk), ses
// rires, dans l'ordre de leur instant (vide : aucun, ou leurs sounds ont été supprimés depuis), et s'il a une phrase de fin. Les phrases
// restent sur le serveur : la page ne sait que s'il y en a une de fin.
export const ShowClipSchema = z.object({
  name: z.string().min(1),
  title: z.string(),
  version: z.string().min(1),
  day: z.string().regex(/^[0-9]{4}-[0-9]{2}-[0-9]{2}$/),
  durationMs: z.number().int().min(0),
  laughs: z.array(ShowLaughSchema),
  hasEndPhrase: z.boolean(),
});
export type ShowClip = z.infer<typeof ShowClipSchema>;

// Ce que la page reçoit en plus d'un clip, juste avant de le jouer : ses messages de tchat avec l'instant (ms depuis le début du clip
// confirmé) où ils paraissent, les instants où son son fait sursauter Jean-Renard, et combien de temps dure ce sursaut (ms). Sans tchat
// gardé avec le clip, la liste des messages est vide.
export const ShowChatEntrySchema = z.object({ at: z.number().min(0), message: ChatMessageSchema });
export type ShowChatEntry = z.infer<typeof ShowChatEntrySchema>;
export const ShowCuesSchema = z.object({
  chat: z.array(ShowChatEntrySchema),
  spikes: z.array(z.number().int().min(0)),
  startleMs: z.number().positive(),
});
export type ShowCues = z.infer<typeof ShowCuesSchema>;

// Où en est l'émission : arrêtée, en cours, ou finie alors que sa source est encore visible (elle ne repart qu'après avoir été
// cachée).
export const SHOW_STATUSES = ["idle", "running", "over"] as const;
export const ShowStatusSchema = z.enum(SHOW_STATUSES);

// Les temps d'une émission : l'ouverture de Jean-Renard, le carton d'un clip (index dans l'ordre de passage), le clip lui-même, la
// clôture.
export const SHOW_PHASES = ["opening", "card", "clip", "closing"] as const;
export const ShowPhaseSchema = z.enum(SHOW_PHASES);

// L'état de l'émission, tel que le serveur le dit aux pages (`/show`, `/countdown` et l'onglet Émission). `runId` change à chaque émission : une
// page qui en avait une autre sait que celle-ci est nouvelle. `lineup` : les clips de l'émission dans l'ordre de passage. `phase` et
// `index` : où la page en est, qu'elle dit au serveur. `startsAt` : l'instant (ms depuis l'epoch, horloge du serveur, la même machine
// qu'OBS) où la page commence l'ouverture, la fin de la sortie de Jean-Renard hors de /fox ; 0 sans émission. `returnAt` : l'instant
// estimé (ms, même horloge) où l'émission finit et Fenysk revient, que le serveur recalcule à chaque rapport de la page ; 0 sans émission.
// `showFader` : le fader de tout le son de l'émission (0 à 100 %), baissé pendant que Fenysk parle au mic et à 100 sinon, quel que soit
// `status`.
export const ShowStateSchema = z.object({
  status: ShowStatusSchema,
  runId: z.string(),
  lineup: z.array(ShowClipSchema),
  phase: ShowPhaseSchema,
  index: z.number().int().min(0),
  startsAt: z.number().min(0),
  returnAt: z.number().min(0),
  showFader: z.number().int().min(0).max(100),
});
export type ShowState = z.infer<typeof ShowStateSchema>;

export const IDLE_SHOW: ShowState = {
  status: "idle",
  runId: "",
  lineup: [],
  phase: "opening",
  index: 0,
  startsAt: 0,
  returnAt: 0,
  showFader: 100,
};

// Ce que la page dit au serveur : elle passe à ce temps (et à ce clip), ou l'émission est finie (`ended`).
export const ShowProgressSchema = z.object({
  runId: z.string().min(1),
  phase: z.enum([...SHOW_PHASES, "ended"]),
  index: z.number().int().min(0),
});
export type ShowProgress = z.infer<typeof ShowProgressSchema>;

// Faire dire une phrase de l'émission à Jean-Renard, dans `/show` : celle de l'ouverture ou de la clôture (tirée par le serveur), celle
// de début du clip `index` de l'émission (`clip`) ou sa phrase de fin (`clipEnd`), lues dans son JSON. La page ne donne jamais le texte.
// Le serveur rend la durée de la phrase en ms (0 : rien à dire).
export const ShowSpeakRequestSchema = z.discriminatedUnion("kind", [
  z.object({ runId: z.string().min(1), kind: z.literal("opening") }),
  z.object({ runId: z.string().min(1), kind: z.literal("closing") }),
  z.object({ runId: z.string().min(1), kind: z.literal("clip"), index: z.number().int().min(0) }),
  z.object({ runId: z.string().min(1), kind: z.literal("clipEnd"), index: z.number().int().min(0) }),
]);
export type ShowSpeakRequest = z.infer<typeof ShowSpeakRequestSchema>;
export const ShowSpeechSchema = z.object({ durationMs: z.number().min(0) });

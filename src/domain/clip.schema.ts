import { z } from "zod";
import { ChatMessageSchema } from "./chat.schema";

// Les clips sont les fichiers vidéo du dossier showClipsFolder. Durées, début et fin : en secondes.
export const CLIP_EXTENSIONS = [".mp4", ".mkv", ".mov"] as const;

// Un rire : le sound de la soundboard (son identifiant) joué à l'instant `at`, en secondes depuis le début du clip brut comme `start`
// et `end` : une recoupe laisse chaque rire sur son moment.
export const ClipLaughSchema = z.object({ at: z.number().min(0), sound: z.string().min(1) });
export type ClipLaugh = z.infer<typeof ClipLaughSchema>;

// Le JSON écrit à côté d'un clip confirmé (même nom, `.json`) : tout ce qu'Alexis a choisi, et d'où le clip vient. `processedName` :
// le nom réel du clip brut dans Traités (renommé « (2) » quand le nom y était pris) ; absent des JSON d'avant, `rawName` le remplace.
// `playCount` : combien de fois l'émission l'a passé (absent : jamais), de quoi passer les moins vus d'abord. `laughs` : les rires posés
// sur le clip, triés par `at` (absent ou vide : aucun rire). `laughFader` : le volume de tous les rires du clip, de 0 à 100 % (absent : 100).
// `rawDuration` : la durée du clip brut (s), de quoi placer le tchat sur le
// clip. `spikes` : les instants (ms depuis le début du clip confirmé) où son son fait sursauter Jean-Renard ; calculés une fois,
// absents tant qu'ils ne l'ont pas été.
export const ClipConfirmationSchema = z.object({
  title: z.string(),
  phrase: z.string(),
  start: z.number().min(0),
  end: z.number().positive(),
  rawName: z.string().min(1),
  processedName: z.string().min(1).optional(),
  confirmedAt: z.string().min(1),
  playCount: z.number().int().min(0).optional(),
  laughs: z.array(ClipLaughSchema).optional(),
  laughFader: z.number().int().min(0).max(100).optional(),
  rawDuration: z.number().positive().optional(),
  spikes: z.array(z.number().int().min(0)).optional(),
});
export type ClipConfirmation = z.infer<typeof ClipConfirmationSchema>;

// Un clip brut de la liste : son nom de fichier, sa date (ms) et sa durée, `null` quand ffprobe ne la lit pas.
export const ClipSummarySchema = z.object({
  name: z.string().min(1),
  modifiedAt: z.number(),
  duration: z.number().min(0).nullable(),
});
export type ClipSummary = z.infer<typeof ClipSummarySchema>;

// Un clip confirmé de la liste « Clips de l'émission » : ce que dit son JSON, le nom de sa vidéo dans Confirmés, sa version (la date
// et la taille du fichier : l'adresse de la vidéo la porte, une version remplacée ne se confond pas avec l'ancienne), et le nom de son
// clip brut dans Traités (`null` : il n'y est plus, début et fin ne se changent plus).
export const ConfirmedSummarySchema = ClipConfirmationSchema.omit({ processedName: true }).extend({
  name: z.string().min(1),
  version: z.string().min(1),
  processedName: z.string().min(1).nullable(),
});
export type ConfirmedSummary = z.infer<typeof ConfirmedSummarySchema>;

// La liste des clips bruts, de la plus récente à la plus ancienne, et les clips confirmés (vidéo et JSON présents), du plus
// récemment validé au plus ancien.
export const ClipListSchema = z.object({
  clips: z.array(ClipSummarySchema),
  confirmedCount: z.number().int().min(0),
  confirmed: z.array(ConfirmedSummarySchema),
});
export type ClipList = z.infer<typeof ClipListSchema>;

// Ce que l'interface envoie pour valider : le clip brut, son titre, la phrase de Jean-Renard (vide : il se tait) et la partie gardée.
// Pour modifier un clip confirmé, la même forme : `name` est alors celui de sa vidéo dans Confirmés. `laughs` : les rires posés sur le
// clip (absent : aucun), `laughFader` : leur volume (absent : 100) ; leur forme se vérifie dans `toConfirmChoice`, qui refuse en français.
export const ConfirmRequestSchema = z.object({
  name: z.string(),
  title: z.string(),
  phrase: z.string(),
  start: z.number(),
  end: z.number(),
  laughs: z.array(z.object({ at: z.number(), sound: z.string() })).optional(),
  laughFader: z.number().optional(),
});
export type ConfirmRequest = z.infer<typeof ConfirmRequestSchema>;

// Ce que l'interface envoie pour jeter un clip brut, ou retirer un clip confirmé de l'émission.
export const DiscardRequestSchema = z.object({ name: z.string() });

// Ce que le serveur rend une fois le clip rangé : son nom dans Confirmés (valider, modifier) ou dans Traités (jeter, retirer).
export const ClipDoneSchema = z.object({ name: z.string().min(1) });
export type ClipDone = z.infer<typeof ClipDoneSchema>;

// Le tchat d'un clip (`<nom du clip>.chat.json`, à côté du clip) : l'heure (ms) où OBS a sauvegardé le clip, et les messages tels
// que la page du tchat les reçoit, de quoi les réafficher plus tard avec le même rendu.
export const ClipChatSchema = z.object({ savedAt: z.number(), messages: z.array(ChatMessageSchema) });
export type ClipChat = z.infer<typeof ClipChatSchema>;

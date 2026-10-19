import { z } from "zod";
import { END_DIRECTIONS } from "./hours.rules";
import { IDLE_PICTURE, PictureStateSchema } from "./picture.schema";
import { ViewersStateSchema } from "./viewers.schema";

// Un message que la régie envoie au chat : de 1 à 500 caractères (la limite de Twitch).
export const CHAT_TEXT_MAX = 500;

// Un micro de la régie : le mic du PC (`pc`) ou celui d'une caméra connectée (`camera-3`). `isOpen` : OBS ne l'a pas coupé.
// `isAvailable` : OBS connaît son entrée (la source navigateur de la caméra existe).
export const ControlMicSchema = z.object({
  id: z.string().min(1),
  label: z.string().min(1),
  isOpen: z.boolean(),
  isAvailable: z.boolean(),
});
export type ControlMic = z.infer<typeof ControlMicSchema>;

// Ce que le serveur dit à un téléphone Régie, à la connexion puis à chaque changement. `isLinked` : le serveur est joint à OBS (sinon
// le reste est vide). `broadcast.durationMs` : la durée du live à l'instant où le serveur l'envoie, que la page fait avancer seule.
// `scene` : la scène du programme. `onAir` : les numéros des caméras dont une source est visible dans cette scène (scènes et groupes
// compris). `endAt` : la fin prévue du live (ms depuis 1970), `null` : aucune. `picture` : les membres de la place caméra et celui qui est à
// l'image (voir picture.schema.ts).
export const ControlStateSchema = z.object({
  isLinked: z.boolean(),
  broadcast: z.object({ isLive: z.boolean(), durationMs: z.number().min(0) }),
  viewers: ViewersStateSchema,
  scene: z.string().nullable(),
  scenes: z.array(z.string()),
  mics: z.array(ControlMicSchema),
  onAir: z.array(z.number().int().min(1)),
  endAt: z.number().nullable(),
  picture: PictureStateSchema,
});
export type ControlState = z.infer<typeof ControlStateSchema>;

// Ce que la page voit tant que le serveur n'a rien dit.
export const IDLE_CONTROL: ControlState = {
  isLinked: false,
  broadcast: { isLive: false, durationMs: 0 },
  viewers: { kind: "unknown" },
  scene: null,
  scenes: [],
  mics: [],
  onAir: [],
  endAt: null,
  picture: IDLE_PICTURE,
};

// Ce que la régie demande au serveur.
export const SceneRequestSchema = z.object({ name: z.string().min(1, "la scène ne peut pas être vide") });
export const MicRequestSchema = z.object({ id: z.string().min(1, "le micro ne peut pas être vide") });
export const EndRequestSchema = z.object({ direction: z.enum(END_DIRECTIONS) });
export const ChatSendRequestSchema = z.object({
  text: z
    .string("le message doit être un texte")
    .trim()
    .min(1, "le message ne peut pas être vide")
    .max(CHAT_TEXT_MAX, `le message fait ${CHAT_TEXT_MAX} caractères au plus`),
});

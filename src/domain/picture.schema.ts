import { z } from "zod";

// Un membre de la place caméra : ce qu'OBS peut montrer à l'image. `id` : `pc`, `head` ou `camera-3` (le même texte que le micro du PC ou
// d'une caméra). `isAvailable` : sa source peut être montrée (une caméra dont le téléphone ne filme plus vers OBS ne l'est pas).
export const PictureMemberSchema = z.object({
  id: z.string().min(1),
  label: z.string().min(1),
  isAvailable: z.boolean(),
});
export type PictureMember = z.infer<typeof PictureMemberSchema>;

// L'image : les membres de la place, dans l'ordre PC, caméras par numéro, Tête, et celui qui est affiché (`null` : aucun, ou pas de place).
export const PictureStateSchema = z.object({
  members: z.array(PictureMemberSchema),
  currentId: z.string().nullable(),
});
export type PictureState = z.infer<typeof PictureStateSchema>;

// Ce que la page voit tant que le serveur n'a rien dit, ou quand OBS n'a pas la place.
export const IDLE_PICTURE: PictureState = { members: [], currentId: null };

// Ce que la régie, le téléphone qui filme et le Stream Deck demandent : ce membre à l'image. `isMicKept` : le micro du live reste où il est
// au lieu de suivre l'image (le bouton qui coupe la caméra d'un téléphone passe l'image à la tête sans lui retirer le micro).
export const PictureRequestSchema = z.object({
  id: z.string().min(1, "l'image ne peut pas être vide"),
  isMicKept: z.boolean("doit être true ou false").optional(),
});
export type PictureRequest = z.infer<typeof PictureRequestSchema>;

// Où en est l'image pour un téléphone qui filme : OBS a une place caméra, ce téléphone est le membre à l'image, et le nom du membre qui
// l'est (`null` : aucun). Le serveur le redit au téléphone à chaque changement.
export const PictureStandingSchema = z.object({
  hasPlace: z.boolean(),
  isCurrent: z.boolean(),
  shown: z.string().nullable(),
});
export type PictureStanding = z.infer<typeof PictureStandingSchema>;

export const IDLE_STANDING: PictureStanding = { hasPlace: false, isCurrent: false, shown: null };

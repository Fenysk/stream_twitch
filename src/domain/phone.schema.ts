import { z } from "zod";
import { ControlStateSchema } from "./control.schema";
import { PictureStandingSchema } from "./picture.schema";

// Ce que fait un téléphone : filmer sur un trépied (camera), tenir la régie (control) ou se filmer (selfie, qui compte aussi comme
// une caméra).
export const PHONE_ROLES = ["camera", "control", "selfie"] as const;
export const PhoneRoleSchema = z.enum(PHONE_ROLES);
export type PhoneRole = z.infer<typeof PhoneRoleSchema>;

// Le numéro d'une caméra, de 1 à 9999 : il fait l'hôte `camera-<numéro>.localhost` et l'adresse `/camera/<numéro>` de sa source OBS.
export const MAX_CAMERA_NUMBER = 9999;
export const CameraNumberSchema = z
  .number("le numéro doit être un nombre")
  .int("le numéro est un nombre entier")
  .min(1, "le numéro commence à 1")
  .max(MAX_CAMERA_NUMBER, `le numéro va jusqu'à ${MAX_CAMERA_NUMBER}`);

// Un identifiant que la page choisit elle-même : celui d'un téléphone (gardé par lui), d'une page OBS (le temps de sa vie) ou d'une
// session de mise en relation.
export const ClientIdSchema = z
  .string()
  .regex(/^[A-Za-z0-9_-]{8,64}$/, "l'identifiant doit faire 8 à 64 caractères simples");

// Un candidat ICE : une adresse où l'autre côté peut joindre ce côté.
export const CandidateSchema = z.object({
  candidate: z.string().min(1).max(2000),
  sdpMid: z.string().nullable(),
  sdpMLineIndex: z.number().int().nullable(),
});
export type Candidate = z.infer<typeof CandidateSchema>;

const DescriptionSchema = z.string().min(1).max(60_000);

// Un signal : un message de mise en relation WebRTC. Le téléphone envoie l'offre, la page OBS répond, et chacun envoie ses candidats.
// `session` nomme une mise en relation : un signal d'une session abandonnée est ignoré.
export const SignalSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("offer"), session: ClientIdSchema, description: DescriptionSchema }),
  z.object({ kind: z.literal("answer"), session: ClientIdSchema, description: DescriptionSchema }),
  z.object({ kind: z.literal("candidate"), session: ClientIdSchema, candidate: CandidateSchema }),
]);
export type Signal = z.infer<typeof SignalSchema>;

// Ce que le serveur dit à un téléphone : son numéro (vide : son rôle n'a pas de caméra), la page OBS de ce numéro (vide : aucune), les
// signaux de cette page, au téléphone qui a la régie l'état de la régie (OBS, viewers, live) à la connexion puis à chaque changement,
// et au téléphone qui filme si sa caméra est à l'antenne (une source de ce numéro est visible dans la scène du programme d'OBS) et si son
// mic est celui du live (le premier mic ouvert dans OBS est celui de sa caméra), et où en est l'image pour lui (est-il à l'image, qui l'est).
export const PhoneEventSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("number"), number: CameraNumberSchema.nullable() }),
  z.object({ kind: z.literal("screen"), screenId: ClientIdSchema.nullable() }),
  z.object({ kind: z.literal("signal"), signal: SignalSchema }),
  z.object({ kind: z.literal("control"), state: ControlStateSchema }),
  z.object({ kind: z.literal("air"), isOnAir: z.boolean() }),
  z.object({ kind: z.literal("mic"), isLive: z.boolean() }),
  z.object({ kind: z.literal("picture"), standing: PictureStandingSchema }),
]);
export type PhoneEvent = z.infer<typeof PhoneEventSchema>;

// Ce que le serveur dit à une page OBS : si son téléphone est là (et qu'elle est la page active de son numéro), et ses signaux.
export const ScreenEventSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("phone"), isPresent: z.boolean() }),
  z.object({ kind: z.literal("signal"), signal: SignalSchema }),
]);
export type ScreenEvent = z.infer<typeof ScreenEventSchema>;

// Un signal posté au serveur, avec celui qui l'envoie : le serveur le fait passer de l'autre côté.
export const SignalRequestSchema = z.discriminatedUnion("from", [
  z.object({ from: z.literal("phone"), phoneId: ClientIdSchema, signal: SignalSchema }),
  z.object({ from: z.literal("screen"), screenId: ClientIdSchema, signal: SignalSchema }),
]);
export type SignalRequest = z.infer<typeof SignalRequestSchema>;

// Un téléphone qui change de numéro de caméra, et le numéro qu'il garde.
export const NumberRequestSchema = z.object({ phoneId: ClientIdSchema, number: CameraNumberSchema });
export type NumberRequest = z.infer<typeof NumberRequestSchema>;
export const NumberAnswerSchema = z.object({ number: CameraNumberSchema });

const UrlNumberSchema = z
  .string()
  .regex(/^[1-9][0-9]{0,3}$/, "le numéro doit être un entier de 1 à 9999")
  .transform(Number);

// L'adresse du flux d'un téléphone (`?id=…&role=…&number=…`) et celle du flux d'une page OBS (`?id=…&number=…`). `number` du téléphone :
// celui qu'il a gardé, absent à sa première ouverture.
export const PhoneQuerySchema = z.object({
  id: ClientIdSchema,
  role: PhoneRoleSchema,
  number: UrlNumberSchema.optional(),
});
export const ScreenQuerySchema = z.object({ id: ClientIdSchema, number: UrlNumberSchema });

// Ce que dit un côté de la liaison, pour que le serveur sache si l'image d'une caméra arrive vraiment dans OBS : le téléphone dit s'il filme
// (`isFilming`, faux quand sa caméra est arrêtée : Safari en arrière-plan, un appel), la page OBS de son numéro dit si sa liaison avec lui est
// vive (`isLinked`, vrai tant que la mise en relation WebRTC est établie).
export const LinkRequestSchema = z.discriminatedUnion("from", [
  z.object({ from: z.literal("phone"), phoneId: ClientIdSchema, isFilming: z.boolean() }),
  z.object({ from: z.literal("screen"), screenId: ClientIdSchema, isLinked: z.boolean() }),
]);
export type LinkRequest = z.infer<typeof LinkRequestSchema>;

// Un téléphone connecté, tel que l'onglet « Mobile » le voit. `hasScreen` : la page OBS de son numéro est ouverte. `isReceiving` : son image
// arrive dans OBS, c'est-à-dire que cette page est ouverte, que sa liaison est vive et que le téléphone filme.
export const PhoneSummarySchema = z.object({
  id: ClientIdSchema,
  role: PhoneRoleSchema,
  number: CameraNumberSchema.nullable(),
  hasScreen: z.boolean(),
  isReceiving: z.boolean(),
});
export type PhoneSummary = z.infer<typeof PhoneSummarySchema>;

// L'état que l'onglet « Mobile » reçoit à la connexion puis à chaque changement : l'origine d'où les téléphones ouvrent /mobile
// (`mobileOrigin`, vide : pas réglée) et les téléphones connectés.
export const MobileStateSchema = z.object({
  origin: z.string().nullable(),
  phones: z.array(PhoneSummarySchema),
});
export type MobileState = z.infer<typeof MobileStateSchema>;

// Le `?role=` de /mobile : un rôle inconnu vaut aucun rôle.
export const MobileSearchSchema = z.object({ role: PhoneRoleSchema.optional().catch(undefined) });

// Les clips côté page : ce que l'onglet Émission demande au serveur. Chaque demande rend une réponse ou le refus à montrer,
// jamais une exception (même mécanique que les expressions).

import {
  type ClipDone,
  ClipDoneSchema,
  type ClipList,
  ClipListSchema,
  type ConfirmRequest,
} from "../domain/clip.schema";
import { type Answer, ask } from "./expressions-api";

const JSON_HEADERS = { "content-type": "application/json" };

const toDone = (body: unknown): ClipDone | undefined => {
  const parsed = ClipDoneSchema.safeParse(body);
  return parsed.success ? parsed.data : undefined;
};

// Les clips bruts du dossier d'OBS, du plus récent au plus ancien, et le nombre de clips confirmés.
export const listClips = (): Promise<Answer<ClipList>> =>
  ask("/api/clips", { method: "GET" }, (body) => {
    const parsed = ClipListSchema.safeParse(body);
    return parsed.success ? parsed.data : undefined;
  });

// La vidéo d'un clip brut, servie en flux par le serveur (le lecteur se déplace dedans grâce aux requêtes `Range`).
export const toClipVideoUrl = (name: string): string => `/api/clips/video?name=${encodeURIComponent(name)}`;

// « Valider » : le serveur recode la partie choisie (~1 min pour 2 minutes, la réponse n'arrive qu'à la fin) et range le clip.
export const confirmClip = (request: ConfirmRequest): Promise<Answer<ClipDone>> =>
  ask("/api/clips/confirm", { method: "POST", headers: JSON_HEADERS, body: JSON.stringify(request) }, toDone);

// Le clip brut d'un clip confirmé, rangé dans Traités : l'éditeur le lit pour changer son début et sa fin.
export const toProcessedVideoUrl = (name: string): string =>
  `/api/clips/processed-video?name=${encodeURIComponent(name)}`;

// « Enregistrer » sur un clip confirmé : titre et phrase réécrivent son JSON ; un autre début ou une autre fin le recodent depuis son
// clip brut (la réponse n'arrive qu'à la fin).
export const reviseClip = (request: ConfirmRequest): Promise<Answer<ClipDone>> =>
  ask("/api/clips/revise", { method: "POST", headers: JSON_HEADERS, body: JSON.stringify(request) }, toDone);

// « Retirer de l'émission » : la vidéo confirmée, son JSON et son chat passent dans Traités.
export const withdrawClip = (name: string): Promise<Answer<ClipDone>> =>
  ask(
    "/api/clips/withdraw",
    { method: "POST", headers: JSON_HEADERS, body: JSON.stringify({ name }) },
    toDone,
  );

// « Jeter » : le clip brut passe dans Traités.
export const discardClip = (name: string): Promise<Answer<ClipDone>> =>
  ask(
    "/api/clips/discard",
    { method: "POST", headers: JSON_HEADERS, body: JSON.stringify({ name }) },
    toDone,
  );

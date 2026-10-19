import { type FetchFn, type PostOutcome, postServer } from "./server-request";

// OBS montre l'élément, puis le micro change : plus long qu'une lecture de réglages, bien plus court que la synthèse d'une phrase.
const NEXT_TIMEOUT_MS = 10_000;

export type PictureOutcome = PostOutcome;

// Un appui sur la touche « Image » : le serveur passe au membre suivant (PC, les caméras disponibles par numéro, Tête, puis PC) et lui
// donne le micro. Le titre de la touche vient du flux, pas de cette réponse.
export const sendPictureNext = (baseUrl: string, fetchFn: FetchFn = fetch): Promise<PictureOutcome> =>
  postServer(`${baseUrl}/api/obs/picture/next`, {}, NEXT_TIMEOUT_MS, fetchFn);

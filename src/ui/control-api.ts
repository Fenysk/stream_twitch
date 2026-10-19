// La régie côté page : ce que ses touches demandent au serveur. Chaque demande rend une réponse ou le refus à montrer, jamais une
// exception. Les refus du serveur sont déjà en français. (Les sons et le bilan ont leur API : sounds-api.ts et fox-api.ts.)

import { type ChatViewer, ChatViewersAnswerSchema } from "../domain/chat-viewers.schema";
import type { EndDirection } from "../domain/hours.rules";
import { type Answer, ask } from "./expressions-api";

const post = (path: string, body: object): Promise<Answer<true>> =>
  ask(
    path,
    { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) },
    () => true,
  );

// Passe cette scène d'OBS à l'antenne.
export const updateScene = (name: string): Promise<Answer<true>> => post("/api/obs/scene", { name });

// Ouvre ce micro (`pc` ou `camera-3`) dans OBS et coupe tous les autres.
export const updateMic = (id: string): Promise<Answer<true>> => post("/api/obs/mic", { id });

// Met ce membre de la place caméra (`pc`, `head` ou `camera-3`) à l'image dans OBS ; le micro le suit, sauf avec `isMicKept`.
export const updatePicture = (id: string, isMicKept = false): Promise<Answer<true>> =>
  post("/api/obs/picture", isMicKept ? { id, isMicKept } : { id });

// Les personnes connectées au chat, triées par pseudo : le serveur les lit chez Twitch à chaque demande, et le refus (il faut reconnecter
// Twitch pour ce droit) revient en une phrase.
export const listChatViewers = (): Promise<Answer<ChatViewer[]>> =>
  ask("/api/chat/viewers", { method: "GET" }, (body) => {
    const answer = ChatViewersAnswerSchema.safeParse(body);
    return answer.success ? answer.data.viewers : undefined;
  });

// Arrête le live dans OBS (la régie l'a fait confirmer).
export const stopLive = (): Promise<Answer<true>> => post("/api/obs/stream/stop", {});

// Un cran sur la fin prévue du live : dix minutes plus tard ou plus tôt.
export const updateEnd = (direction: EndDirection): Promise<Answer<true>> =>
  post("/api/fox/end", { direction });

// Écrit ce message dans le chat, au nom du compte Twitch connecté.
export const sendChatMessage = (text: string): Promise<Answer<true>> => post("/api/chat/send", { text });

// L'image du retour antenne (JPEG de la scène du programme), ou `null` : OBS non joint, serveur muet ou demande abandonnée. Rien n'est
// annoncé : l'appelant redemande à son prochain tour.
export const getMonitorImage = async (signal: AbortSignal): Promise<Blob | null> => {
  try {
    const response = await fetch("/api/obs/monitor", { cache: "no-store", signal });
    return response.ok ? await response.blob() : null;
  } catch {
    return null;
  }
};

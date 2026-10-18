// L'émission côté page : ce que la page `/show` demande au serveur. Chaque demande rend une réponse ou le refus, jamais une exception.

import type { HeadView } from "../domain/head.types";
import {
  SHOW_HEAD_EVENT,
  type ShowCues,
  ShowCuesSchema,
  type ShowProgress,
  type ShowSpeakRequest,
  ShowSpeechSchema,
  type ShowState,
  ShowStateSchema,
} from "../domain/show.schema";
import { type Answer, ask } from "./expressions-api";
import { toHeadListener } from "./head-listener";

// L'état de l'émission, tel que le serveur le dit : tout de suite à la connexion, puis à chaque changement (EventSource se reconnecte
// seul). `isPage` : la page `/show`, que le serveur compte (sans page, l'émission s'arrête) ; sans, l'onglet Émission. `onHead` : la vue
// de la tête de Fenysk, que le serveur envoie à la page `/show` dans ce même flux (évènement `head`) : la page n'a pas de connexion de plus ;
// sans `onHead`, rien ne l'écoute. Rend de quoi fermer le flux.
export const watchShowState = (
  isPage: boolean,
  onState: (state: ShowState) => void,
  onHead?: (view: HeadView) => void,
): (() => void) => {
  const source = new EventSource(isPage ? "/api/show/events?place=page" : "/api/show/events");
  source.onmessage = (message: MessageEvent<string>) => {
    const parsed = ShowStateSchema.safeParse(JSON.parse(message.data));
    if (parsed.success) onState(parsed.data);
    else console.error("État de l'émission illisible :", parsed.error.message);
  };
  if (onHead) source.addEventListener(SHOW_HEAD_EVENT, toHeadListener(onHead));
  return () => source.close();
};

const asJson = (body: unknown): RequestInit => ({
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify(body),
});

// La page dit au serveur où elle en est (le serveur refuse quand elle parle d'une autre émission que la courante).
export const reportShowProgress = (progress: ShowProgress): Promise<Answer<null>> =>
  ask("/api/show/progress", asJson(progress), () => null);

// La vidéo d'un clip confirmé, servie en flux par le serveur. Sa version fait partie de l'adresse : un clip recodé a une autre adresse,
// le navigateur ne rejoue jamais l'ancienne vidéo.
export const toShowVideoUrl = (name: string, version: string): string =>
  `/api/show/video?name=${encodeURIComponent(name)}&v=${encodeURIComponent(version)}`;

// Le tchat d'un clip placé sur le clip, ses sursauts et leur durée, juste avant de le jouer. Le serveur mesure le son d'un clip qui n'a
// pas encore ses sursauts : un instant de plus la première fois.
export const getShowCues = (name: string, version: string): Promise<Answer<ShowCues>> =>
  ask(
    `/api/show/cues?name=${encodeURIComponent(name)}&v=${encodeURIComponent(version)}`,
    { method: "GET", cache: "no-store" },
    (body) => {
      const parsed = ShowCuesSchema.safeParse(body);
      return parsed.success ? parsed.data : undefined;
    },
  );

// Fait dire à Jean-Renard une phrase de l'émission (l'ouverture, la clôture, celle d'un clip) : rend sa durée en ms une fois que la
// voix part (0 : rien à dire).
export const speakInShow = (request: ShowSpeakRequest): Promise<Answer<number>> =>
  ask("/api/show/speak", asJson(request), (body) => {
    const parsed = ShowSpeechSchema.safeParse(body);
    return parsed.success ? parsed.data.durationMs : undefined;
  });

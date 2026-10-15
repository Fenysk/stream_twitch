// Les sons côté page : ce que l'interface demande au serveur. Chaque demande rend une réponse ou le refus à montrer, jamais une
// exception (même mécanique que les expressions). Les refus du serveur sont déjà en français, on les affiche tels quels.

import {
  type RewardChoices,
  RewardChoicesSchema,
  type SoundInput,
  SoundListSchema,
  type SoundSummary,
  SoundSummarySchema,
} from "../domain/sound.schema";
import { type Answer, ask } from "./expressions-api";

const JSON_HEADERS = { "content-type": "application/json" };

const asJson = (method: "POST" | "PUT", body: SoundInput): RequestInit => ({
  method,
  headers: JSON_HEADERS,
  body: JSON.stringify(body),
});

const toSummary = (body: unknown): SoundSummary | undefined => {
  const summary = SoundSummarySchema.safeParse(body);
  return summary.success ? summary.data : undefined;
};

export const listSounds = (): Promise<Answer<SoundSummary[]>> =>
  ask("/api/sounds", { method: "GET" }, (body) => {
    const list = SoundListSchema.safeParse(body);
    return list.success ? list.data.sounds : undefined;
  });

// Les récompenses de la chaîne qui n'ont pas de son, et les sons dont la récompense a disparu de Twitch.
export const listRewardChoices = (): Promise<Answer<RewardChoices>> =>
  ask("/api/rewards", { method: "GET" }, (body) => {
    const choices = RewardChoicesSchema.safeParse(body);
    return choices.success ? choices.data : undefined;
  });

export const createSound = (input: SoundInput): Promise<Answer<SoundSummary>> =>
  ask("/api/sounds", asJson("POST", input), toSummary);

export const updateSound = (id: string, input: SoundInput): Promise<Answer<SoundSummary>> =>
  ask(`/api/sounds/${encodeURIComponent(id)}`, asJson("PUT", input), toSummary);

export const deleteSound = (id: string): Promise<Answer<string>> =>
  ask(`/api/sounds/${encodeURIComponent(id)}`, { method: "DELETE" }, () => id);

// « Jouer dans OBS » : le son rejoint la queue du serveur.
export const playSound = (id: string): Promise<Answer<true>> =>
  ask(
    `/api/sounds/${encodeURIComponent(id)}/play`,
    { method: "POST", headers: JSON_HEADERS, body: "{}" },
    () => true,
  );

// « Couper le son » : le son en cours s'arrête dans OBS, la queue se vide.
export const stopSounds = (): Promise<Answer<true>> =>
  ask("/api/sounds/stop", { method: "POST", headers: JSON_HEADERS, body: "{}" }, () => true);

// La page /sounds répond au serveur quand un son a fini ou raté. Un échec se dit dans la console de la page : personne
// n'attend cette réponse, le serveur coupera de lui-même un son resté sans réponse.
export const reportSound = (playId: string, outcome: "ended" | "failed", reason?: string): void => {
  void fetch("/api/sounds/played", {
    method: "POST",
    headers: JSON_HEADERS,
    body: JSON.stringify({ playId, outcome, ...(reason === undefined ? {} : { reason }) }),
  }).catch((error: unknown) => console.error("Sons : le serveur ne répond pas", error));
};

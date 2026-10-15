// Les phrases de Jean-Renard par récompense, côté page : ce que l'onglet demande au serveur. Chaque demande rend une réponse ou
// le refus à montrer, jamais une exception. Les refus du serveur sont déjà en français, on les affiche tels quels.

import { SpeakAnswerSchema } from "../domain/fox.schema";
import {
  type RewardPhrasesEntry,
  RewardPhrasesInputSchema,
  RewardPhrasesListSchema,
} from "../domain/reward-phrase.schema";
import { type Answer, ask } from "./expressions-api";

const JSON_HEADERS = { "content-type": "application/json" };

// Toutes les récompenses de la chaîne avec leurs phrases, puis celles qui ont disparu de Twitch et en gardent.
export const listRewardPhrases = (): Promise<Answer<RewardPhrasesEntry[]>> =>
  ask("/api/reward-phrases", { method: "GET" }, (body) => {
    const list = RewardPhrasesListSchema.safeParse(body);
    return list.success ? list.data.rewards : undefined;
  });

// Remplace les phrases d'une récompense (une liste vide les retire) ; rend celles que le serveur a gardées.
export const updateRewardPhrases = (id: string, phrases: string[]): Promise<Answer<string[]>> =>
  ask(
    `/api/reward-phrases/${encodeURIComponent(id)}`,
    { method: "PUT", headers: JSON_HEADERS, body: JSON.stringify({ phrases }) },
    (body) => {
      const saved = RewardPhrasesInputSchema.safeParse(body);
      return saved.success ? saved.data.phrases : undefined;
    },
  );

// « Tester » : une phrase de la récompense est dite tout de suite, avec Fenysk pour {user}.
export const testRewardPhrases = (id: string): Promise<Answer<string>> =>
  ask(
    `/api/reward-phrases/${encodeURIComponent(id)}/test`,
    { method: "POST", headers: JSON_HEADERS, body: "{}" },
    (body) => {
      const parsed = SpeakAnswerSchema.safeParse(body);
      return parsed.success ? parsed.data.url : undefined;
    },
  );

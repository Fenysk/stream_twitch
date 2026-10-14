// Le renard côté page : ce que l'onglet demande au serveur. Chaque demande rend une réponse ou le refus à montrer, jamais
// une exception (même mécanique que les expressions).

import { ReviewAnswerSchema, SpeakAnswerSchema } from "../domain/fox.schema";
import { type Voice, VoicesSchema } from "../domain/voice.schema";
import { type Answer, ask } from "./expressions-api";

export const listVoices = (): Promise<Answer<Voice[]>> =>
  ask("/api/fox/voices", { method: "GET" }, (body) => {
    const parsed = VoicesSchema.safeParse(body);
    return parsed.success ? parsed.data.voices : undefined;
  });

// Dit le texte dans l'aperçu et dans OBS : rend l'adresse du WAV une fois la synthèse faite.
export const speak = (text: string): Promise<Answer<string>> =>
  ask(
    "/api/fox/speak",
    { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ text }) },
    (body) => {
      const parsed = SpeakAnswerSchema.safeParse(body);
      return parsed.success ? parsed.data.url : undefined;
    },
  );

// Fait le bilan du live : rend ce que le renard va dire, ou pourquoi il ne dit rien.
export const review = (): Promise<Answer<string>> =>
  ask(
    "/api/fox/review",
    { method: "POST", headers: { "content-type": "application/json" }, body: "{}" },
    (body) => {
      const parsed = ReviewAnswerSchema.safeParse(body);
      return parsed.success ? parsed.data.text : undefined;
    },
  );

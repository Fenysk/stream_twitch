import { toPhraseBinding } from "../../src/domain/deck.rules";
import type { PhraseBinding } from "../../src/domain/deck.schema";
import { SettingsRefusalSchema } from "../../src/domain/settings.schema";
import { toSpeechText } from "../../src/domain/voice.rules";
import { toPhraseName } from "./deck-catalogue";
import { UNSET_TITLE } from "./key-behaviours";
import { type FetchFn, requestServer } from "./server-request";

// Ce que la touche demande au serveur : la route, et son corps JSON.
export type PhraseRequest = { path: string; body: unknown };

// Le serveur synthétise la phrase avant de répondre : plus long qu'une lecture de réglages.
const SPEAK_TIMEOUT_MS = 30_000;

// Le texte que le renard dira (nettoyé comme le serveur le fait), ou le bilan. Rien à envoyer pour un texte vide.
export const toPhraseRequest = (binding: PhraseBinding): PhraseRequest | undefined => {
  if (binding.kind === "review") return { path: "/api/fox/review", body: {} };
  const text = toSpeechText(binding.text);
  return text === null ? undefined : { path: "/api/fox/speak", body: { text } };
};

// La touche garde son nom : le serveur ne change rien à ce qu'elle montre.
export const toPhraseTitle = (raw: unknown): string => {
  const binding = toPhraseBinding(raw);
  return binding ? toPhraseName(binding) : UNSET_TITLE;
};

export type PhraseOutcome =
  | { ok: true }
  | { ok: false; reason: "unavailable" }
  | { ok: false; reason: "refused"; status: number; message: string | undefined };

export const sendPhrase = async (
  baseUrl: string,
  { path, body }: PhraseRequest,
  fetchFn: FetchFn = fetch,
): Promise<PhraseOutcome> => {
  const reply = await requestServer(`${baseUrl}${path}`, fetchFn, {
    method: "POST",
    body,
    timeoutMs: SPEAK_TIMEOUT_MS,
  });
  if (reply.kind === "down") return { ok: false, reason: "unavailable" };
  if (reply.isOk) return { ok: true };
  // Tous les refus du serveur ont la même forme : { issues: [{ path, message }] } (http.ts, refuse).
  const refusal = SettingsRefusalSchema.safeParse(reply.body);
  return {
    ok: false,
    reason: "refused",
    status: reply.status,
    message: refusal.success ? refusal.data.issues[0]?.message : undefined,
  };
};

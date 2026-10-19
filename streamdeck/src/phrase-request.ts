import { toPhraseBinding } from "../../src/domain/deck.rules";
import type { PhraseBinding } from "../../src/domain/deck.schema";
import { toSpeechText } from "../../src/domain/voice.rules";
import { toPhraseName } from "./deck-catalogue";
import { UNSET_TITLE } from "./key-behaviours";
import { type FetchFn, type PostOutcome, postServer } from "./server-request";

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

export type PhraseOutcome = PostOutcome;

export const sendPhrase = (
  baseUrl: string,
  { path, body }: PhraseRequest,
  fetchFn: FetchFn = fetch,
): Promise<PhraseOutcome> => postServer(`${baseUrl}${path}`, body, SPEAK_TIMEOUT_MS, fetchFn);

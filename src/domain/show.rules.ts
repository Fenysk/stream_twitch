// Les règles de l'émission : quels clips la composent, quand paraissent leur tchat et leurs sursauts, combien de temps dure chaque temps.

import type { ClipChat, ClipLaugh } from "./clip.schema";
import { isLaughKept } from "./laugh.rules";
import type { ShowChatEntry } from "./show.schema";
import type { Trim } from "./trim.rules";

// Combien de clips une émission passe quand les réglages ne le disent pas (`showClipCount`).
export const DEFAULT_SHOW_CLIP_COUNT = 5;

// Un clip confirmé candidat à l'émission : son nom et combien de fois l'émission l'a déjà passé.
export type LineupCandidate = { name: string; playCount: number };

// Les clips d'une émission : au plus `count`, les moins passés d'abord, au hasard entre ceux qui l'ont été autant (le tri est stable,
// le mélange d'avant décide de l'ordre des ex æquo).
export const toLineup = (
  candidates: readonly LineupCandidate[],
  count: number,
  random: () => number,
): string[] => {
  const shuffled = [...candidates];
  for (let index = shuffled.length - 1; index > 0; index -= 1) {
    const other = Math.min(index, Math.floor(random() * (index + 1)));
    const kept = shuffled[index];
    const swapped = shuffled[other];
    if (kept && swapped) {
      shuffled[index] = swapped;
      shuffled[other] = kept;
    }
  }
  return shuffled
    .sort((first, second) => first.playCount - second.playCount)
    .slice(0, Math.max(0, count))
    .map(({ name }) => name);
};

// La phrase de Jean-Renard : `repliedAt` est depuis combien de ms le temps (carton, ouverture, clôture) dure quand le serveur a dit
// que la phrase part (la synthèse vient avant) ; `durationMs`, la durée de la phrase. Sans phrase : `null`.
export type SpeechTiming = { repliedAt: number; durationMs: number };

// Le temps total en ms : jusqu'à la fin de la phrase plus `afterMs`, et au moins `minMs`.
const toSpeechMs = (speech: SpeechTiming | null, minMs: number, afterMs: number): number =>
  speech === null ? minMs : Math.max(minMs, speech.repliedAt + speech.durationMs + afterMs);

// Le carton reste au moins 3 s (de quoi lire le titre), et jusqu'à la fin de la phrase de Jean-Renard plus 0,5 s.
export const CARD_MIN_MS = 3000;
export const CARD_AFTER_SPEECH_MS = 500;

export const toCardMs = (speech: SpeechTiming | null): number =>
  toSpeechMs(speech, CARD_MIN_MS, CARD_AFTER_SPEECH_MS);

// L'ouverture et la clôture : au moins 2,5 s, et jusqu'à la fin de la phrase plus 0,7 s.
export const LINE_MIN_MS = 2500;
export const LINE_AFTER_SPEECH_MS = 700;

export const toLineMs = (speech: SpeechTiming | null): number =>
  toSpeechMs(speech, LINE_MIN_MS, LINE_AFTER_SPEECH_MS);

// Le jour où le clip a été enregistré (AAAA-MM-JJ) : celui du nom que lui donne OBS (« Replay 2026-10-15 15-09-05.mp4 »), sinon celui de
// sa validation (UTC).
export const toRecordedDay = ({ rawName, confirmedAt }: { rawName: string; confirmedAt: string }): string => {
  const named = /(20[0-9]{2}-(?:0[1-9]|1[0-2])-(?:0[1-9]|[12][0-9]|3[01]))/.exec(rawName);
  return named?.[1] ?? confirmedAt.slice(0, 10);
};

// Le bandeau de l'ouverture et celui de la clôture : le petit texte au-dessus, puis le titre en gros. Celui d'un clip porte le jour de
// son enregistrement puis son titre.
export const OPENING_BANNER = { kicker: "Ce soir", title: "Les bêtises de Fenysk" } as const;
export const CLOSING_BANNER = { kicker: "Fin de l'émission", title: "À la prochaine bêtise" } as const;

// Les phrases dites en plus de celles des listes ou des clips : après les rires enregistrés d'un clip.
export const LAUGH_PHRASE = "Les rires sont enregistrés. Personne n'a ri.";

// Après les rires, Jean-Renard dit sa phrase, puis le clip s'efface 0,5 s plus tard.
export const LAUGH_AFTER_SPEECH_MS = 500;

export const toLaughMs = (speech: SpeechTiming | null): number =>
  toSpeechMs(speech, 0, LAUGH_AFTER_SPEECH_MS);

// Le tchat réagit à ce qu'il voit : ses messages paraissent 4 s plus tôt que sur le direct (`showChatLead`, en ms).
export const DEFAULT_CHAT_LEAD_MS = 4000;

// Le clip dont on place le tchat : la partie gardée (`start` à `end`, en secondes depuis le début du clip brut) et la durée du clip brut.
export type ChatClip = { start: number; end: number; rawDuration: number };

// Les messages du tchat d'un clip, avec l'instant (ms depuis le début du clip confirmé) où ils paraissent. Le tchat est gardé à l'heure
// réelle (`receivedAt`) ; le clip brut finit à l'heure de la sauvegarde (`savedAt`) et dure `rawDuration`, donc commence avant, et la
// partie gardée commence `start` plus tard. Les messages d'avant ou d'après la partie gardée n'y sont pas ; chaque message avance de
// `leadMs` (sans passer avant le début du clip).
export const toChatSchedule = (chat: ClipChat, clip: ChatClip, leadMs: number): ShowChatEntry[] => {
  const keptStartedAt = chat.savedAt - clip.rawDuration * 1000 + clip.start * 1000;
  const keptMs = (clip.end - clip.start) * 1000;
  return chat.messages
    .map((message) => ({ at: message.receivedAt - keptStartedAt, message }))
    .filter(({ at }) => at >= 0)
    .map(({ at, message }) => ({ at: Math.max(0, at - leadMs), message }))
    .filter(({ at }) => at < keptMs)
    .sort((first, second) => first.at - second.at);
};

// Ce qui paraît entre deux instants du clip : de `from` (compris) à `to` (exclu), dans l'ordre. Deux appels qui se suivent (le `to`
// de l'un est le `from` de l'autre) ne perdent ni ne doublent rien.
export const toDue = <Entry extends { at: number }>(
  entries: readonly Entry[],
  from: number,
  to: number,
): Entry[] => entries.filter(({ at }) => at >= from && at < to);

// Un rire de l'émission : le sound et l'instant (ms depuis le début du clip confirmé) où il part.
export type ScheduledLaugh = { at: number; sound: string };

// Les rires d'un clip dans l'émission : ceux de la partie gardée seulement (`start` à `end`, bords compris : un rire à `end` part quand
// la vidéo finit), chacun à son instant depuis le début du clip confirmé, jamais négatif, par instant croissant.
export const toLaughSchedule = (laughs: readonly ClipLaugh[], trim: Trim): ScheduledLaugh[] =>
  laughs
    .filter(({ at }) => isLaughKept(at, trim))
    .map(({ at, sound }) => ({ at: Math.max(0, Math.round((at - trim.start) * 1000)), sound }))
    .sort((first, second) => first.at - second.at);

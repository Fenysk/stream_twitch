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
export const CLOSING_BANNER = { kicker: "Fin de l'émission", title: "À la prochaine !" } as const;

// La phrase des rires d'avant les phrases de fin : un JSON de clip avec des rires et sans `endPhrase` la reçoit à la lecture
// (`toEndPhraseJson`). Elle ne sert plus qu'à ça.
export const LAUGH_PHRASE = "Les rires sont enregistrés. Personne n'a ri.";

// Après le clip et ses rires, Jean-Renard dit la phrase de fin du clip, puis le clip s'efface 0,5 s plus tard.
export const END_AFTER_SPEECH_MS = 500;

export const toEndMs = (speech: SpeechTiming | null): number => toSpeechMs(speech, 0, END_AFTER_SPEECH_MS);

// Une phrase de Jean-Renard estimée pour compter ce qui reste : la synthèse ~1,5 s, puis ~4 s de phrase.
export const ESTIMATED_SPEECH: SpeechTiming = { repliedAt: 1500, durationMs: 4000 };

export type CountdownStep =
  | { phase: "opening" }
  | { phase: "card" | "clip" | "end"; index: number }
  | { phase: "closing" };

// Un clip compté : sa partie gardée en ms et s'il a une phrase de fin (un `ShowClip` comme un clip confirmé).
type CountdownClip = { durationMs: number; hasEndPhrase: boolean };

// Sans phrase de fin dans le clip, rien n'est dit après lui, quels que soient ses rires.
const toClipEndMs = ({ hasEndPhrase }: CountdownClip): number =>
  hasEndPhrase ? toEndMs(ESTIMATED_SPEECH) : 0;

// Un clip en entier : son carton, sa partie gardée, sa phrase de fin.
const toClipMs = (clip: CountdownClip): number =>
  toCardMs(ESTIMATED_SPEECH) + clip.durationMs + toClipEndMs(clip);

// Les ms entre le début de ce temps de l'émission et la fin de la clôture, phrases estimées.
export const toRemainingMs = (lineup: readonly CountdownClip[], step: CountdownStep): number => {
  const clipsFrom = (index: number): number =>
    lineup.slice(index).reduce((total, clip) => total + toClipMs(clip), 0);
  const closingMs = toLineMs(ESTIMATED_SPEECH);
  switch (step.phase) {
    case "opening":
      return toLineMs(ESTIMATED_SPEECH) + clipsFrom(0) + closingMs;
    case "card":
      return clipsFrom(step.index) + closingMs;
    case "clip": {
      const clip = lineup[step.index];
      return (clip ? clip.durationMs + toClipEndMs(clip) : 0) + clipsFrom(step.index + 1) + closingMs;
    }
    case "end":
      return toEndMs(ESTIMATED_SPEECH) + clipsFrom(step.index + 1) + closingMs;
    case "closing":
      return closingMs;
  }
};

type ShowLength = { shortestMs: number; longestMs: number };

// L'émission entière pour le tirage de `toLineup` le plus court et le plus long : les ex æquo du seuil se départagent, les autres non.
export const toShowLengthMs = (
  candidates: readonly (LineupCandidate & CountdownClip)[],
  count: number,
): ShowLength => {
  const wanted = Math.max(0, count);
  const ranked = [...candidates].sort((first, second) => first.playCount - second.playCount);
  const threshold = ranked[Math.min(wanted, ranked.length) - 1]?.playCount;
  const sure = ranked.filter(({ playCount }) => threshold !== undefined && playCount < threshold);
  const tied = ranked
    .filter(({ playCount }) => playCount === threshold)
    .sort((first, second) => toClipMs(first) - toClipMs(second));
  const places = wanted - sure.length;
  const lengthOf = (clips: readonly CountdownClip[]): number => toRemainingMs(clips, { phase: "opening" });
  return {
    shortestMs: lengthOf([...sure, ...tied.slice(0, places)]),
    longestMs: lengthOf([...sure, ...tied.slice(Math.max(0, tied.length - places))]),
  };
};

const MINUTE_MS = 60_000;

// « Retour de Fenysk dans 4 min » (minute supérieure), puis « dans moins d'une minute » à 60 s ou moins.
export const toCountdownText = (remainingMs: number): string =>
  remainingMs > MINUTE_MS
    ? `Retour de Fenysk dans ${Math.ceil(remainingMs / MINUTE_MS)} min`
    : "Retour de Fenysk dans moins d'une minute";

const toMinutes = (ms: number): number => Math.max(1, Math.round(ms / MINUTE_MS));

// « Durée estimée : 6 min », ou « 5 à 7 min » quand les deux arrondis à la minute diffèrent ; jamais moins d'une minute.
export const toShowLengthText = ({ shortestMs, longestMs }: ShowLength): string => {
  const shortest = toMinutes(shortestMs);
  const longest = toMinutes(longestMs);
  return shortest === longest
    ? `Durée estimée : ${shortest} min`
    : `Durée estimée : ${shortest} à ${longest} min`;
};

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

// Tout le son de l'émission (les vidéos des clips, les rires, la voix de Jean-Renard) baisse à 15 % pendant que Fenysk parle au mic, en
// fondu linéaire de 300 ms d'un fader à l'autre, et il remonte à 100 % deux secondes après la fin de sa voix (le delay passé,
// `TALK_HOLD_MS` de plus).
export const TALK_SHOW_FADER = 15;
export const TALK_FADE_MS = 300;
export const TALK_HOLD_MS = 2000;
const FULL_FADER = 100;

// Le fader voulu pour tout le son de l'émission, d'après depuis combien de ms (`silentFor`) Fenysk ne dit plus rien ; `delay` : celui de
// la détection de la tête.
export const toShowFader = (silentFor: number, delay: number): number =>
  silentFor < delay + TALK_HOLD_MS ? TALK_SHOW_FADER : FULL_FADER;

// Le son de l'émission est baissé : Fenysk parle, ou s'est tu depuis moins de `TALK_HOLD_MS` (delay compris). Sa tête paraît dans `/show`
// tant qu'il l'est, au même instant que le fader : un seul signal, un seul délai.
export const isShowLowered = (fader: number): boolean => fader < FULL_FADER;

// Le fader atteint `elapsed` ms après le début d'un fondu de `from` vers `to` : une rampe linéaire sur `TALK_FADE_MS`, bornée.
export const toFadingFader = (from: number, to: number, elapsed: number): number =>
  from + (to - from) * Math.min(1, Math.max(0, elapsed / TALK_FADE_MS));

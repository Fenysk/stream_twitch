import { isLoud, isTalking } from "./mouth.rules";

// Ce que le renard sait d'Alexis par le mic : le dernier level au-dessus du threshold, et depuis quand il parle sans
// interruption plus longue que le delay. C'est la détection de la tête (mouth.rules.ts), pas une seconde.
export type Voice = { lastLoudAt: number | null; talkingSince: number | null };

export const VOICE_START: Voice = { lastLoudAt: null, talkingSince: null };

export type VoiceInput = {
  now: number;
  // Le level du mic en dB à cet instant ; absent pour un simple passage du temps.
  level?: number | undefined;
  threshold: number;
  delay: number;
};

export function toNextVoice(previous: Voice, { now, level, threshold, delay }: VoiceInput): Voice {
  const lastLoudAt = level !== undefined && isLoud(level, threshold) ? now : previous.lastLoudAt;
  const isTalkingNow = isTalking(lastLoudAt, now, delay);
  return { lastLoudAt, talkingSince: isTalkingNow ? (previous.talkingSince ?? now) : null };
}

// Alexis parle : le level a dépassé le threshold il y a moins de `delay` ms.
export const isVoiceTalking = (voice: Voice, now: number, delay: number): boolean =>
  isTalking(voice.lastLoudAt, now, delay);

// Depuis combien de ms il ne dit plus rien (infini s'il n'a rien dit depuis le démarrage).
export const toSilentFor = (voice: Voice, now: number): number =>
  voice.lastLoudAt === null ? Number.POSITIVE_INFINITY : now - voice.lastLoudAt;

// Depuis combien de ms il parle sans s'arrêter (0 quand il se tait).
export const toTalkingFor = (voice: Voice, now: number): number =>
  voice.talkingSince === null ? 0 : now - voice.talkingSince;

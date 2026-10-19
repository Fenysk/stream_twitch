// La voix d'Alexis arrive plus faible d'un téléphone que du micro du PC. Le boost remonte la source de la caméra qui porte le micro du live,
// jamais celle du PC : quelques dB à la fois, d'après les crêtes de sa voix, jusqu'à la cible. Il ne descend jamais sous 0 dB (la voix du
// téléphone n'est jamais baissée sous son niveau d'origine) ni ne monte au-dessus de 30 dB (le maximum du filtre Gain d'OBS) ; un limiteur
// d'OBS tient les crêtes.

export const BOOST_MIN_DB = 0;
export const BOOST_MAX_DB = 30;
// Un cran de boost : au plus 6 dB, et la moitié de ce qui manque (la voix monte en se rapprochant de la cible sans la dépasser).
export const BOOST_STEP_MAX_DB = 6;
// Un écart à la cible de 1,5 dB ou moins n'est pas corrigé.
export const BOOST_TOLERANCE_DB = 1.5;
// Le boost est revu toutes les 2 s, d'après ce qu'Alexis a dit depuis.
export const BOOST_PERIOD_MS = 2000;
// Sous ce level (dB) rien n'est dit : un silence ou du bruit de fond ne compte pas. Le plancher se juge avant le boost : une lecture compte
// quand son level, boost retiré, atteint le plancher ; sinon le bruit de fond, remonté avec la voix, finirait par passer pour de la voix.
// -55 dB laisse passer une voix brute d'iPhone à distance de parole (-45 à -50 dB sans traitement vocal).
export const TALK_FLOOR_DB = -55;
// Il faut au moins 1 s de voix (20 lectures d'OBS, une toutes les 50 ms) pour juger ses crêtes.
export const TALK_MIN_READINGS = 20;
// Les crêtes de la voix : le level que 90 % des lectures de voix ne dépassent pas.
const TALK_PEAK_RANK = 0.9;

// Un boost valide : de 0 à 30 dB, au dixième de dB près.
export const toBoost = (db: number): number => {
  const clamped = Math.min(BOOST_MAX_DB, Math.max(BOOST_MIN_DB, db));
  return Math.round(clamped * 10) / 10;
};

// Les crêtes de la voix d'après les levels lus (dB, boost posé compris) : les silences et le bruit de fond sont écartés ; `null` quand il
// reste trop peu de voix pour en juger. `boostDb` : le boost posé quand les levels ont été lus, de quoi juger chaque lecture avant lui.
export const toTalkPeak = (levels: readonly number[], boostDb = 0): number | null => {
  const talk = levels.filter((level) => level - boostDb >= TALK_FLOOR_DB).sort((a, b) => a - b);
  if (talk.length < TALK_MIN_READINGS) return null;
  return talk[Math.floor((talk.length - 1) * TALK_PEAK_RANK)] ?? null;
};

// Le boost suivant : en dessous de la cible (de plus que la tolérance), il monte d'un cran ; sinon il reste. Il ne baisse jamais : une voix
// au-dessus de la cible garde son boost, le limiteur tient les crêtes.
export const toNextBoost = (current: number, peak: number, target: number): number => {
  const missing = target - peak;
  if (missing <= BOOST_TOLERANCE_DB) return toBoost(current);
  return toBoost(current + Math.min(BOOST_STEP_MAX_DB, missing / 2));
};

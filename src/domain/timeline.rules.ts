// La règle de temps de la timeline sous le lecteur : où poser les graduations d'un clip de `duration` secondes.

// Au plus dix libellés sur la règle, de zéro jusqu'à la durée.
export const RULER_MAX_LABELS = 10;

const STEPS = [1, 2, 5, 10, 15, 30, 60, 120, 300, 600, 900, 1800, 3600];
const HOUR_SECONDS = 3600;

const toTotal = (duration: number): number => (Number.isFinite(duration) ? Math.max(0, duration) : 0);

// Le plus petit pas rond (en secondes) qui garde dix libellés au plus ; au-delà de la dernière liste, des heures entières.
export const toRulerStep = (duration: number): number => {
  const total = toTotal(duration);
  const fits = STEPS.find((step) => Math.floor(total / step) < RULER_MAX_LABELS);
  return fits ?? Math.ceil(total / (RULER_MAX_LABELS - 1) / HOUR_SECONDS) * HOUR_SECONDS;
};

// Les instants des graduations : zéro, puis un pas après l'autre sans passer la durée.
export const toRulerTimes = (duration: number): number[] => {
  const step = toRulerStep(duration);
  const total = toTotal(duration);
  return Array.from({ length: Math.floor(total / step) + 1 }, (_, index) => index * step);
};

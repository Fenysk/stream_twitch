// Ce que la page écrit sur le corps du renard à chaque image : sa place (fraction de la toile vers le bas), son angle
// (degrés, autour de son centre) et l'échelle de son corps (ancré aux pieds).
export type FoxTransform = { offset: number; angle: number; scaleX: number; scaleY: number };

// Les pieds sont l'origine de l'échelle ; la rotation se fait autour du centre : on y va (-50 %), on tourne, on revient (50 %).
export const toFoxTransform = ({ offset, angle, scaleX, scaleY }: FoxTransform): string =>
  `translateY(${offset * 100 - 50}%) rotate(${angle}deg) translateY(50%) scale(${scaleX}, ${scaleY})`;

// Parler à Fenysk : il se retourne vers la droite de l'écran. Un retournement rapide, l'échelle horizontale du corps passe de
// 1 à -1 en traversant 0 (il est de profil un instant), puis toutes les images sont en miroir : les yeux qui regardaient à
// gauche regardent à droite, vers Fenysk. À la fin de la phrase, il se retourne dans l'autre sens.
export const FLIP_MS = 150;

// L'échelle horizontale de départ (`from`, entre -1 et 1), celle qu'il vise (`target`, 1 ou -1), l'instant du départ et la
// durée (une demi-course dure la moitié d'un retournement entier).
export type Mirror = { target: 1 | -1; from: number; at: number; ms: number };

export const MIRROR_START: Mirror = { target: 1, from: 1, at: 0, ms: FLIP_MS };

export function toMirrorScale(mirror: Mirror, now: number): number {
  const progress = Math.min(1, Math.max(0, (now - mirror.at) / mirror.ms));
  return mirror.from + (mirror.target - mirror.from) * progress;
}

// Le renard doit-il regarder vers la droite ? Un changement de sens en plein retournement repart de là où il en est.
export function toNextMirror(mirror: Mirror, isFacingRight: boolean, now: number): Mirror {
  const target = isFacingRight ? -1 : 1;
  if (target === mirror.target) return mirror;
  const from = toMirrorScale(mirror, now);
  return { target, from, at: now, ms: (FLIP_MS * Math.abs(target - from)) / 2 };
}

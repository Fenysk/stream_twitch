// Le saut de joie des remerciements d'un sub : un rebond franc. Il s'écrase pour prendre son élan, saute (9 % de la toile vers
// le haut : la marge au-dessus de lui), retombe et s'écrase un peu en arrivant, puis retrouve sa taille. `elapsed` : depuis
// combien de ms le mode a commencé ; `joyMs` : la durée du saut, réglable.
export type JoyBody = { offset: number; squashX: number; squashY: number };

// Sans saut de joie : à sa place, à sa taille.
export const NO_JOY: JoyBody = { offset: 0, squashX: 1, squashY: 1 };

export const JOY_HEIGHT = 0.09;
export const JOY_CROUCH = 0.18;
export const JOY_STRETCH = 0.08;
export const JOY_IMPACT = 0.12;
const TAKEOFF = 0.2;
const LANDING = 0.75;
const STRETCH_SHARE = 0.25;

const clamp = (value: number): number => Math.min(1, Math.max(0, value));
const easeInOut = (value: number): number => value * value * (3 - 2 * value);

// `stretch` est négatif quand il est écrasé, positif quand il est étiré.
const toBody = (offset: number, stretch: number): JoyBody => ({
  offset,
  squashX: 1 - stretch / 2,
  squashY: 1 + stretch,
});

// En l'air : étiré dès le décollage (de l'écrasement à l'étirement en un quart du vol), puis à sa taille à l'arrivée.
const toFlightStretch = (flight: number): number =>
  flight < STRETCH_SHARE
    ? -JOY_CROUCH + ((JOY_STRETCH + JOY_CROUCH) * flight) / STRETCH_SHARE
    : JOY_STRETCH * (1 - (flight - STRETCH_SHARE) / (1 - STRETCH_SHARE));

export function toJoyBody(elapsed: number, joyMs: number): JoyBody {
  const t = clamp(elapsed / joyMs);
  if (t >= 1) return toBody(0, 0);
  if (t < TAKEOFF) return toBody(0, -JOY_CROUCH * easeInOut(t / TAKEOFF));
  if (t < LANDING) {
    const flight = (t - TAKEOFF) / (LANDING - TAKEOFF);
    return toBody(-JOY_HEIGHT * Math.sin(Math.PI * flight), toFlightStretch(flight));
  }
  const landing = (t - LANDING) / (1 - LANDING);
  return toBody(0, -JOY_IMPACT * Math.sin(Math.PI * landing));
}

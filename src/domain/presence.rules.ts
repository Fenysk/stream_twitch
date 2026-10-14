import type { PresenceView } from "./fox.schema";

// H : il s'en va et revient. Au démarrage du serveur il est caché. Visible, il bâille quand il n'a pas parlé depuis `awayAfter` ms,
// puis il glisse vers le bas jusqu'à sortir de la source, et reste caché jusqu'à ce qu'un message du tchat soit accepté ou qu'on
// le fasse parler : il remonte alors en sautant. « Parler » : lire un message ou « Faire parler » ; le temps repart de zéro à la
// fin de chaque phrase.
export type PresenceKind = "visible" | "yawning" | "leaving" | "away" | "returning";

// `since` : depuis quand il est dans cette phase ; `spokeAt` : la fin de sa dernière phrase (ou son réveil, ou le départ).
export type PresenceState = { kind: PresenceKind; since: number; spokeAt: number };

export type PresenceRules = { awayAfter: number; yawnMs: number; leaveMs: number; returnMs: number };

// `wake` : un message est accepté, ou « Faire parler ». `spoke` : une phrase vient de finir. `leave` : il part maintenant (il
// bâille puis s'en va), sans attendre le délai.
export type PresenceEvent = "wake" | "spoke" | "leave";

// Le démarrage vaut un départ : caché, hors de l'écran, sans animation (la relance compte son silence depuis `since`).
export const toStartPresence = (now: number): PresenceState => ({
  kind: "away",
  since: now,
  spokeAt: now,
});

// Ce que les pages savent de sa présence (PresenceView) : la phase du bâillement est encore « visible » (le bâillement est un mode).
export const toPresenceView = ({ kind }: PresenceState): PresenceView =>
  kind === "yawning" ? "visible" : kind;

// Il n'est pas visible (il s'en va, il est parti, ou il revient) : « dormir », pour la récompense qui le réveille.
export const isAsleep = (presence: PresenceView): boolean => presence !== "visible";

const wake = (state: PresenceState, now: number): PresenceState => {
  switch (state.kind) {
    case "visible":
    case "returning":
      return { ...state, spokeAt: now };
    case "yawning":
      return { kind: "visible", since: now, spokeAt: now };
    case "leaving":
    case "away":
      return { kind: "returning", since: now, spokeAt: now };
  }
};

// Il part maintenant, s'il est là : il bâille, puis s'en va. Déjà en train de partir ou parti, rien ne change.
const leave = (state: PresenceState, now: number): PresenceState => {
  switch (state.kind) {
    case "visible":
    case "returning":
      return { ...state, kind: "yawning", since: now };
    case "yawning":
    case "leaving":
    case "away":
      return state;
  }
};

// Une phase finit à une date précise : un pas en retard (page cachée, serveur occupé) enchaîne les phases sans les décaler.
const toNextPhase = (state: PresenceState, now: number, rules: PresenceRules): PresenceState | null => {
  switch (state.kind) {
    case "visible": {
      const at = state.spokeAt + rules.awayAfter;
      return now >= at ? { kind: "yawning", since: at, spokeAt: state.spokeAt } : null;
    }
    case "yawning": {
      const at = state.since + rules.yawnMs;
      return now >= at ? { kind: "leaving", since: at, spokeAt: state.spokeAt } : null;
    }
    case "leaving": {
      const at = state.since + rules.leaveMs;
      return now >= at ? { kind: "away", since: at, spokeAt: state.spokeAt } : null;
    }
    case "returning": {
      const at = state.since + rules.returnMs;
      return now >= at ? { kind: "visible", since: at, spokeAt: state.spokeAt } : null;
    }
    case "away":
      return null;
  }
};

export function toNextPresence(
  previous: PresenceState,
  { now, event }: { now: number; event?: PresenceEvent | undefined },
  rules: PresenceRules,
): PresenceState {
  let state = previous;
  if (event === "spoke") state = { ...state, spokeAt: now };
  if (event === "wake") state = wake(state, now);
  if (event === "leave") state = leave(state, now);
  for (let phases = 0; phases < 4; phases += 1) {
    const next = toNextPhase(state, now, rules);
    if (!next) break;
    state = next;
  }
  return state;
}

// Dans combien de ms il est entièrement visible : tout de suite s'il l'est, sinon le reste du saut (ou le saut entier s'il
// faut encore le réveiller).
export function toVisibleIn(state: PresenceState, now: number, rules: PresenceRules): number {
  switch (state.kind) {
    case "visible":
    case "yawning":
      return 0;
    case "returning":
      return Math.max(0, state.since + rules.returnMs - now);
    case "leaving":
    case "away":
      return rules.returnMs;
  }
}

// La place du renard sur la page : 0 est sa place, 1 le dessous de la source (en entier hors d'elle).
export const HIDDEN_OFFSET = 1.05;

// Où il est et comment il est tourné : le décalage vers le bas (en fraction de la toile) et l'angle (en degrés).
export type Placement = { offset: number; angle: number };

// Ce que la page retient d'une phase de présence : laquelle, depuis combien de ms, et d'où elle part (sa place au moment
// où la phase a commencé : il peut remonter d'à mi-plongeon).
export type PresencePose = { kind: PresenceView; elapsed: number; from: Placement };

// Ce que la page dessine : sa place, son angle, et l'écrasement du corps (des multiples de l'échelle).
export type PresenceBody = Placement & { squashX: number; squashY: number };

// Les temps de son départ (il s'accroupit, saute, plonge) et de son saut pour revenir : les règles du flux du renard.
export type PresenceCurves = { crouchMs: number; jumpMs: number; diveMs: number; returnMs: number };

const clamp = (value: number): number => Math.min(1, Math.max(0, value));
const easeInOut = (value: number): number => value * value * (3 - 2 * value);
const easeOut = (value: number): number => 1 - (1 - value) * (1 - value);

// Le saut du retour : il monte jusqu'à 8 % au-dessus de sa place (0 à 60 % du temps), retombe (60 à 85 %), puis rebondit un
// peu en arrivant (3 % de sa taille). Vaut 1 au départ et 0 à l'arrivée, ce qui le fait partir de `from`.
const JUMP_RISE = 0.6;
const JUMP_LAND = 0.85;
const JUMP_PEAK = 1.08;
const JUMP_BOUNCE = 0.03;

export function toReturnCurve(value: number): number {
  const t = clamp(value);
  if (t < JUMP_RISE) return 1 - JUMP_PEAK * easeOut(t / JUMP_RISE);
  if (t < JUMP_LAND) {
    const fall = (t - JUMP_RISE) / (JUMP_LAND - JUMP_RISE);
    return (1 - JUMP_PEAK) * (1 - fall * fall);
  }
  return -JUMP_BOUNCE * Math.sin((Math.PI * (t - JUMP_LAND)) / (1 - JUMP_LAND));
}

// Le départ : il s'écrase de 20 % en s'accroupissant, se détend en sautant (9 % de la toile vers le haut : la marge au-dessus
// de lui), puis plonge, la chute accélérant, en tournant jusqu'à la tête en bas autour de son centre. Il regarde à gauche :
// son museau est de ce côté, la tête passe donc devant lui, vers la gauche (sens inverse des aiguilles d'une montre, un angle
// négatif en CSS), comme un plongeon vers l'avant.
export const CROUCH_SQUASH = 0.2;
export const TAKEOFF_STRETCH = 0.08;
export const DEPARTURE_JUMP_HEIGHT = 0.09;
export const DIVE_ANGLE = -180;
const TAKEOFF_SHARE = 0.3;

const toBody = (offset: number, angle: number, stretch: number): PresenceBody => ({
  offset,
  angle,
  squashX: 1 - stretch / 2,
  squashY: 1 + stretch,
});

// `stretch` est négatif quand il est écrasé, positif quand il est étiré, 0 à sa taille.
const toJumpStretch = (t: number): number =>
  t < TAKEOFF_SHARE
    ? -CROUCH_SQUASH + (TAKEOFF_STRETCH + CROUCH_SQUASH) * easeOut(t / TAKEOFF_SHARE)
    : TAKEOFF_STRETCH * (1 - (t - TAKEOFF_SHARE) / (1 - TAKEOFF_SHARE));

function toDeparture(elapsed: number, { crouchMs, jumpMs, diveMs }: PresenceCurves): PresenceBody {
  if (elapsed < crouchMs) return toBody(0, 0, -CROUCH_SQUASH * easeInOut(elapsed / crouchMs));
  const flying = elapsed - crouchMs;
  if (flying < jumpMs) {
    const t = flying / jumpMs;
    return toBody(-DEPARTURE_JUMP_HEIGHT * easeOut(t), 0, toJumpStretch(t));
  }
  const t = clamp((flying - jumpMs) / diveMs);
  const offset = -DEPARTURE_JUMP_HEIGHT + (HIDDEN_OFFSET + DEPARTURE_JUMP_HEIGHT) * t * t;
  return toBody(offset, DIVE_ANGLE * easeInOut(t), 0);
}

// Il revient de là où il est : du bas, en sautant ; d'au-dessus de sa place (réveillé pendant l'écrasement ou le saut), il
// se pose simplement. Un angle de plongeon se redresse pendant les premiers 40 % du saut, du même côté qu'il a tourné : le
// signe de l'angle de départ est gardé jusqu'à 0.
const RIGHTING_SHARE = 0.4;

function toReturn(elapsed: number, from: Placement, returnMs: number): PresenceBody {
  const t = clamp(elapsed / returnMs);
  const offset = from.offset > 0 ? from.offset * toReturnCurve(t) : from.offset * (1 - easeOut(t));
  return toBody(offset, from.angle * (1 - easeOut(clamp(t / RIGHTING_SHARE))), 0);
}

export function toPresenceBody({ kind, elapsed, from }: PresencePose, curves: PresenceCurves): PresenceBody {
  switch (kind) {
    case "visible":
      return toBody(0, 0, 0);
    case "away":
      return toBody(HIDDEN_OFFSET, 0, 0);
    case "leaving":
      return toDeparture(elapsed, curves);
    case "returning":
      return toReturn(elapsed, from, curves.returnMs);
  }
}

// La pose que la page prend quand le serveur annonce une phase : elle part de là où le renard est (un retour en plein
// plongeon remonte d'à mi-chemin, la tête en bas). Une page qui se connecte en plein retour sans avoir vu le départ le fait
// remonter du bas.
export function toNextPose(
  previous: PresencePose,
  { presence, elapsed }: { presence: PresenceView; elapsed: number },
  curves: PresenceCurves,
): PresencePose {
  const { offset, angle } = toPresenceBody(previous, curves);
  const isMissed = presence === "returning" && previous.kind === "visible";
  return {
    kind: presence,
    elapsed,
    from: isMissed ? { offset: HIDDEN_OFFSET, angle: 0 } : { offset, angle },
  };
}

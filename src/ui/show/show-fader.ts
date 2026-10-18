// Le fader du son de l'émission : un fader nouveau y vient en fondu linéaire, de la valeur atteinte, et chaque pas est appliqué à toutes les sorties.

import { TALK_FADE_MS, toFadingFader } from "../../domain/show.rules";

// Le fondu avance toutes les 20 ms.
const FADE_STEP_MS = 20;

export type ShowFader = { update(fader: number): void; stop(): void };

// Pose `initial` tout de suite. `update` fond vers un nouveau fader en `TALK_FADE_MS` (un fondu en cours est remplacé, il repart de la
// valeur atteinte) ; `stop` annule le fondu. `apply` reçoit chaque fader atteint : un seul calcul pour les vidéos, les rires et la voix.
export const createShowFader = (apply: (fader: number) => void, initial: number): ShowFader => {
  let reached = initial;
  let target = initial;
  let timer: ReturnType<typeof setInterval> | undefined;

  const reach = (fader: number) => {
    reached = fader;
    apply(fader);
  };
  const cancel = () => {
    clearInterval(timer);
    timer = undefined;
  };

  reach(initial);
  return {
    update(fader) {
      if (fader === target) return;
      target = fader;
      cancel();
      const from = reached;
      const startedAt = Date.now();
      timer = setInterval(() => {
        const elapsed = Date.now() - startedAt;
        reach(toFadingFader(from, fader, elapsed));
        if (elapsed >= TALK_FADE_MS) cancel();
      }, FADE_STEP_MS);
    },
    stop: cancel,
  };
};

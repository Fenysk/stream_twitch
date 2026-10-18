// Le fader du son des deux <video> de la page `/show` : un fader nouveau y vient en fondu linéaire, de la valeur atteinte.

import { TALK_FADE_MS, toFadingFader } from "../../domain/show.rules";
import type { Slot } from "./show-view";

// Le fondu avance toutes les 20 ms.
const FADE_STEP_MS = 20;

export type ClipFader = { update(fader: number): void; stop(): void };

// Pose `initial` tout de suite. `update` fond vers un nouveau fader en `TALK_FADE_MS` (un fondu en cours est remplacé, il repart de la
// valeur atteinte) ; `stop` annule le fondu.
export const createClipFader = (
  videoOf: (slot: Slot) => HTMLVideoElement | null,
  initial: number,
): ClipFader => {
  let reached = initial;
  let target = initial;
  let timer: ReturnType<typeof setInterval> | undefined;

  const apply = (fader: number) => {
    reached = fader;
    for (const video of [videoOf(0), videoOf(1)]) if (video) video.volume = fader / 100;
  };
  const cancel = () => {
    clearInterval(timer);
    timer = undefined;
  };

  apply(initial);
  return {
    update(fader) {
      if (fader === target) return;
      target = fader;
      cancel();
      const from = reached;
      const startedAt = Date.now();
      timer = setInterval(() => {
        const elapsed = Date.now() - startedAt;
        apply(toFadingFader(from, fader, elapsed));
        if (elapsed >= TALK_FADE_MS) cancel();
      }, FADE_STEP_MS);
    },
    stop: cancel,
  };
};

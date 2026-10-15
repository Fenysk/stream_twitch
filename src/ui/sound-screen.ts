// La page /sounds : elle joue les sons que le serveur lui envoie, un à la fois, et lui répond quand un son a fini ou raté.
// Elle ne connaît que ce petit port (SoundPlayer) ; sound-audio.ts l'implémente avec le navigateur, les tests avec un faux.

import type { SoundEvent } from "../domain/sound.schema";

export type SoundTrack = { stop(): void };

export type SoundPlayer = {
  // Joue le son à ce fader (0 à 100 %). `onEnd` à la fin ; `onFail` si le navigateur ne peut pas le lire. `stop` ne déclenche
  // ni l'un ni l'autre.
  start(
    sound: { soundId: string; version: string; fader: number },
    listener: { onEnd(): void; onFail(reason: string): void },
  ): SoundTrack;
};

export type SoundReport = (playId: string, outcome: "ended" | "failed", reason?: string) => void;

export type SoundScreen = { handle(event: SoundEvent): void; close(): void };

export function createSoundScreen({
  player,
  report,
}: {
  player: SoundPlayer;
  report: SoundReport;
}): SoundScreen {
  let current: SoundTrack | undefined;

  const halt = () => {
    current?.stop();
    current = undefined;
  };

  return {
    handle(event) {
      if (event.kind === "stop") {
        halt();
        return;
      }
      // Le serveur n'envoie jamais deux sons à la fois ; un son encore en cours serait coupé plutôt que superposé.
      halt();
      const { playId, soundId, version, fader } = event;
      let isReported = false;
      const answer = (outcome: "ended" | "failed", reason?: string) => {
        if (isReported) return;
        isReported = true;
        current = undefined;
        report(playId, outcome, reason);
      };
      const track = player.start(
        { soundId, version, fader },
        { onEnd: () => answer("ended"), onFail: (reason) => answer("failed", reason) },
      );
      // Un son déjà fini ou raté au retour de `start` n'est plus en cours.
      current = isReported ? undefined : track;
    },
    close: halt,
  };
}

// Ce qui accompagne un clip pendant qu'il joue : la page reçoit la position de la vidéo (ms) plusieurs fois par seconde, et fait paraître
// ce qui est arrivé depuis la fois d'avant : les messages du tchat d'origine, le sursaut de Jean-Renard sur chaque spike du son, et
// chaque rire à son instant.

import type { ChatMessage } from "../../domain/chat.schema";
import { toDue } from "../../domain/show.rules";
import type { ShowCues, ShowLaugh } from "../../domain/show.schema";

export type TickerActions = {
  addChat(messages: ChatMessage[]): void;
  // Jean-Renard sursaute pendant `ms`.
  startle(ms: number): void;
  // Le sound du rire part, par-dessus le son du clip.
  startLaugh(laugh: ShowLaugh): void;
};

// `cues` : rien quand le serveur ne les a pas données (ni tchat ni sursaut). `laughs` : par instant croissant.
export type TickerSource = { cues: ShowCues | null; laughs: readonly ShowLaugh[] };

export type ShowTicker = {
  // Un pas du clip à `ms` : chaque message, chaque spike et chaque rire n'est dit qu'une fois, quelle que soit la cadence des positions
  // reçues.
  tick(ms: number): void;
  // La vidéo est finie : les rires pas encore partis (posés à la fin, ou après la dernière position lue) partent tous.
  end(): void;
};

export const createShowTicker = (
  { cues, laughs }: TickerSource,
  { addChat, startle, startLaugh }: TickerActions,
): ShowTicker => {
  const spikes = (cues?.spikes ?? []).map((at) => ({ at }));
  let from = 0;
  return {
    tick(ms) {
      if (cues) {
        addChat(toDue(cues.chat, from, ms).map(({ message }) => message));
        if (toDue(spikes, from, ms).length > 0) startle(cues.startleMs);
      }
      for (const laugh of toDue(laughs, from, ms)) startLaugh(laugh);
      from = ms;
    },
    end() {
      for (const laugh of toDue(laughs, from, Number.POSITIVE_INFINITY)) startLaugh(laugh);
      from = Number.POSITIVE_INFINITY;
    },
  };
};

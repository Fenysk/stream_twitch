import type { ViewersState } from "./viewers.types";

// Le texte d'une touche de Stream Deck : le nombre (0 compris), « Hors ligne » sur deux lignes, ou « ? ».
export const toViewersTitle = (state: ViewersState): string => {
  switch (state.kind) {
    case "live":
      return String(state.count);
    case "offline":
      return "Hors\nligne";
    case "unknown":
      return "?";
  }
};

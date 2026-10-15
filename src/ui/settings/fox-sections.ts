// Les cinq sous-onglets de l'onglet « Renard » : le libellé de chacun, et ses cartes dans l'ordre. Une carte se nomme par son
// titre : un groupe de FOX_GROUPS, ou l'une des deux cartes écrites à la main (la voix, la lecture du tchat). Chaque carte est
// dans exactement un sous-onglet : fox-sections.test.ts le vérifie.

import { FOX_SECTION_IDS, type FoxSectionId } from "../../domain/fox-section.schema";
import type { SegmentedOption } from "../design/segmented";

export const VOICE_CARD = "Voix";
export const CHAT_READING_CARD = "Lecture du tchat";

export type FoxSection = { label: string; cards: readonly string[] };

export const FOX_SECTIONS: Record<FoxSectionId, FoxSection> = {
  voice: { label: "Voix", cards: [VOICE_CARD, "Prononciation"] },
  body: { label: "Corps", cards: ["Quand il parle", "Au repos", "Clignement", "Quand il s'ennuie"] },
  listening: {
    label: "Écoute",
    cards: ["Quand tu parles", "Réaction et coucou", CHAT_READING_CARD, "Relance"],
  },
  events: {
    label: "Évènements",
    cards: ["Remerciements", "Récompenses de points de chaîne", "Habitués", "Heure du live"],
  },
  reactions: {
    label: "Réactions",
    cards: [
      "Humeur du tchat",
      "Quand tu cries",
      "Quand tu parles longtemps",
      "Balance du son",
      "Quand le jeu explose",
    ],
  },
};

export const FOX_SECTION_CHOICES: readonly SegmentedOption<FoxSectionId>[] = FOX_SECTION_IDS.map((id) => ({
  value: id,
  label: FOX_SECTIONS[id].label,
}));

// Les onglets du menu de réglages, rangés en groupes dans l'ordre du menu : ceux qui ont une route (`path`), puis ceux qui
// arrivent plus tard (`isSoon`) : grisés, sans route, ils ne mènent nulle part. Un groupe vide ne s'affiche pas
// (WindowNav) : un nouveau groupe peut attendre son premier onglet.

import {
  CalendarDays,
  Clapperboard,
  Coins,
  MessageSquare,
  PawPrint,
  Radio,
  Scissors,
  Smile,
  Tv,
} from "lucide-react";

export const SECTION_GROUPS = [
  {
    id: "live",
    label: "En direct",
    sections: [{ id: "live", label: "Direct", icon: Radio, path: "/settings" }],
  },
  {
    id: "sources",
    label: "Sources OBS",
    sections: [
      { id: "head", label: "Tête South Park", icon: Smile, path: "/settings/head" },
      { id: "cut", label: "Découpe", icon: Scissors, path: "/settings/cut" },
      { id: "chat", label: "Tchat", icon: MessageSquare, path: "/settings/chat" },
      { id: "fox", label: "Renard", icon: PawPrint, path: "/settings/fox" },
      { id: "rewards", label: "Points de chaîne", icon: Coins, path: "/settings/rewards" },
    ],
  },
  {
    id: "account",
    label: "Compte",
    sections: [{ id: "twitch", label: "Twitch", icon: Tv, path: "/settings/twitch" }],
  },
  {
    id: "soon",
    label: "Bientôt",
    sections: [
      { id: "events", label: "Évènements", icon: CalendarDays, isSoon: true },
      { id: "scenes", label: "Scènes", icon: Clapperboard, isSoon: true },
    ],
  },
] as const;

type Section = (typeof SECTION_GROUPS)[number]["sections"][number];

export const SECTIONS: readonly Section[] = SECTION_GROUPS.flatMap<Section>(({ sections }) => sections);

export type SectionId = Section["id"];

const withoutTrailingSlash = (path: string): string => path.replace(/\/+$/, "");

// L'onglet d'une adresse : l'index (/settings, /settings/) est Direct, chaque autre onglet a son adresse exacte. Un début
// commun ne suffit pas : /settings/head commence aussi par l'adresse de l'index.
export const toCurrentSectionId = (pathname: string): SectionId => {
  const current = withoutTrailingSlash(pathname);
  const found = SECTIONS.find(
    (section) => "path" in section && withoutTrailingSlash(section.path) === current,
  );
  return found?.id ?? "live";
};

// Le titre d'une page est le libellé de son onglet : un seul endroit pour le dire.
export const toSectionLabel = (id: SectionId): string =>
  SECTIONS.find((section) => section.id === id)?.label ?? id;

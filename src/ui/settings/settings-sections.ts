// Les onglets du menu de réglages, dans l'ordre, en une seule liste : ceux qui ont une route (`path`), puis ceux qui
// arrivent plus tard (`isSoon`) : grisés, sans route, ils ne mènent nulle part.

import {
  CalendarDays,
  Clapperboard,
  Coins,
  MessageSquare,
  PawPrint,
  Scissors,
  Smile,
  Tv,
} from "lucide-react";

export const SECTIONS = [
  { id: "head", label: "Tête South Park", icon: Smile, path: "/settings/head" },
  { id: "cut", label: "Découpe", icon: Scissors, path: "/settings/cut" },
  { id: "chat", label: "Tchat", icon: MessageSquare, path: "/settings/chat" },
  { id: "fox", label: "Renard", icon: PawPrint, path: "/settings/fox" },
  { id: "events", label: "Évènements", icon: CalendarDays, isSoon: true },
  { id: "rewards", label: "Points de chaîne", icon: Coins, path: "/settings/rewards" },
  { id: "scenes", label: "Scènes", icon: Clapperboard, isSoon: true },
  { id: "twitch", label: "Twitch", icon: Tv, isSoon: true },
] as const;

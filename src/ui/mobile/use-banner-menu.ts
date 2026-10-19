import { useState } from "react";
import type { BannerMenu } from "./banner-menus";
import { useMonitor } from "./use-monitor";

// `openMenu` : la feuille ouverte, une seule à la fois. `monitorUrl` : l'image de l'antenne, que sa vignette et sa feuille montrent.
export type BannerMenuState = {
  openMenu: BannerMenu | null;
  monitorUrl: string | null;
  onOpenMenu: (menu: BannerMenu) => void;
  onCloseMenu: () => void;
};

// Le câblage commun des feuilles du bandeau (Régie, Selfie) : celle qui est ouverte, et le seul poller de l'antenne, qui se redemande
// plus vite quand sa feuille est ouverte.
export const useBannerMenu = (isLinked: boolean): BannerMenuState => {
  const [openMenu, setOpenMenu] = useState<BannerMenu | null>(null);
  const monitorUrl = useMonitor(isLinked, openMenu === "monitor");
  return { openMenu, monitorUrl, onOpenMenu: setOpenMenu, onCloseMenu: () => setOpenMenu(null) };
};

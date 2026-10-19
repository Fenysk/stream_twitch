import type { ControlState } from "../../domain/control.schema";
import type { ToastTone } from "../design/toast-announcement";
import { LiveSheet } from "./live-sheet";
import { MicMenu } from "./mic-menu";
import { MonitorSheet } from "./monitor-sheet";
import { StopLiveSheet } from "./stop-live-sheet";
import { ViewersSheet } from "./viewers-sheet";

// Les feuilles que le bandeau, la barre du bas et l'aperçu ouvrent, une à la fois : l'antenne en grand avec les scènes et le plan (la vignette
// et la première ligne), le live (la deuxième ligne), d'où s'ouvrent la liste des viewers et la confirmation de l'arrêt, le micro (la barre
// du bas), la caméra (la pastille de l'aperçu, `CameraSheet`) et la confirmation d'arrêter de filmer (`StopFilmSheet`), que pose l'écran du
// téléphone.
export type BannerMenu = "monitor" | "live" | "viewers" | "stop" | "mics" | "camera" | "unfilm";

type BannerMenusProps = {
  state: ControlState;
  // Le numéro de la caméra de ce téléphone quand il filme : sa touche de la feuille Micro dit « · ce téléphone ».
  ownNumber: number | null;
  openMenu: BannerMenu | null;
  // L'image de l'antenne (`useBannerMenu`).
  monitorUrl: string | null;
  onOpenMenu: (menu: BannerMenu) => void;
  onClose: () => void;
  onToast: (tone: ToastTone, text: string) => void;
};

// Les feuilles du bandeau, posées dans la page après tout ce qu'elles doivent recouvrir (le tiroir des sons compris).
export const BannerMenus = ({
  state,
  ownNumber,
  openMenu,
  monitorUrl,
  onOpenMenu,
  onClose,
  onToast,
}: BannerMenusProps) => (
  <>
    <MonitorSheet
      url={monitorUrl}
      state={state}
      isOpen={openMenu === "monitor"}
      onClose={onClose}
      onToast={onToast}
    />
    <LiveSheet
      state={state}
      isOpen={openMenu === "live"}
      onClose={onClose}
      onOpenViewers={() => onOpenMenu("viewers")}
      onOpenStop={() => onOpenMenu("stop")}
      onToast={onToast}
    />
    <ViewersSheet isOpen={openMenu === "viewers"} onClose={onClose} />
    <StopLiveSheet isOpen={openMenu === "stop"} onClose={onClose} onToast={onToast} />
    <MicMenu
      state={state}
      ownNumber={ownNumber}
      isOpen={openMenu === "mics"}
      onClose={onClose}
      onToast={onToast}
    />
  </>
);

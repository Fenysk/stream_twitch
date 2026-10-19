import type { ControlState } from "../../domain/control.schema";
import type { ToastTone } from "../design/toast-announcement";
import { MicMenu } from "./mic-menu";
import { MonitorSheet } from "./monitor-sheet";
import { PictureMenu } from "./picture-menu";
import { SceneMenu } from "./scene-menu";
import { StopLiveSheet } from "./stop-live-sheet";
import { ViewersSheet } from "./viewers-sheet";

// Les feuilles que le bandeau ouvre, une à la fois : le menu des scènes, celui des micros, celui de l'image, la confirmation de l'arrêt du
// live, la liste des viewers, et le retour antenne en grand (sa vignette est dans l'écran du rôle).
export type BannerMenu = "scenes" | "mics" | "picture" | "stop" | "viewers" | "monitor";

type BannerMenusProps = {
  state: ControlState;
  openMenu: BannerMenu | null;
  // L'image du retour antenne (`useBannerMenu`).
  monitorUrl: string | null;
  onClose: () => void;
  onToast: (tone: ToastTone, text: string) => void;
};

// Les feuilles du bandeau, posées dans la page après tout ce qu'elles doivent recouvrir (le tiroir des touches compris).
export const BannerMenus = ({ state, openMenu, monitorUrl, onClose, onToast }: BannerMenusProps) => (
  <>
    <SceneMenu state={state} isOpen={openMenu === "scenes"} onClose={onClose} onToast={onToast} />
    <MicMenu state={state} isOpen={openMenu === "mics"} onClose={onClose} onToast={onToast} />
    <PictureMenu state={state} isOpen={openMenu === "picture"} onClose={onClose} onToast={onToast} />
    <StopLiveSheet isOpen={openMenu === "stop"} onClose={onClose} onToast={onToast} />
    <ViewersSheet isOpen={openMenu === "viewers"} onClose={onClose} />
    <MonitorSheet
      url={monitorUrl}
      isLinked={state.isLinked}
      isOpen={openMenu === "monitor"}
      onClose={onClose}
    />
  </>
);

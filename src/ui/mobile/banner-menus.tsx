import type { ControlState } from "../../domain/control.schema";
import type { ToastTone } from "../design/toast-announcement";
import { MicMenu } from "./mic-menu";
import { MonitorSheet } from "./monitor-sheet";
import { PictureMenu } from "./picture-menu";
import { SceneMenu } from "./scene-menu";
import { StopLiveSheet } from "./stop-live-sheet";
import { ViewersSheet } from "./viewers-sheet";

// Les feuilles que le bandeau et la barre du bas ouvrent, une à la fois : le menu des scènes, la feuille Micro, le menu du plan, la
// confirmation de l'arrêt du live, la liste des viewers, et l'antenne en grand (sa vignette est dans le bandeau).
export type BannerMenu = "scenes" | "mics" | "picture" | "stop" | "viewers" | "monitor";

type BannerMenusProps = {
  state: ControlState;
  // Le numéro de la caméra de ce téléphone quand il filme : sa touche de la feuille Micro dit « · ce téléphone ».
  ownNumber: number | null;
  openMenu: BannerMenu | null;
  // L'image de l'antenne (`useBannerMenu`).
  monitorUrl: string | null;
  onClose: () => void;
  onToast: (tone: ToastTone, text: string) => void;
};

// Les feuilles du bandeau, posées dans la page après tout ce qu'elles doivent recouvrir (le tiroir des touches compris).
export const BannerMenus = ({
  state,
  ownNumber,
  openMenu,
  monitorUrl,
  onClose,
  onToast,
}: BannerMenusProps) => (
  <>
    <SceneMenu state={state} isOpen={openMenu === "scenes"} onClose={onClose} onToast={onToast} />
    <MicMenu
      state={state}
      ownNumber={ownNumber}
      isOpen={openMenu === "mics"}
      onClose={onClose}
      onToast={onToast}
    />
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

import type { ControlState } from "../../domain/control.schema";
import type { ToastTone } from "../design/toast-announcement";
import { MicMenu } from "./mic-menu";
import { PictureMenu } from "./picture-menu";
import { SceneMenu } from "./scene-menu";
import { StopLiveSheet } from "./stop-live-sheet";
import { ViewersSheet } from "./viewers-sheet";

// Les feuilles que le bandeau ouvre, une à la fois : le menu des scènes, celui des micros, celui de l'image, la confirmation de l'arrêt du
// live, la liste des viewers, et le retour antenne en grand (la vignette de la Régie ; sa feuille est dans ControlRole).
export type BannerMenu = "scenes" | "mics" | "picture" | "stop" | "viewers" | "monitor";

type BannerMenusProps = {
  state: ControlState;
  openMenu: BannerMenu | null;
  onClose: () => void;
  onToast: (tone: ToastTone, text: string) => void;
};

// Les menus du bandeau, posés dans la page après tout ce qu'ils doivent recouvrir (le tiroir de la grille du Selfie compris).
export const BannerMenus = ({ state, openMenu, onClose, onToast }: BannerMenusProps) => (
  <>
    <SceneMenu state={state} isOpen={openMenu === "scenes"} onClose={onClose} onToast={onToast} />
    <MicMenu state={state} isOpen={openMenu === "mics"} onClose={onClose} onToast={onToast} />
    <PictureMenu state={state} isOpen={openMenu === "picture"} onClose={onClose} onToast={onToast} />
    <StopLiveSheet isOpen={openMenu === "stop"} onClose={onClose} onToast={onToast} />
    <ViewersSheet isOpen={openMenu === "viewers"} onClose={onClose} />
  </>
);

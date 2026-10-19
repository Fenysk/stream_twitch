import { LayoutGrid, Mic, MicOff } from "lucide-react";
import { useState } from "react";
import type { ControlState } from "../../domain/control.schema";
import { Button } from "../design/button";
import type { ToastTone } from "../design/toast-announcement";
import { BannerMenus } from "./banner-menus";
import { ControlDrawer } from "./control-drawer";
import { ControlGrid } from "./control-grid";
import { isMicMuted, toMicText } from "./control-view";
import type { BannerMenuState } from "./use-banner-menu";

type ControlDockProps = {
  state: ControlState;
  menu: BannerMenuState;
  // Le numéro de la caméra de ce téléphone quand il filme (le Selfie), `null` à la Régie : de quoi dire « ce tél. » pour son micro.
  ownNumber: number | null;
  onToast: (tone: ToastTone, text: string) => void;
};

// Le bas de l'écran du téléphone, commun à la Régie et au Selfie : la barre centrée, à portée du pouce, avec « Micro : X » (il montre le micro
// entendu et ouvre la feuille Micro) puis « Touches », qui ouvre le tiroir de la grille de touches ; viennent ensuite les feuilles du bandeau.
// Le tiroir et les feuilles sont fixes et sœurs, les feuilles après lui dans la page : une feuille fixe dans une autre serait rognée par
// son `backdrop-filter`.
export const ControlDock = ({ state, menu, ownNumber, onToast }: ControlDockProps) => {
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  return (
    <>
      <div className="control-bar">
        <Button
          label={toMicText(state, ownNumber)}
          title="Choisir le micro"
          icon={isMicMuted(state) ? MicOff : Mic}
          isExpanded={menu.openMenu === "mics"}
          onPress={() => menu.onOpenMenu("mics")}
        />
        <Button
          label="Touches"
          icon={LayoutGrid}
          variant="primary"
          isExpanded={isDrawerOpen}
          onPress={() => setIsDrawerOpen(true)}
        />
      </div>
      <ControlDrawer
        isOpen={isDrawerOpen}
        label="Touches"
        closeLabel="Fermer les touches"
        onClose={() => setIsDrawerOpen(false)}
      >
        <ControlGrid state={state} onToast={onToast} />
      </ControlDrawer>
      <BannerMenus
        state={state}
        ownNumber={ownNumber}
        openMenu={menu.openMenu}
        monitorUrl={menu.monitorUrl}
        onClose={menu.onCloseMenu}
        onToast={onToast}
      />
    </>
  );
};

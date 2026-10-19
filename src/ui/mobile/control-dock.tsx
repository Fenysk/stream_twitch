import { LayoutGrid } from "lucide-react";
import { type ReactNode, useState } from "react";
import type { ControlState } from "../../domain/control.schema";
import { Button } from "../design/button";
import type { ToastTone } from "../design/toast-announcement";
import { BannerMenus } from "./banner-menus";
import { ControlDrawer } from "./control-drawer";
import { ControlGrid } from "./control-grid";
import type { BannerMenuState } from "./use-banner-menu";

type ControlDockProps = {
  state: ControlState;
  menu: BannerMenuState;
  onToast: (tone: ToastTone, text: string) => void;
  // Les boutons d'avant « Touches » dans la barre : le mic du live au Selfie, rien à la Régie.
  children?: ReactNode;
};

// Le bas de l'écran du téléphone, commun à la Régie et au Selfie : la barre centrée, à portée du pouce, avec ses boutons puis « Touches »,
// qui ouvre le tiroir de la grille de touches ; viennent ensuite les feuilles du bandeau. Le tiroir et les feuilles sont fixes et sœurs,
// les feuilles après lui dans la page : une feuille fixe dans une autre serait rognée par son `backdrop-filter`.
export const ControlDock = ({ state, menu, onToast, children }: ControlDockProps) => {
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  return (
    <>
      <div className="control-bar">
        {children}
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
        openMenu={menu.openMenu}
        monitorUrl={menu.monitorUrl}
        onClose={menu.onCloseMenu}
        onToast={onToast}
      />
    </>
  );
};

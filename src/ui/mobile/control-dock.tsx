import { LayoutGrid } from "lucide-react";
import { type ReactNode, useState } from "react";
import type { ControlState } from "../../domain/control.schema";
import { Button } from "../design/button";
import type { ToastTone } from "../design/toast-announcement";
import { BannerMenus } from "./banner-menus";
import { ControlDrawer } from "./control-drawer";
import { ControlGrid } from "./control-grid";
import { MicButton } from "./mic-button";
import type { BannerMenuState } from "./use-banner-menu";

type ControlDockProps = {
  state: ControlState;
  menu: BannerMenuState;
  // Le numéro de la caméra de ce téléphone quand il filme, `null` sinon : de quoi dire « ce tél. » pour son micro.
  ownNumber: number | null;
  // Le bouton entre « Micro : X » et « Sons » : « Filmer » quand le téléphone ne filme pas, « Montrer » ou « Cacher » quand il filme. Sans
  // bouton, la barre n'en a que deux.
  middle?: ReactNode;
  onToast: (tone: ToastTone, text: string) => void;
};

// Le bas de l'écran du téléphone qui ne filme pas, ou qui filme en portrait : la barre centrée, à portée du pouce, avec « Micro : X » (il
// montre le micro entendu et ouvre la feuille Micro), le bouton du milieu (Filmer, Montrer ou Cacher) puis « Sons », qui ouvre le tiroir de la
// grille des sons ; viennent ensuite les feuilles du bandeau.
// Le tiroir et les feuilles sont fixes et sœurs, les feuilles après lui dans la page : une feuille fixe dans une autre serait rognée par
// son `backdrop-filter`.
export const ControlDock = ({ state, menu, ownNumber, middle, onToast }: ControlDockProps) => {
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  return (
    <>
      <div className="control-bar">
        <MicButton
          state={state}
          ownNumber={ownNumber}
          isExpanded={menu.openMenu === "mics"}
          onPress={() => menu.onOpenMenu("mics")}
        />
        {middle}
        <Button
          label="Sons"
          icon={LayoutGrid}
          variant="primary"
          isExpanded={isDrawerOpen}
          onPress={() => setIsDrawerOpen(true)}
        />
      </div>
      <ControlDrawer
        isOpen={isDrawerOpen}
        label="Sons"
        closeLabel="Fermer les sons"
        onClose={() => setIsDrawerOpen(false)}
      >
        <ControlGrid isOpen={isDrawerOpen} onToast={onToast} />
      </ControlDrawer>
      <BannerMenus
        state={state}
        ownNumber={ownNumber}
        openMenu={menu.openMenu}
        monitorUrl={menu.monitorUrl}
        onOpenMenu={menu.onOpenMenu}
        onClose={menu.onCloseMenu}
        onToast={onToast}
      />
    </>
  );
};

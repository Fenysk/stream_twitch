import { useState } from "react";
import { type BannerMenu, BannerMenus } from "./banner-menus";
import { ControlBanner } from "./control-banner";
import { ControlChat } from "./control-chat";
import { ControlGrid } from "./control-grid";
import { ControlToast } from "./control-toast";
import { MonitorSheet } from "./monitor-sheet";
import { MonitorThumbnail } from "./monitor-thumbnail";
import { RoleCorner } from "./role-corner";
import { useControlState } from "./use-control-state";
import { useMonitor } from "./use-monitor";
import { useToast } from "./use-toast";

// Le rôle Régie, en portrait : le bandeau (la vignette du retour antenne, puis live, viewers, scène et micro du live, dont les menus), le chat
// avec « Écrire », et la grille de touches (sons, Jean-Renard). L'état vient d'un seul flux, celui qui annonce le téléphone au serveur ; le
// retour antenne se redemande par de courtes requêtes, un seul poller pour la vignette et sa feuille.
export const ControlRole = ({ onUpdateRole }: { onUpdateRole: () => void }) => {
  const view = useControlState("control");
  const toast = useToast();
  const [openMenu, setOpenMenu] = useState<BannerMenu | null>(null);
  const isMonitorOpen = openMenu === "monitor";
  const monitorUrl = useMonitor(view.state.isLinked, isMonitorOpen);
  const closeMenu = () => setOpenMenu(null);
  return (
    <main className="control-role">
      <ControlBanner
        view={view}
        openMenu={openMenu}
        onOpenMenu={setOpenMenu}
        lead={
          <MonitorThumbnail
            url={monitorUrl}
            isLinked={view.state.isLinked}
            isExpanded={isMonitorOpen}
            onPress={() => setOpenMenu("monitor")}
          />
        }
      >
        <RoleCorner onPress={onUpdateRole} />
      </ControlBanner>
      <ControlChat />
      <ControlGrid state={view.state} onToast={toast.show} />
      <BannerMenus state={view.state} openMenu={openMenu} onClose={closeMenu} onToast={toast.show} />
      <MonitorSheet
        url={monitorUrl}
        isLinked={view.state.isLinked}
        isOpen={isMonitorOpen}
        onClose={closeMenu}
      />
      <ControlToast message={toast.message} />
    </main>
  );
};

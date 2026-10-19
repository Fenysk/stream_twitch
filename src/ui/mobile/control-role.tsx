import { ControlBanner } from "./control-banner";
import { ControlChat } from "./control-chat";
import { ControlDock } from "./control-dock";
import { ControlToast } from "./control-toast";
import { MonitorThumbnail } from "./monitor-thumbnail";
import { RoleCorner } from "./role-corner";
import { useBannerMenu } from "./use-banner-menu";
import { useControlState } from "./use-control-state";
import { useToast } from "./use-toast";

// Le rôle Régie, en portrait, de haut en bas : le bandeau (la vignette du retour antenne, puis live, viewers, scène et micro du live, dont
// les menus), le chat avec « Écrire », et la barre du bas (« Touches » ouvre dans un tiroir la grille de sons et de Jean-Renard). L'état vient
// d'un seul flux, celui qui annonce le téléphone au serveur ; le retour antenne se redemande par de courtes requêtes (`useBannerMenu`).
export const ControlRole = ({ onUpdateRole }: { onUpdateRole: () => void }) => {
  const view = useControlState("control");
  const toast = useToast();
  const menu = useBannerMenu(view.state.isLinked);
  return (
    <main className="control-role">
      <ControlBanner
        view={view}
        openMenu={menu.openMenu}
        onOpenMenu={menu.onOpenMenu}
        lead={
          <MonitorThumbnail
            url={menu.monitorUrl}
            isLinked={view.state.isLinked}
            isExpanded={menu.openMenu === "monitor"}
            onPress={() => menu.onOpenMenu("monitor")}
          />
        }
      >
        <RoleCorner onPress={onUpdateRole} />
      </ControlBanner>
      <ControlChat />
      <ControlDock state={view.state} menu={menu} onToast={toast.show} />
      <ControlToast message={toast.message} />
    </main>
  );
};

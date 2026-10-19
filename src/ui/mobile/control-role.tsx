import { AlertLine } from "./alert-line";
import { ControlBanner } from "./control-banner";
import { ControlChat } from "./control-chat";
import { ControlDock } from "./control-dock";
import { ControlToast } from "./control-toast";
import { MonitorThumbnail } from "./monitor-thumbnail";
import { RoleCorner } from "./role-corner";
import { useAlert } from "./use-alert";
import { useBannerMenu } from "./use-banner-menu";
import { useControlState } from "./use-control-state";
import { useToast } from "./use-toast";

// Le rôle Régie, en portrait, de haut en bas : le bandeau (la vignette de l'antenne, puis live, viewers, scène et plan, dont les menus) et,
// quand il y en a une, l'alerte en dessous, le chat avec « Écrire », et la barre du bas (« Micro : X » ouvre la feuille Micro, « Touches » ouvre dans un tiroir la grille de sons et de
// Jean-Renard). L'état vient d'un seul flux, celui qui annonce le téléphone au serveur ; l'antenne se redemande par de courtes requêtes
// (`useBannerMenu`).
export const ControlRole = ({ onUpdateRole }: { onUpdateRole: () => void }) => {
  const view = useControlState("control");
  const toast = useToast();
  const menu = useBannerMenu(view.state.isLinked);
  const alert = useAlert({ role: "control", view, film: null, onToast: toast.show });
  return (
    <main className="control-role">
      <div className="control-top">
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
        {alert && <AlertLine alert={alert} />}
      </div>
      <ControlChat />
      <ControlDock state={view.state} menu={menu} ownNumber={null} onToast={toast.show} />
      <ControlToast message={toast.message} />
    </main>
  );
};

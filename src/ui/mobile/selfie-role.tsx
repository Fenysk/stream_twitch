import { AlertLine } from "./alert-line";
import { CameraBadge } from "./camera-badge";
import { CameraControls } from "./camera-controls";
import { isPreviewMirrored } from "./camera-media";
import { CameraNotice } from "./camera-notice";
import { CameraPreview } from "./camera-preview";
import { ControlBanner } from "./control-banner";
import { ControlChat } from "./control-chat";
import { ControlDock } from "./control-dock";
import { ControlToast } from "./control-toast";
import { CutCameraButton } from "./cut-camera-button";
import { CutNotice } from "./cut-notice";
import { MonitorThumbnail } from "./monitor-thumbnail";
import { RoleCorner } from "./role-corner";
import { useAlert } from "./use-alert";
import { useBannerMenu } from "./use-banner-menu";
import { useCameraStream } from "./use-camera-stream";
import { useCutCamera } from "./use-cut-camera";
import { usePhoneLink } from "./use-phone-link";
import { useToast } from "./use-toast";
import { useWakeLock } from "./use-wake-lock";

// Le rôle Selfie, tenu en portrait, de haut en bas : l'aperçu de la caméra avant (en miroir pour toi, jamais pour OBS), avec la pastille du
// numéro et la bascule de caméra par-dessus ; le bandeau de la régie (la vignette de l'antenne avec sa légende de deux lignes, qui ouvrent les
// feuilles Antenne et Live), toujours visible, avec l'alerte en dessous quand il y en a une ; le chat, avec « Écrire » dans sa boîte ; et en
// bas, à portée du pouce, « Micro : X » (la feuille Micro) et « Sons », qui ouvre dans un tiroir la grille des sons. Les feuilles s'ouvrent
// par-dessus tout, tiroir compris.
// Un cadre rouge autour de l'aperçu dit que la caméra est à l'antenne. Un seul flux avec le serveur : la liaison de la caméra apporte
// aussi l'état de la régie.
export const SelfieRole = ({ onUpdateRole }: { onUpdateRole: () => void }) => {
  useWakeLock();
  const camera = useCameraStream("user", "portrait");
  const link = usePhoneLink("selfie", camera.stream);
  const toast = useToast();
  const cutCamera = useCutCamera(link, toast.show);
  const menu = useBannerMenu(link.control.state.isLinked);
  const alert = useAlert({
    role: "selfie",
    view: link.control,
    film: { camera, link, onShow: cutCamera },
    onToast: toast.show,
  });
  return (
    <main className="control-role selfie-role">
      <section className="selfie-preview" aria-label="Aperçu de la caméra" data-on-air={link.isOnAir}>
        <CameraPreview stream={camera.stream} isMirrored={isPreviewMirrored(camera.facing)} />
        <div className="camera-top">
          <CameraBadge
            number={link.number}
            status={link.status}
            isOnAir={link.isOnAir}
            onUpdateNumber={link.updateNumber}
          />
          <RoleCorner onPress={onUpdateRole} />
        </div>
        <CutNotice standing={link.standing} />
        <CameraControls
          isDisabled={camera.status !== "live"}
          cut={
            <CutCameraButton
              standing={link.standing}
              isDisabled={camera.status !== "live"}
              onPress={cutCamera}
            />
          }
          onSwitchCamera={camera.switchCamera}
        />
        {camera.status !== "live" && <CameraNotice status={camera.status} onRestart={camera.restart} />}
      </section>
      <div className="control-top">
        <ControlBanner
          view={link.control}
          openMenu={menu.openMenu}
          onOpenMenu={menu.onOpenMenu}
          lead={
            <MonitorThumbnail
              url={menu.monitorUrl}
              isLinked={link.control.state.isLinked}
              isExpanded={menu.openMenu === "monitor"}
              onPress={() => menu.onOpenMenu("monitor")}
            />
          }
        />
        {alert && <AlertLine alert={alert} />}
      </div>
      <ControlChat />
      <ControlDock state={link.control.state} menu={menu} ownNumber={link.number} onToast={toast.show} />
      <ControlToast message={toast.message} />
    </main>
  );
};

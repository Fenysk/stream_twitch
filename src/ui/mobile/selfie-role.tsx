import { LayoutGrid } from "lucide-react";
import { useState } from "react";
import { Button } from "../design/button";
import { type BannerMenu, BannerMenus } from "./banner-menus";
import { CameraBadge } from "./camera-badge";
import { CameraControls } from "./camera-controls";
import { isPreviewMirrored } from "./camera-media";
import { CameraNotice } from "./camera-notice";
import { CameraPreview } from "./camera-preview";
import { ControlBanner } from "./control-banner";
import { ControlChat } from "./control-chat";
import { ControlDrawer } from "./control-drawer";
import { ControlGrid } from "./control-grid";
import { ControlToast } from "./control-toast";
import { CutCameraButton } from "./cut-camera-button";
import { CutNotice } from "./cut-notice";
import { LiveMicButton } from "./live-mic-button";
import { RoleCorner } from "./role-corner";
import { useCameraStream } from "./use-camera-stream";
import { useCutCamera } from "./use-cut-camera";
import { useLiveMic } from "./use-live-mic";
import { usePhoneLink } from "./use-phone-link";
import { useTakePicture } from "./use-take-picture";
import { useToast } from "./use-toast";
import { useWakeLock } from "./use-wake-lock";

// Le rôle Selfie, tenu en portrait, de haut en bas : l'aperçu de la caméra avant (en miroir pour toi, jamais pour OBS), avec la pastille du
// numéro et la bascule de caméra par-dessus ; le bandeau de la régie (live, viewers, scène, micro), toujours visible ; le chat, avec
// « Écrire » dans sa boîte ; et en bas, à portée du pouce, le mic du live et « Régie », qui ouvre dans un tiroir la grille de touches. Les
// menus des pastilles du bandeau s'ouvrent par-dessus tout, tiroir compris.
// Un cadre rouge autour de l'aperçu dit que la caméra est à l'antenne. Un seul flux avec le serveur : la liaison de la caméra apporte
// aussi l'état de la régie.
export const SelfieRole = ({ onUpdateRole }: { onUpdateRole: () => void }) => {
  useWakeLock();
  const camera = useCameraStream("user", "portrait");
  const link = usePhoneLink("selfie", camera.stream);
  const toast = useToast();
  const toggleMic = useLiveMic(link, toast.show);
  const takePicture = useTakePicture(link, toast.show);
  const cutCamera = useCutCamera(link, toast.show);
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const [openMenu, setOpenMenu] = useState<BannerMenu | null>(null);
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
            onTakePicture={takePicture}
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
      <ControlBanner view={link.control} openMenu={openMenu} onOpenMenu={setOpenMenu} />
      <ControlChat />
      <div className="selfie-open">
        <LiveMicButton isLiveMic={link.isLiveMic} isDisabled={camera.status !== "live"} onPress={toggleMic} />
        <Button
          label="Régie"
          icon={LayoutGrid}
          variant="primary"
          isExpanded={isDrawerOpen}
          onPress={() => setIsDrawerOpen(true)}
        />
      </div>
      <ControlDrawer
        isOpen={isDrawerOpen}
        label="Régie"
        closeLabel="Fermer la régie"
        onClose={() => setIsDrawerOpen(false)}
      >
        <ControlGrid state={link.control.state} onToast={toast.show} />
      </ControlDrawer>
      <BannerMenus
        state={link.control.state}
        openMenu={openMenu}
        onClose={() => setOpenMenu(null)}
        onToast={toast.show}
      />
      <ControlToast message={toast.message} />
    </main>
  );
};

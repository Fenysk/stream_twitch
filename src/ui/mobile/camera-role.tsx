import { RotateCw } from "lucide-react";
import { useEffect, useState } from "react";
import { AlertLine } from "./alert-line";
import { BlackScreen } from "./black-screen";
import { CameraBadge } from "./camera-badge";
import { CameraControls } from "./camera-controls";
import { CameraNotice } from "./camera-notice";
import { CameraPreview } from "./camera-preview";
import { ControlToast } from "./control-toast";
import { CutCameraButton } from "./cut-camera-button";
import { CutNotice } from "./cut-notice";
import { LiveMicButton } from "./live-mic-button";
import { RoleCorner } from "./role-corner";
import { useAlert } from "./use-alert";
import { useCameraStream } from "./use-camera-stream";
import { useCutCamera } from "./use-cut-camera";
import { useLiveMic } from "./use-live-mic";
import { usePhoneLink } from "./use-phone-link";
import { usePortrait } from "./use-portrait";
import { useToast } from "./use-toast";
import { useWakeLock } from "./use-wake-lock";

// Le rôle Caméra : l'aperçu plein écran, la pastille « Caméra 1 » en haut à gauche, la barre du bas (micro, cacher ou montrer la caméra,
// caméra arrière ou avant, écran noir), et l'image et le son partent vers la page OBS du numéro. Un cadre rouge autour de l'aperçu dit que la caméra est à
// l'antenne. Sans tchat : le téléphone est sur un trépied ; un refus du mic s'annonce par un toast. Les alertes de la Caméra : connexion perdue
// et « Ta caméra est prête » ; l'avis de caméra arrêtée couvre déjà l'aperçu.
export const CameraRole = ({ onUpdateRole }: { onUpdateRole: () => void }) => {
  useWakeLock();
  const camera = useCameraStream("environment", "landscape");
  const link = usePhoneLink("camera", camera.stream);
  const isPortrait = usePortrait();
  const [isBlack, setIsBlack] = useState(false);
  const toast = useToast();
  const toggleMic = useLiveMic(link, toast.show);
  const cutCamera = useCutCamera(link, toast.show);
  const alert = useAlert({
    role: "camera",
    view: link.control,
    film: { camera, link, onShow: cutCamera },
    onToast: toast.show,
  });

  // Une caméra qui s'arrête rallume l'écran : son message (« Touche pour relancer ») a besoin d'être vu.
  useEffect(() => {
    if (camera.status !== "live") setIsBlack(false);
  }, [camera.status]);

  return (
    <main className="camera-role" data-on-air={link.isOnAir}>
      <CameraPreview stream={camera.stream} />
      <div className="camera-top">
        <CameraBadge
          number={link.number}
          status={link.status}
          isOnAir={link.isOnAir}
          onUpdateNumber={link.updateNumber}
        />
        <RoleCorner onPress={onUpdateRole} />
      </div>
      {isPortrait && (
        <p className="rotate-hint lp-type-heading" role="status">
          <RotateCw aria-hidden="true" />
          Tourne le téléphone à l'horizontale
        </p>
      )}
      <CutNotice standing={link.standing} />
      <CameraControls
        isDisabled={camera.status !== "live"}
        mic={
          <LiveMicButton
            isLiveMic={link.isLiveMic}
            isDisabled={camera.status !== "live"}
            onPress={toggleMic}
          />
        }
        cut={
          <CutCameraButton
            standing={link.standing}
            isDisabled={camera.status !== "live"}
            onPress={cutCamera}
          />
        }
        onSwitchCamera={camera.switchCamera}
        onBlackout={() => setIsBlack(true)}
      />
      {camera.status !== "live" && <CameraNotice status={camera.status} onRestart={camera.restart} />}
      {alert && <AlertLine alert={alert} />}
      {isBlack && <BlackScreen isOnAir={link.isOnAir} onWake={() => setIsBlack(false)} />}
      <ControlToast message={toast.message} />
    </main>
  );
};

import type { ReactNode } from "react";
import { CameraBadge } from "./camera-badge";
import { isPreviewMirrored } from "./camera-media";
import { CameraNotice } from "./camera-notice";
import { CameraPreview } from "./camera-preview";
import { CutNotice } from "./cut-notice";
import { RoleCorner } from "./role-corner";
import type { CameraStream } from "./use-camera-stream";
import type { PhoneLink } from "./use-phone-link";

type FilmPreviewProps = {
  camera: CameraStream;
  link: PhoneLink;
  // La feuille Caméra est ouverte (la pastille le dit), et la pastille l'ouvre.
  isBadgeOpen: boolean;
  onOpenCamera: () => void;
  onUpdateRole: () => void;
  // Les commandes posées sur l'aperçu : l'objectif seul en portrait, toute la barre en paysage.
  controls: ReactNode;
};

// Ce qui est sur l'aperçu d'un téléphone qui filme, le même en portrait et en paysage : l'image (en miroir pour toi avec l'objectif avant,
// jamais pour OBS), la pastille « Caméra N · Prête » qui ouvre la feuille Caméra, le coin qui change de rôle, l'avis de caméra cachée, les
// commandes, et l'avis de caméra arrêtée qui couvre tout.
export const FilmPreview = ({
  camera,
  link,
  isBadgeOpen,
  onOpenCamera,
  onUpdateRole,
  controls,
}: FilmPreviewProps) => (
  <>
    <CameraPreview stream={camera.stream} isMirrored={isPreviewMirrored(camera.facing)} />
    <div className="camera-top">
      <CameraBadge
        number={link.number}
        status={link.status}
        isOnAir={link.isOnAir}
        isOpen={isBadgeOpen}
        onPress={onOpenCamera}
      />
      <RoleCorner onPress={onUpdateRole} />
    </div>
    <CutNotice standing={link.standing} />
    {controls}
    {camera.status !== "live" && <CameraNotice status={camera.status} onRestart={camera.restart} />}
  </>
);

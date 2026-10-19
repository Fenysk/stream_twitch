import { Moon, SwitchCamera } from "lucide-react";
import type { ReactNode } from "react";
import { Button } from "../design/button";

type CameraControlsProps = {
  isDisabled: boolean;
  onSwitchCamera: () => void;
  // Le bouton micro (`LiveMicButton`) : dans la barre du rôle Caméra ; le Selfie le met en bas, à côté de « Régie ».
  mic?: ReactNode;
  // Le bouton qui coupe ou montre la caméra à l'image (`CutCameraButton`) : juste avant le changement de caméra.
  cut?: ReactNode;
  // L'écran noir : seul le rôle Caméra l'a (sur un trépied, l'écran n'a rien à montrer).
  onBlackout?: () => void;
};

// La barre de la caméra : le bouton micro quand le rôle le met ici, couper ou montrer la caméra à l'image, changer de caméra (arrière ou
// avant), et éteindre l'écran.
export const CameraControls = ({ isDisabled, onSwitchCamera, mic, cut, onBlackout }: CameraControlsProps) => (
  <div className="camera-bar-slot">
    <div className="lp-pill" role="toolbar" aria-label="Commandes de la caméra">
      <div className="lp-pill-content">
        {mic}
        {cut}
        <Button
          icon={SwitchCamera}
          title="Changer de caméra"
          isDisabled={isDisabled}
          onPress={onSwitchCamera}
        />
        {onBlackout && (
          <Button
            icon={Moon}
            title="Éteindre l'écran, la caméra continue"
            isDisabled={isDisabled}
            onPress={onBlackout}
          />
        )}
      </div>
    </div>
  </div>
);

import { Moon, SwitchCamera } from "lucide-react";
import type { ReactNode } from "react";
import { Button } from "../design/button";

type CameraControlsProps = {
  isDisabled: boolean;
  onSwitchCamera: () => void;
  // Le bouton micro (`MicButton`) : dans la barre de l'aperçu en paysage seulement ; en portrait « Micro : X » est dans la barre du bas.
  mic?: ReactNode;
  // Le bouton qui cache ou montre la caméra au plan (`CutCameraButton`) : juste avant le changement de caméra.
  cut?: ReactNode;
  // L'écran noir : seul le paysage l'a (posé sur un trépied, l'écran n'a rien à montrer).
  onBlackout?: () => void;
};

// La barre de la caméra : le bouton micro quand la disposition le met ici, cacher ou montrer la caméra au plan, changer d'objectif (arrière
// ou avant), et éteindre l'écran. En portrait, l'objectif seul.
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

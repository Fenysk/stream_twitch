import { Video, VideoOff } from "lucide-react";
import { canCutCamera } from "../../domain/picture.rules";
import type { PictureStanding } from "../../domain/picture.schema";
import { Button } from "../design/button";

type CutCameraButtonProps = {
  // Où en est l'image pour ce téléphone (l'état que le serveur donne, voir `PhoneLink.standing`).
  standing: PictureStanding;
  isDisabled: boolean;
  onPress: () => void;
};

// Le bouton qui coupe ou montre la caméra d'un téléphone : allumé (une caméra), ce téléphone est à l'image ; barré et rouge, c'en est un
// autre. Un toucher le met à l'image avec son micro, ou, s'il y est déjà, passe l'image à la tête en gardant le micro (`useCutCamera`).
// Grisé tant qu'OBS n'a pas de place caméra à montrer.
export const CutCameraButton = ({ standing, isDisabled, onPress }: CutCameraButtonProps) => (
  <Button
    icon={standing.isCurrent ? Video : VideoOff}
    title={
      standing.isCurrent
        ? "Couper la caméra : la tête prend l'image, le micro reste à ce téléphone"
        : "Montrer la caméra de ce téléphone à l'image"
    }
    {...(standing.isCurrent ? {} : { variant: "danger" as const })}
    isDisabled={isDisabled || !canCutCamera(standing)}
    onPress={onPress}
  />
);

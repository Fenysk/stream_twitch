import { Eye, EyeOff } from "lucide-react";
import { canCutCamera } from "../../domain/picture.rules";
import type { PictureStanding } from "../../domain/picture.schema";
import { Button } from "../design/button";

type CutCameraButtonProps = {
  // Où en est le plan pour ce téléphone (l'état que le serveur donne, voir `PhoneLink.standing`).
  standing: PictureStanding;
  isDisabled: boolean;
  onPress: () => void;
};

// Le bouton qui cache ou montre la caméra d'un téléphone, neutre, au libellé visible : « Cacher » quand ce téléphone a le plan, « Montrer »
// sinon. Un toucher le met au plan avec son micro, ou, s'il y est déjà, rend le plan à la tête en gardant le micro (`useCutCamera`).
// Grisé tant qu'OBS n'a pas de place caméra à montrer.
export const CutCameraButton = ({ standing, isDisabled, onPress }: CutCameraButtonProps) => (
  <Button
    icon={standing.isCurrent ? EyeOff : Eye}
    label={standing.isCurrent ? "Cacher" : "Montrer"}
    title={
      standing.isCurrent
        ? "Cacher la caméra : la tête reprend le plan, le micro reste à ce téléphone"
        : "Montrer la caméra de ce téléphone au plan"
    }
    isDisabled={isDisabled || !canCutCamera(standing)}
    onPress={onPress}
  />
);

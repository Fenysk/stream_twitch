import { Mic } from "lucide-react";
import { Button } from "../design/button";

type LiveMicButtonProps = {
  // Le mic de ce téléphone est celui du live (l'état que le serveur donne, voir `PhoneLink.isLiveMic`).
  isLiveMic: boolean;
  isDisabled: boolean;
  onPress: () => void;
};

// Le bouton micro du rôle Caméra (pas de feuille Micro sur un trépied) : son libellé dit l'état, « Micro ici » (ce téléphone est le micro
// entendu) ou « Micro : ailleurs » ; son titre dit ce que fait le toucher : rendre le micro au PC, ou le prendre (`useLiveMic`). Neutre dans
// les deux cas, et jamais l'icône du micro barré : le toucher ne rend pas muet.
export const LiveMicButton = ({ isLiveMic, isDisabled, onPress }: LiveMicButtonProps) => (
  <Button
    icon={Mic}
    label={isLiveMic ? "Micro ici" : "Micro : ailleurs"}
    title={isLiveMic ? "Rendre le micro au PC" : "Prendre le micro"}
    isDisabled={isDisabled}
    onPress={onPress}
  />
);

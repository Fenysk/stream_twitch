import { Mic, MicOff } from "lucide-react";
import { Button } from "../design/button";

type LiveMicButtonProps = {
  // Le mic de ce téléphone est celui du live (l'état que le serveur donne, voir `PhoneLink.isLiveMic`).
  isLiveMic: boolean;
  isDisabled: boolean;
  onPress: () => void;
};

// Le bouton micro d'un téléphone qui filme : allumé, ce téléphone est le micro du live ; barré et rouge, c'en est un autre. Un toucher
// prend le micro, ou le rend au micro du PC s'il l'est déjà (`useLiveMic`). Dans la barre du rôle Caméra, en bas à côté de « Régie » pour le
// Selfie, à portée du pouce.
export const LiveMicButton = ({ isLiveMic, isDisabled, onPress }: LiveMicButtonProps) => (
  <Button
    icon={isLiveMic ? Mic : MicOff}
    title={
      isLiveMic
        ? "Ce téléphone est le micro du live : revenir au micro du PC"
        : "Prendre le micro de ce téléphone pour le live"
    }
    {...(isLiveMic ? {} : { variant: "danger" as const })}
    isDisabled={isDisabled}
    onPress={onPress}
  />
);

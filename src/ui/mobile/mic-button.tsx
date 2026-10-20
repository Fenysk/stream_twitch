import { Mic, MicOff } from "lucide-react";
import { isMicMuted } from "../../domain/control.rules";
import type { ControlState } from "../../domain/control.schema";
import { Button } from "../design/button";
import { toMicText } from "./control-view";

type MicButtonProps = {
  state: ControlState;
  // Le numéro de la caméra de ce téléphone quand il filme : de quoi dire « ce tél. » pour son micro.
  ownNumber: number | null;
  // La feuille Micro est ouverte.
  isExpanded: boolean;
  onPress: () => void;
};

// « Micro : X » : il montre le micro entendu et ouvre la feuille Micro. Le même bouton en tête de la barre du bas, que le téléphone filme ou non,
// en portrait comme en paysage.
export const MicButton = ({ state, ownNumber, isExpanded, onPress }: MicButtonProps) => (
  <Button
    label={toMicText(state, ownNumber)}
    title="Choisir le micro"
    icon={isMicMuted(state) ? MicOff : Mic}
    isExpanded={isExpanded}
    onPress={onPress}
  />
);

import { toCameraName } from "../../domain/camera.rules";
import { toStopFilmText } from "../../domain/picture.rules";
import type { PictureStanding } from "../../domain/picture.schema";
import { Button } from "../design/button";
import { CameraNumberPicker } from "./camera-number-picker";
import { ControlDrawer } from "./control-drawer";

type CameraSheetProps = {
  // `null` tant que le serveur n'a pas donné de numéro : la pastille de l'aperçu, qui ouvre la feuille, n'est alors pas touchable.
  number: number | null;
  isOpen: boolean;
  // Où en est le plan pour ce téléphone et si son mic est celui du live : de quoi savoir si l'arrêt change l'antenne.
  standing: PictureStanding;
  isLiveMic: boolean;
  onClose: () => void;
  // Prend ce numéro de caméra : rend le refus du serveur à montrer, ou `null` quand c'est fait.
  onUpdateNumber: (number: number) => Promise<string | null>;
  // Ce téléphone a le plan ou le micro du live : l'arrêt demande d'abord la confirmation (`StopFilmSheet`).
  onAskStop: () => void;
  onStopFilming: () => void;
};

// La feuille Caméra, ouverte par la pastille de l'aperçu : le numéro de la caméra (`CameraNumberPicker`) et « Arrêter de filmer ». Si ce
// téléphone a le plan ou le micro du live, l'arrêt demande d'abord une confirmation ; sinon il se fait tout de suite : rien ne change à
// l'antenne. Le flux du téléphone ne se rouvre pas.
export const CameraSheet = ({
  number,
  isOpen,
  standing,
  isLiveMic,
  onClose,
  onUpdateNumber,
  onAskStop,
  onStopFilming,
}: CameraSheetProps) => {
  const title = number === null ? "Caméra" : toCameraName(number);
  return (
    <ControlDrawer isOpen={isOpen} label={title} closeLabel="Fermer la caméra" onClose={onClose}>
      <h2 className="lp-type-heading control-drawer-title">{title}</h2>
      {number !== null && (
        <CameraNumberPicker number={number} onUpdateNumber={onUpdateNumber} onDone={onClose} />
      )}
      <Button
        label="Arrêter de filmer"
        onPress={toStopFilmText(standing, isLiveMic) === null ? onStopFilming : onAskStop}
      />
    </ControlDrawer>
  );
};

type StopFilmSheetProps = {
  isOpen: boolean;
  // Ce que l'arrêt change à l'antenne (`toStopFilmText`) ; `null` quand ce téléphone n'a plus ni plan ni micro.
  outcome: string | null;
  onClose: () => void;
  onStopFilming: () => void;
};

// La confirmation d'« Arrêter de filmer », ouverte par la feuille Caméra (qu'elle remplace) quand ce téléphone a le plan ou le micro : elle
// dit le résultat (« Le plan passe à Tête, le micro au PC. »), « Arrêter de filmer » arrête, « Annuler » referme sans rien faire.
export const StopFilmSheet = ({ isOpen, outcome, onClose, onStopFilming }: StopFilmSheetProps) => (
  <ControlDrawer
    isOpen={isOpen}
    label="Arrêter de filmer ?"
    closeLabel="Fermer sans arrêter de filmer"
    onClose={onClose}
  >
    <h2 className="lp-type-heading control-drawer-title">Arrêter de filmer ?</h2>
    {outcome !== null && <p className="lp-type-body lp-muted control-confirm-text">{outcome}</p>}
    <div className="control-confirm">
      <Button label="Annuler" variant="ghost" onPress={onClose} />
      <Button label="Arrêter de filmer" variant="primary" onPress={onStopFilming} />
    </div>
  </ControlDrawer>
);

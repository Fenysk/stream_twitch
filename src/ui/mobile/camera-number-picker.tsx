import { Minus, Plus } from "lucide-react";
import { useState } from "react";
import { MAX_CAMERA_NUMBER } from "../../domain/phone.schema";
import { Button } from "../design/button";

type CameraNumberPickerProps = {
  number: number;
  // Prend ce numéro : rend le refus du serveur à montrer, ou `null` quand c'est fait.
  onUpdateNumber: (number: number) => Promise<string | null>;
  onDone: () => void;
};

// Changer le numéro de la caméra en cas de conflit : un numéro de plus ou de moins, puis « Prendre ce numéro ». Un autre téléphone qui
// l'a déjà le refuse.
export const CameraNumberPicker = ({ number, onUpdateNumber, onDone }: CameraNumberPickerProps) => {
  const [wanted, setWanted] = useState(number);
  const [refusal, setRefusal] = useState<string | null>(null);
  const [isBusy, setIsBusy] = useState(false);

  // Un autre numéro efface le refus du précédent.
  const pick = (next: number) => {
    setWanted(next);
    setRefusal(null);
  };

  const apply = async () => {
    setIsBusy(true);
    const answer = await onUpdateNumber(wanted);
    setIsBusy(false);
    if (answer === null) onDone();
    else setRefusal(answer);
  };

  return (
    <div className="lp-pill-content lp-col camera-number-picker">
      <p className="lp-type-body">Numéro de la caméra</p>
      <div className="lp-row camera-number-row">
        <Button
          icon={Minus}
          title="Numéro précédent"
          isDisabled={wanted <= 1}
          onPress={() => pick(wanted - 1)}
        />
        <span className="lp-type-display" aria-live="polite">
          {wanted}
        </span>
        <Button
          icon={Plus}
          title="Numéro suivant"
          isDisabled={wanted >= MAX_CAMERA_NUMBER}
          onPress={() => pick(wanted + 1)}
        />
      </div>
      {refusal && (
        <p role="alert" className="lp-type-caption lp-warning">
          {refusal}
        </p>
      )}
      <Button
        label="Prendre ce numéro"
        variant="primary"
        isDisabled={isBusy || wanted === number}
        onPress={() => void apply()}
      />
    </div>
  );
};

// Le bas de l'onglet « Découpe » : le nom de l'expression, Enregistrer, Supprimer (avec sa confirmation) et Fermer.

import { Scissors } from "lucide-react";
import { useState } from "react";
import { Button } from "../design/button";
import { DESIGN_TEXTS } from "../design/design-texts";
import { TextField } from "../design/text-field";
import { SmallWindow } from "../design/window";

const MAX_NAME_LENGTH = 40;

type CutSaveProps = {
  name: string;
  isRetouch: boolean;
  isBusy: boolean;
  isReady: boolean;
  notice: string | null;
  onNameChange: (name: string) => void;
  onSubmit: () => void;
  onDelete: () => void;
  onClose: () => void;
};

export const CutSave = ({
  name,
  isRetouch,
  isBusy,
  isReady,
  notice,
  onNameChange,
  onSubmit,
  onDelete,
  onClose,
}: CutSaveProps) => {
  const [isConfirming, setIsConfirming] = useState(false);
  return (
    <div className="cut-save">
      <TextField label="Nom" value={name} maxLength={MAX_NAME_LENGTH} onInput={onNameChange} />
      <div className="cut-actions">
        <Button
          label="Enregistrer"
          icon={Scissors}
          variant="primary"
          isDisabled={isBusy || !isReady}
          onPress={onSubmit}
        />
        {isRetouch && (
          <Button
            label="Supprimer"
            variant="danger"
            isDisabled={isBusy}
            onPress={() => setIsConfirming(true)}
          />
        )}
        <Button label="Fermer" variant="ghost" isDisabled={isBusy} onPress={onClose} />
      </div>
      {notice && (
        <p role="status" className="lp-type-body">
          {notice}
        </p>
      )}
      <SmallWindow
        isOpen={isConfirming}
        title="Supprimer cette expression ?"
        onClose={() => setIsConfirming(false)}
        actions={
          <>
            <Button label={DESIGN_TEXTS.cancel} onPress={() => setIsConfirming(false)} />
            <Button
              label="Supprimer"
              variant="danger"
              onPress={() => {
                setIsConfirming(false);
                onDelete();
              }}
            />
          </>
        }
      >
        <p className="lp-type-body">« {name} » disparaît pour de bon.</p>
      </SmallWindow>
    </div>
  );
};

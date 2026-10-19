import { VolumeX } from "lucide-react";
import { useEffect } from "react";
import { Button } from "../design/button";
import type { ToastTone } from "../design/toast-announcement";
import { useSounds } from "../settings/use-sounds";
import { ControlKeyButton } from "./control-key";
import { toSoundKeys, toSoundsEmptyText } from "./control-keys";
import { useControlActions } from "./use-control-actions";

type ControlGridProps = {
  // Le tiroir qui la porte est ouvert : la liste des sons est relue à chaque ouverture, la soundboard a pu changer.
  isOpen: boolean;
  // Un refus s'annonce par le toast de la page qui porte la grille.
  onToast: (tone: ToastTone, text: string) => void;
};

// La grille de la régie, dans le tiroir « Sons » : « Couper le son » en tête, puis 3 colonnes de touches, une par son de la soundboard, générées
// sans réglage. Elle lit les sounds et exécute les gestes elle-même : la page qui la porte n'a rien à câbler (la Régie et le Selfie la mettent
// dans le tiroir, `ControlDock`). Un son joué ne referme pas le tiroir : on en enchaîne plusieurs.
export const ControlGrid = ({ isOpen, onToast }: ControlGridProps) => {
  const { sounds, refresh } = useSounds();
  const press = useControlActions(onToast);

  useEffect(() => {
    if (isOpen) void refresh();
  }, [isOpen, refresh]);

  const keys = toSoundKeys(sounds);
  return (
    <section className="control-grid" aria-label="Sons">
      <Button icon={VolumeX} label="Couper le son" onPress={() => press({ kind: "stop" })} />
      {keys.length === 0 ? (
        <p className="lp-type-body lp-muted control-empty" role="status">
          {toSoundsEmptyText(sounds)}
        </p>
      ) : (
        <div className="control-keys">
          {keys.map((item) => (
            <ControlKeyButton key={item.id} item={item} onPress={press} />
          ))}
        </div>
      )}
    </section>
  );
};

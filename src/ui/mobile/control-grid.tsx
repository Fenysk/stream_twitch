import { useState } from "react";
import { CONTROL_PAGES, type ControlPage, type ControlState } from "../../domain/control.schema";
import { Segmented, type SegmentedOption } from "../design/segmented";
import type { ToastTone } from "../design/toast-announcement";
import { useSounds } from "../settings/use-sounds";
import { ControlKeyButton } from "./control-key";
import { PAGE_LABELS, toEmptyText, toKeys } from "./control-keys";
import { useControlActions } from "./use-control-actions";

const PAGE_CHOICES: readonly SegmentedOption<ControlPage>[] = CONTROL_PAGES.map((page) => ({
  value: page,
  label: PAGE_LABELS[page],
}));

type ControlGridProps = {
  state: ControlState;
  // Un refus s'annonce par le toast de la page qui porte la grille.
  onToast: (tone: ToastTone, text: string) => void;
};

// La grille de touches de la régie : un contrôle segmenté pour les trois pages (Sons, Micros, Jean-Renard), et 3 colonnes de touches
// générées de l'état, sans réglage. Elle lit les sounds et exécute les gestes elle-même : la page qui la porte n'a rien à
// câbler (le Selfie la met dans un tiroir).
export const ControlGrid = ({ state, onToast }: ControlGridProps) => {
  const [page, setPage] = useState<ControlPage>("sounds");
  const { sounds, refresh } = useSounds();
  const press = useControlActions(onToast);

  // La soundboard peut avoir changé depuis l'ouverture : sa liste est relue quand on ouvre la page des sons.
  const select = (next: ControlPage) => {
    setPage(next);
    if (next === "sounds") void refresh();
  };

  const keys = toKeys(page, state, sounds);
  return (
    <section className="control-grid" aria-label="Touches">
      <Segmented label="Page des touches" options={PAGE_CHOICES} value={page} onSelect={select} />
      {keys.length === 0 ? (
        <p className="lp-type-body lp-muted control-empty" role="status">
          {toEmptyText(page, sounds)}
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

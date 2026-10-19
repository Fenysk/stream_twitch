import type { ReactNode } from "react";
import { Grabber } from "../design/grabber";

// `label` nomme la feuille, `closeLabel` ce que disent le voile et la poignée qui la ferment.
type ControlDrawerProps = {
  isOpen: boolean;
  label: string;
  closeLabel: string;
  onClose: () => void;
  children: ReactNode;
};

const doNothing = (): void => undefined;

// Une feuille qui monte du bas (le tiroir des sons, les feuilles du bandeau), avec la poignée du design system (la glisser vers
// le bas ou la toucher la ferme). Toucher le voile à côté la ferme aussi. Fermée, elle reste dans la page (son contenu garde son état)
// sans être visible ni atteignable. Une feuille ne s'ouvre pas dans une autre : elles sont sœurs, la dernière dans la page est dessus.
export const ControlDrawer = ({ isOpen, label, closeLabel, onClose, children }: ControlDrawerProps) => (
  <div className="control-drawer" data-open={isOpen}>
    <button
      type="button"
      className="control-drawer-scrim"
      aria-label={closeLabel}
      tabIndex={-1}
      onClick={onClose}
    />
    <section className="lp-pill control-drawer-sheet" aria-label={label}>
      <Grabber label={closeLabel} onUp={doNothing} onDown={onClose} onTap={onClose} />
      <div className="control-drawer-body">{children}</div>
    </section>
  </div>
);

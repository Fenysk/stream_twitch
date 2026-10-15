// La coquille de l'interface de réglages : le menu à gauche (une rangée d'onglets sur écran étroit), le choix de l'apparence
// dessous, et la page choisie à droite. Elle ne connaît pas le routeur : la route lui donne l'onglet et reçoit le choix.
// Le titre de la page est celui de la page elle-même (settings-page.tsx).

import type { ReactNode } from "react";
import { AppearancePicker } from "../design/appearance-controls";
import { pickAppearance, useAppearanceChoice } from "../design/use-appearance";
import { WindowNav, type WindowSectionGroup } from "../design/window";

type SettingsShellProps<Id extends string> = {
  groups: readonly WindowSectionGroup<Id>[];
  currentId: Id;
  onSelect: (id: Id) => void;
  children: ReactNode;
};

export const SettingsShell = <Id extends string>({
  groups,
  currentId,
  onSelect,
  children,
}: SettingsShellProps<Id>) => {
  const appearance = useAppearanceChoice();
  return (
    <main className="settings-page">
      <div className="settings-shell">
        <aside className="settings-side">
          <p className="settings-title lp-type-title">stream_twitch</p>
          <WindowNav groups={groups} currentId={currentId} onSelect={onSelect} />
          <div className="settings-appearance">
            <AppearancePicker choice={appearance} onPick={pickAppearance} />
          </div>
        </aside>
        <section className="settings-main">{children}</section>
      </div>
    </main>
  );
};

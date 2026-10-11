// La coquille de l'interface de réglages : le menu à gauche (une rangée d'onglets sur écran étroit), le choix de l'apparence
// dessous, et la section choisie à droite. Elle ne connaît pas le routeur : la route lui donne la section et reçoit le choix.

import type { ReactNode } from "react";
import { AppearancePicker } from "../design/appearance-controls";
import { pickAppearance, useAppearanceChoice } from "../design/use-appearance";
import { WindowNav, type WindowSection } from "../design/window";

type SettingsShellProps<Id extends string> = {
  sections: readonly WindowSection<Id>[];
  currentId: Id;
  onSelect: (id: Id) => void;
  children: ReactNode;
};

export const SettingsShell = <Id extends string>({
  sections,
  currentId,
  onSelect,
  children,
}: SettingsShellProps<Id>) => {
  const appearance = useAppearanceChoice();
  const current = sections.find(({ id }) => id === currentId) ?? sections[0];
  return (
    <main className="settings-page">
      <div className="settings-shell">
        <aside className="settings-side">
          <p className="settings-title lp-type-title">stream_twitch</p>
          <WindowNav sections={sections} currentId={current?.id} onSelect={onSelect} />
          <div className="settings-appearance">
            <AppearancePicker choice={appearance} onPick={pickAppearance} />
          </div>
        </aside>
        <section className="settings-main">
          <h1 className="settings-heading lp-type-heading">{current?.label}</h1>
          {children}
        </section>
      </div>
    </main>
  );
};

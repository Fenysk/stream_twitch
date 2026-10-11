// Choisir l'apparence : un bouton qui fait le cycle (pill Compte), ou les trois choix côte à côte (Mon compte, /design).

import { Moon, Sun, SunMoon } from "lucide-react";
import { type AppearanceChoice, nextAppearanceChoice } from "./appearance";
import { Button } from "./button";
import { DESIGN_TEXTS } from "./design-texts";
import { Segmented, type SegmentedOption } from "./segmented";

type AppearanceControlProps = { choice: AppearanceChoice; onPick: (choice: AppearanceChoice) => void };

const useAppearanceChoices = () => {
  const t = DESIGN_TEXTS;
  return [
    { value: "auto", label: t.appearanceAuto, icon: SunMoon },
    { value: "light", label: t.appearanceLight, icon: Sun },
    { value: "dark", label: t.appearanceDark, icon: Moon },
  ] as const satisfies readonly SegmentedOption<AppearanceChoice>[];
};

export const AppearanceButton = ({ choice, onPick }: AppearanceControlProps) => {
  const t = DESIGN_TEXTS;
  const choices = useAppearanceChoices();
  const { label, icon } = choices.find(({ value }) => value === choice) ?? choices[0];
  return (
    <Button
      icon={icon}
      variant="ghost"
      title={t.appearanceTip(label)}
      onPress={() => onPick(nextAppearanceChoice(choice))}
    />
  );
};

export const AppearancePicker = ({ choice, onPick }: AppearanceControlProps) => {
  const t = DESIGN_TEXTS;
  const choices = useAppearanceChoices();
  return <Segmented label={t.appearance} options={choices} value={choice} onSelect={onPick} />;
};

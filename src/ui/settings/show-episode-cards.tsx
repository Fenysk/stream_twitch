// Les cartes de l'onglet « Émission » qui règlent l'émission : où elle en est et combien de clips elle passe, puis les phrases de
// Jean-Renard au début et à la fin. L'onglet garde les réglages et l'état ; ces cartes ne font qu'afficher.

import type { ShowState } from "../../domain/show.schema";
import { toShowStatusText } from "../clips/clip-text";
import { DESIGN_TEXTS } from "../design/design-texts";
import { LinesField } from "./lines-field";
import { SettingSlider } from "./setting-slider";
import { SettingsCard } from "./settings-page";
import { SHOW_CLIP_COUNT_SLIDER, SHOW_LISTS } from "./show-fields";
import type { UseSettings } from "./use-settings";

type EpisodeCardsProps = { state: ShowState; settings: UseSettings };

export const EpisodeCards = ({ state, settings }: EpisodeCardsProps) => {
  const effective = settings.view?.effective;
  return (
    <>
      <SettingsCard title="Émission">
        <p role="status" className="lp-type-body">
          {toShowStatusText(state)}
        </p>
        <p className="lp-type-caption lp-muted">
          Elle commence quand la source /show est visible dans la scène du programme d'OBS, et s'arrête dès
          qu'elle ne l'est plus.
        </p>
        {effective ? (
          <SettingSlider spec={SHOW_CLIP_COUNT_SLIDER} settings={settings} effective={effective} />
        ) : (
          <p className="lp-type-body">{DESIGN_TEXTS.loading}</p>
        )}
      </SettingsCard>
      <SettingsCard title="Phrases de Jean-Renard">
        {effective ? (
          SHOW_LISTS.map((spec) => (
            <LinesField key={spec.key} spec={spec} settings={settings} effective={effective} />
          ))
        ) : (
          <p className="lp-type-body">{DESIGN_TEXTS.loading}</p>
        )}
      </SettingsCard>
    </>
  );
};

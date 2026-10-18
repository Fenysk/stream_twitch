// Les cartes de l'onglet « Émission » qui règlent l'émission : où elle en est et combien de clips elle passe (avec la durée que ça donne),
// puis les phrases de Jean-Renard au début, à la fin et quand elle est coupée. L'onglet garde les réglages, l'état et les clips ; ces
// cartes ne font qu'afficher.

import type { ConfirmedSummary } from "../../domain/clip.schema";
import { toLaughSchedule, toShowLengthMs, toShowLengthText } from "../../domain/show.rules";
import type { ShowState } from "../../domain/show.schema";
import { toShowStatusText } from "../clips/clip-text";
import { DESIGN_TEXTS } from "../design/design-texts";
import { LinesField } from "./lines-field";
import { SettingSlider, toSliderValue } from "./setting-slider";
import { SettingsCard } from "./settings-page";
import { SHOW_CLIP_COUNT_SLIDER, SHOW_LISTS } from "./show-fields";
import type { UseSettings } from "./use-settings";

// Un clip confirmé tel que le tirage le voit : ses passages, la durée de sa partie gardée et les rires qui y jouent.
const toCandidate = (clip: ConfirmedSummary) => ({
  name: clip.name,
  playCount: clip.playCount ?? 0,
  durationMs: Math.round((clip.end - clip.start) * 1000),
  laughs: toLaughSchedule(clip.laughs ?? [], clip),
});

const toLengthText = (confirmed: readonly ConfirmedSummary[], count: number): string =>
  toShowLengthText(toShowLengthMs(confirmed.map(toCandidate), count));

// `confirmed` : les clips confirmés, `null` tant que la liste n'est pas lue.
type EpisodeCardsProps = {
  state: ShowState;
  settings: UseSettings;
  confirmed: readonly ConfirmedSummary[] | null;
};

export const EpisodeCards = ({ state, settings, confirmed }: EpisodeCardsProps) => {
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
          <>
            <SettingSlider spec={SHOW_CLIP_COUNT_SLIDER} settings={settings} effective={effective} />
            {confirmed && confirmed.length > 0 && (
              <p className="lp-type-caption lp-muted">
                {toLengthText(confirmed, toSliderValue(SHOW_CLIP_COUNT_SLIDER, settings, effective))}
              </p>
            )}
          </>
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

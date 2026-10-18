// Les cartes de l'onglet « Émission » qui règlent l'émission : où elle en est, combien de clips elle passe (avec la durée que ça donne)
// et la scène d'OBS où elle laisse le programme, puis les phrases de Jean-Renard au début, à la fin et quand elle est coupée. L'onglet garde les réglages, l'état et les clips ; ces
// cartes ne font qu'afficher.

import type { ConfirmedSummary } from "../../domain/clip.schema";
import type { EditableSettings } from "../../domain/settings.schema";
import { toLaughSchedule, toShowLengthMs, toShowLengthText } from "../../domain/show.rules";
import type { ShowState } from "../../domain/show.schema";
import { toShowStatusText } from "../clips/clip-text";
import { ChoiceList, type ChoiceOption } from "../design/choice-list";
import { DESIGN_TEXTS } from "../design/design-texts";
import { LinesField } from "./lines-field";
import { SettingSlider, toSliderValue } from "./setting-slider";
import { SettingsCard } from "./settings-page";
import { SHOW_CLIP_COUNT_SLIDER, SHOW_LISTS } from "./show-fields";
import type { UseScenes } from "./use-scenes";
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

// Vide : le programme reste sur la scène de l'émission.
const STAY_SCENE = "";

// « Rester », puis les scènes d'OBS dans son ordre. La scène enregistrée reste choisie quand OBS ne la liste pas (« absente d'OBS »),
// ou quand sa liste n'est pas lue (OBS injoignable : on ne sait pas si elle existe).
const toSceneChoices = (scenes: readonly string[] | null, saved: string): ChoiceOption<string>[] => [
  { value: STAY_SCENE, label: "Rester sur la scène de l'émission" },
  ...(scenes ?? []).map((name) => ({ value: name, label: name })),
  ...(saved === STAY_SCENE || scenes?.includes(saved)
    ? []
    : [scenes ? { value: saved, label: saved, note: "absente d'OBS" } : { value: saved, label: saved }]),
];

type EndSceneChoiceProps = { scenes: UseScenes; settings: UseSettings; effective: EditableSettings };

export const EndSceneChoice = ({ scenes, settings, effective }: EndSceneChoiceProps) => (
  <>
    {scenes.error && (
      <p className="lp-type-caption lp-muted">Les scènes d'OBS sont illisibles : {scenes.error}.</p>
    )}
    {scenes.scenes === null && scenes.error === null ? (
      <p className="lp-type-body">{DESIGN_TEXTS.loading}</p>
    ) : (
      <ChoiceList
        label="Scène après l'émission"
        options={toSceneChoices(scenes.scenes, effective.showEndScene ?? STAY_SCENE)}
        value={effective.showEndScene ?? STAY_SCENE}
        onSelect={(showEndScene) => void settings.change({ showEndScene })}
      />
    )}
    <p className="lp-type-caption lp-muted">
      OBS y passe tout seul quand l'émission finit normalement, pas quand tu la coupes.
    </p>
  </>
);

// `confirmed` : les clips confirmés, `null` tant que la liste n'est pas lue.
type EpisodeCardsProps = {
  state: ShowState;
  settings: UseSettings;
  confirmed: readonly ConfirmedSummary[] | null;
  scenes: UseScenes;
};

export const EpisodeCards = ({ state, settings, confirmed, scenes }: EpisodeCardsProps) => {
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
            <EndSceneChoice scenes={scenes} settings={settings} effective={effective} />
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

// La page « Direct » : l'accueil des réglages, pour savoir en un coup d'œil où en est le live. Quatre cartes d'état (le micro,
// Twitch, le nombre de viewers, la source du renard), puis l'expression de la tête et « Faire parler le renard », qu'on a sous
// la main pendant le live. Une seule colonne, sans aperçu : rien ici ne se règle, tout s'applique en direct.

import { Button } from "../design/button";
import { classNames } from "../design/class-names";
import { useFox } from "../use-fox";
import { ExpressionCard } from "./expression-card";
import { FoxSpeakForm } from "./fox-speak-form";
import { type StateLine, type Tone, toFoxSourceLine, toTwitchLine, toViewersLine } from "./live-states";
import { MicMeter } from "./mic-meter";
import { SettingsCard, SettingsLoading, SettingsPage } from "./settings-page";
import { toSectionLabel } from "./settings-sections";
import { useExpressions } from "./use-expressions";
import { useMicLevel } from "./use-mic-level";
import { useSettings } from "./use-settings";
import { useTwitch } from "./use-twitch";
import { useViewers } from "./use-viewers";

const TITLE = toSectionLabel("live");

const TONE_CLASS: Record<Tone, string | undefined> = {
  good: "lp-success",
  neutral: undefined,
  warning: "lp-warning",
};

type StateTextProps = { line: StateLine; error?: string | null };

// L'état en une ligne, sa phrase d'aide, et pourquoi on n'a pas pu le lire.
const StateText = ({ line, error = null }: StateTextProps) => (
  <div className="live-state">
    <p className={classNames("lp-type-body", TONE_CLASS[line.tone])}>{line.text}</p>
    {line.help && <p className="lp-type-caption lp-muted">{line.help}</p>}
    {error && (
      <p role="alert" className="lp-type-caption lp-danger">
        {error}
      </p>
    )}
  </div>
);

export const LiveSettingsTab = () => {
  const settings = useSettings();
  const mic = useMicLevel();
  const twitch = useTwitch();
  const { viewers, error: viewersError } = useViewers();
  const fox = useFox("preview");
  const { expressions } = useExpressions();
  const { view } = settings;
  if (!view) return <SettingsLoading title={TITLE} />;
  const { effective } = view;
  return (
    <SettingsPage title={TITLE} errors={settings.errors.general}>
      <div className="live-states">
        <SettingsCard title="Micro">
          <MicMeter level={mic.level} isLinked={mic.isLinked} threshold={effective.threshold} />
        </SettingsCard>
        <SettingsCard title="Twitch">
          <StateText line={toTwitchLine(twitch.status)} error={twitch.error} />
          <div className="live-actions">
            <Button label="Ouvrir l'onglet Twitch" href="/settings/twitch" />
          </div>
        </SettingsCard>
        <SettingsCard title="Live">
          <StateText line={toViewersLine(viewers)} error={viewersError} />
        </SettingsCard>
        <SettingsCard title="Renard">
          <StateText line={toFoxSourceLine(fox.isMuted)} />
        </SettingsCard>
      </div>
      <ExpressionCard
        title="Expression de la tête"
        expressions={expressions}
        settings={settings}
        effective={effective}
      />
      <SettingsCard title="Faire parler le renard">
        <FoxSpeakForm isMuted={fox.isMuted} />
      </SettingsCard>
    </SettingsPage>
  );
};

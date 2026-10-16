// La page « Direct » : l'accueil des réglages, pour savoir en un coup d'œil où en est le live. Quatre cartes d'état (le micro,
// Twitch, le nombre de viewers, la source du renard), puis la fin du live, l'expression de la tête et « Faire parler le renard »,
// qu'on a sous la main pendant le live. Une seule colonne, sans aperçu : tout s'applique en direct.

import { toEndStatus } from "../../domain/hours.rules";
import { toInstant } from "../../domain/instant.rules";
import { Button } from "../design/button";
import { classNames } from "../design/class-names";
import { useFox } from "../use-fox";
import { ExpressionCard } from "./expression-card";
import { FoxSpeakForm } from "./fox-speak-form";
import { END_AT_CODEC, type TimeSpec } from "./head-fields";
import {
  type StateLine,
  type Tone,
  toEndLine,
  toFoxSourceLine,
  toTwitchLine,
  toViewersLine,
} from "./live-states";
import { MicMeter } from "./mic-meter";
import { SettingTime } from "./setting-time";
import { SettingsCard, SettingsLoading, SettingsPage } from "./settings-page";
import { toSectionLabel } from "./settings-sections";
import { useExpressions } from "./use-expressions";
import { useMicLevel } from "./use-mic-level";
import { useNow } from "./use-now";
import { useSettings } from "./use-settings";
import { useTwitch } from "./use-twitch";
import { useViewers } from "./use-viewers";

const TITLE = toSectionLabel("live");

// La fin prévue se relit toutes les 15 s : le temps restant se met à jour sans recharger la page.
const END_REFRESH_MS = 15_000;

// Le même réglage que dans l'onglet Renard (« Heure du live ») : seule l'aide change.
const END_TIME: TimeSpec = {
  key: "foxEndAt",
  label: "Fin prévue",
  help: "HH:MM, la prochaine fois qu'elle sonne. Vide : pas de fin prévue. Même réglage que Renard > Heure du live.",
  codec: END_AT_CODEC,
};

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
  const now = useNow(END_REFRESH_MS);
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
      {effective.foxEndAt !== undefined && (
        <SettingsCard title="Fin du live">
          <StateText line={toEndLine(toEndStatus(toInstant(effective.foxEndAt), now))} />
          <SettingTime spec={END_TIME} settings={settings} effective={effective} />
        </SettingsCard>
      )}
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

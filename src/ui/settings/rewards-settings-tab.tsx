// L'onglet « Points de chaîne » : les récompenses de la chaîne, réglées à part des sounds, en deux cartes sur la page commune
// (Récompenses, Créer une récompense), une seule colonne. Chaque récompense choisit son sound dans un menu (aucun, ou un sound de
// l'onglet Sons) et peut faire parler Jean-Renard. Celles que l'application a créées se modifient et se suppriment ici, et sur
// Twitch avec elles ; celles qu'Alexis a faites sur Twitch s'y règlent. Les refus de Twitch (chaîne non affiliée, titre pris,
// 50 récompenses) se lisent tels quels.

import { RefreshCw } from "lucide-react";
import { useState } from "react";
import type { RewardCreation } from "../../domain/reward.schema";
import { Button } from "../design/button";
import { DESIGN_TEXTS } from "../design/design-texts";
import { RewardForm } from "./reward-form";
import { RewardRow } from "./reward-row";
import { toRewardRows } from "./reward-rows";
import { SettingsCard, SettingsPage } from "./settings-page";
import { toSectionLabel } from "./settings-sections";
import { toTwitchHint } from "./twitch-hint";
import { useRewardPhrases } from "./use-reward-phrases";
import { useRewards } from "./use-rewards";
import { useSounds } from "./use-sounds";
import { useTwitch } from "./use-twitch";

const TITLE = toSectionLabel("rewards");

// Ce que l'onglet dit après une action : une confirmation, ou le refus.
type Notice = { text: string; isError: boolean };

export const RewardsSettingsTab = () => {
  const { sounds } = useSounds();
  const twitchHint = toTwitchHint(useTwitch().status);
  const rewards = useRewards();
  const phrases = useRewardPhrases();
  const [editedId, setEditedId] = useState<string | null>(null);
  const [notice, setNotice] = useState<Notice | null>(null);
  const [isBusy, setIsBusy] = useState(false);

  const say = (text: string) => setNotice({ text, isError: false });
  const refuse = (text: string) => setNotice({ text, isError: true });
  const refreshAll = () => Promise.all([rewards.refresh(), phrases.refresh()]);

  const create = async (input: RewardCreation): Promise<string | null> => {
    const refusal = await rewards.createReward(input);
    if (refusal !== null) return refusal;
    await phrases.refresh();
    say(`« ${input.title} » est créée sur Twitch.`);
    return null;
  };

  const update = async (id: string, input: RewardCreation): Promise<string | null> => {
    const refusal = await rewards.updateReward(id, input);
    if (refusal !== null) return refusal;
    setEditedId(null);
    await phrases.refresh();
    say(`« ${input.title} » est modifiée sur Twitch.`);
    return null;
  };

  const deleteOne = async (id: string, title: string) => {
    setIsBusy(true);
    const refusal = await rewards.deleteReward(id);
    setIsBusy(false);
    if (refusal !== null) {
      refuse(refusal);
      return;
    }
    await phrases.refresh();
    say(`« ${title} » est supprimée de Twitch.`);
  };

  const rows = rewards.rewards ? toRewardRows(rewards.rewards, phrases.rewards) : [];

  return (
    <SettingsPage title={TITLE}>
      <SettingsCard title="Récompenses">
        <div className="sound-global">
          <Button
            label="Rafraîchir"
            icon={RefreshCw}
            isDisabled={rewards.isLoading || phrases.isLoading}
            onPress={() => void refreshAll()}
          />
          <p className="lp-type-caption lp-muted">
            {rewards.rewards
              ? `${rewards.rewards.length} récompense(s) sur la chaîne.`
              : "Les récompenses de la chaîne se lisent sur Twitch."}
          </p>
        </div>
        <p className="lp-type-caption lp-muted">
          Chaque récompense joue le son que tu lui choisis quand un viewer la dépense : ses points sont gardés
          si le son joue jusqu'au bout, rendus sinon (seulement pour celles que l'application a créées). Elle
          peut aussi faire parler Jean-Renard : à chaque rachat, il dit une phrase tirée au hasard, {"{user}"}{" "}
          devient le nickname du viewer. Les récompenses du renard (clash, réveil) se règlent dans l'onglet
          Renard.
        </p>
        {rewards.error && (
          <p role="status" className="lp-type-caption lp-muted">
            {rewards.error}
          </p>
        )}
        {phrases.error && !rewards.error && (
          <p role="status" className="lp-type-caption lp-muted">
            {phrases.error}
          </p>
        )}
        {twitchHint && (
          <p role="status" className="lp-type-body lp-warning">
            {twitchHint}
          </p>
        )}
        {notice && (
          <p
            role={notice.isError ? "alert" : "status"}
            className={notice.isError ? "lp-type-body lp-danger" : "lp-type-body"}
          >
            {notice.text}
          </p>
        )}
        {rewards.rewards === null && rewards.isLoading && (
          <p className="lp-type-body lp-muted">{DESIGN_TEXTS.loading}</p>
        )}
        {rewards.rewards && rows.length === 0 && (
          <p className="lp-type-body lp-muted">
            Aucune récompense sur la chaîne. « Rafraîchir » relit la liste.
          </p>
        )}
        {rows.length > 0 && (
          <ul className="sound-list" aria-label="Récompenses de la chaîne">
            {rows.map(({ reward, phrases: entry }) =>
              reward.id === editedId ? (
                <li key={reward.id} className="sound-row">
                  <RewardForm
                    initial={reward}
                    sounds={sounds}
                    onSubmit={(input) => update(reward.id, input)}
                    onCancel={() => setEditedId(null)}
                  />
                </li>
              ) : (
                <RewardRow
                  key={reward.id}
                  reward={reward}
                  phrases={entry}
                  sounds={sounds}
                  isBusy={isBusy}
                  onPickSound={rewards.updateRewardSound}
                  onSavePhrases={phrases.save}
                  onTestPhrases={phrases.test}
                  onEdit={() => setEditedId(reward.id)}
                  onDelete={() => void deleteOne(reward.id, reward.title)}
                />
              ),
            )}
          </ul>
        )}
      </SettingsCard>
      <SettingsCard title="Créer une récompense">
        <p className="lp-type-caption lp-muted">
          L'application la crée sur Twitch (50 récompenses au plus sur la chaîne), puis la modifie, la met en
          pause hors stream et marque ses rachats.
        </p>
        <RewardForm initial={null} sounds={sounds} onSubmit={create} />
      </SettingsCard>
    </SettingsPage>
  );
};

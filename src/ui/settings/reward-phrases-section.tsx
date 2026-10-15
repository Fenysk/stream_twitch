// Les phrases de Jean-Renard : chaque récompense de la chaîne, avec ou sans son, peut le faire parler quand un viewer la dépense.

import { DESIGN_TEXTS } from "../design/design-texts";
import { RewardPhrasesRow } from "./reward-phrases-row";
import { SettingsCard } from "./settings-page";
import type { UseRewardPhrases } from "./use-reward-phrases";

type RewardPhrasesSectionProps = { phrases: UseRewardPhrases };

export const RewardPhrasesSection = ({ phrases }: RewardPhrasesSectionProps) => {
  const { rewards, error, isLoading, save, test } = phrases;
  return (
    <SettingsCard title="Phrases de Jean-Renard">
      <p className="lp-type-caption lp-muted">
        Chaque récompense de la chaîne, qu'elle ait un son ou non, peut faire parler Jean-Renard : à chaque
        rachat, il dit une phrase tirée au hasard, {"{user}"} devient le nickname du viewer. Elle se dit même
        si « Lire le tchat » est désactivé. Les récompenses du renard (clash, réveil) se règlent dans l'onglet
        Renard.
      </p>
      {error && (
        <p role="status" className="lp-type-caption lp-muted">
          {error}
        </p>
      )}
      {rewards === null && isLoading && <p className="lp-type-body lp-muted">{DESIGN_TEXTS.loading}</p>}
      {rewards?.length === 0 && (
        <p className="lp-type-body lp-muted">
          Aucune récompense sur la chaîne. « Rafraîchir » relit la liste.
        </p>
      )}
      {rewards && rewards.length > 0 && (
        <ul className="sound-list" aria-label="Récompenses de la chaîne">
          {rewards.map((entry) => (
            <RewardPhrasesRow key={entry.id} entry={entry} onSave={save} onTest={test} />
          ))}
        </ul>
      )}
    </SettingsCard>
  );
};

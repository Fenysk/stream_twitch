import { type InsultList, toInsultMatch } from "../domain/chat-insults.rules";
import { isFillable, toFilledPhrase } from "../domain/phrase.rules";
import { toNextPick } from "../domain/pick.rules";
import type { RewardEvent } from "../domain/reward.types";
import { TEST_NICKNAME } from "../domain/reward-phrase.rules";
import { SOMEONE } from "../domain/thanks.rules";
import type { SpeakResult } from "./fox.usecase";
import type { FoxJab } from "./fox-jab.usecase";
import type { FoxModeController } from "./fox-mode.usecase";
import type { FoxQueue } from "./fox-queue.usecase";
import type { RewardPhraseLibrary } from "./reward-phrase.usecase";
import type { SoundQueue } from "./sound-queue.usecase";

export type FoxRewardDeps = {
  queue: Pick<FoxQueue, "push">;
  // « Tester » : le renard dit la phrase tout de suite, comme « Faire parler ».
  mode: Pick<FoxModeController, "say">;
  // Le sound de la récompense, s'il en a un : la phrase part quand il se termine.
  sounds: Pick<SoundQueue, "redeem">;
  phrases: Pick<RewardPhraseLibrary, "get">;
  // Un rachat est quelque chose qui se passe dans le live : le silence de la relance repart.
  jab: Pick<FoxJab, "noteActivity">;
  insults: InsultList;
  // Le titre est celui d'une récompense du renard (clash, wake) : son mécanisme reste celui des remerciements.
  isReserved: (title: string) => boolean;
  random: () => number;
  log: (message: string) => void;
};

export type FoxReward = {
  // Un rachat : son sound se joue (la queue des sounds s'occupe des points), puis le renard dit une phrase de la récompense.
  // Sans sound, la phrase part tout de suite. La récompense d'un renard (clash, wake) n'a pas de phrase ici.
  redeem(redemption: RewardEvent): void;
  // « Tester » : une phrase de la récompense dite tout de suite, avec Fenysk pour {user}.
  test(rewardId: string): Promise<SpeakResult>;
};

// Les phrases d'une récompense : tirée au hasard sans répéter la dernière, la phrase passe comme un remerciement devant les
// messages du tchat, n'expire jamais, et se dit même quand « Lire le tchat » est désactivé ; s'il est parti, il revient.
export function createFoxReward({
  queue,
  mode,
  sounds,
  phrases,
  jab,
  insults,
  isReserved,
  random,
  log,
}: FoxRewardDeps): FoxReward {
  // Les phrases déjà dites de chaque récompense depuis son dernier tour : pas de répétition avant d'avoir tout dit.
  const said = new Map<string, string[]>();

  // Rend vrai quand la phrase est dite, faux si aucune ne peut l'être ou si la synthèse échoue.
  const say = (redemption: RewardEvent, list: readonly string[]): Promise<boolean> => {
    const { user, title, rewardId } = redemption;
    const isRefused = toInsultMatch(user, insults) !== null;
    const values = { user: isRefused ? SOMEONE : user };
    const pick = toNextPick(
      list.filter((phrase) => isFillable(phrase, values)),
      said.get(rewardId) ?? [],
      random,
    );
    if (!pick) {
      log(`Renard : aucune phrase possible pour la récompense « ${title} », rien n'est dit.`);
      return Promise.resolve(false);
    }
    said.set(rewardId, pick.said);
    const text = toFilledPhrase(pick.phrase, values);
    if (isRefused)
      log(`Renard : pseudo refusé par le filtre d'insultes (récompense « ${title} »), il n'est pas dit.`);
    log(`Renard : récompense « ${title} » : « ${text} »`);
    jab.noteActivity();
    return new Promise((resolve) => {
      queue.push({
        kind: "thanks",
        label: `récompense (${title})`,
        text,
        isCuttable: false,
        isUrgent: true,
        toShow: () => null,
        onDone: resolve,
      });
    });
  };

  return {
    redeem(redemption) {
      const list = isReserved(redemption.title) ? [] : phrases.get(redemption.rewardId);
      const afterSound = list.length > 0 ? () => say(redemption, list) : undefined;
      if (sounds.redeem(redemption, afterSound)) return;
      if (afterSound) void afterSound();
    },
    async test(rewardId) {
      const values = { user: TEST_NICKNAME };
      const pick = toNextPick(
        phrases.get(rewardId).filter((phrase) => isFillable(phrase, values)),
        [],
        random,
      );
      if (!pick) return { ok: false, status: 400, message: "cette récompense n'a pas de phrase à dire" };
      return mode.say(toFilledPhrase(pick.phrase, values));
    },
  };
}

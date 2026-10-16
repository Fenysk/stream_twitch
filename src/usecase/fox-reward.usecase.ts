import { type InsultList, toInsultMatch } from "../domain/chat-insults.rules";
import { FLINCH_MODE } from "../domain/fox-mode.rules";
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
  // « Tester » : le renard dit la phrase tout de suite, comme « Faire parler ». `flash` : le flinch d'une récompense qui choque.
  mode: Pick<FoxModeController, "say" | "flash">;
  // Le sound de la récompense, s'il en a un : le flinch part peu après son départ, la phrase quand il se termine.
  sounds: Pick<SoundQueue, "redeem">;
  phrases: Pick<RewardPhraseLibrary, "get">;
  // Un rachat est quelque chose qui se passe dans le live : le silence de la relance repart.
  jab: Pick<FoxJab, "noteActivity">;
  insults: InsultList;
  // Le titre est celui d'une récompense du renard (clash, wake) : son mécanisme reste celui des remerciements.
  isReserved: (title: string) => boolean;
  // Le titre est celui d'une récompense qui choque le renard (foxFlinchRewards) : elle n'est pas réservée, son sound et ses phrases restent.
  isFlinch: (title: string) => boolean;
  // Le délai (ms) entre le départ du sound et le flinch : lu à chaque rachat, 0 : en même temps.
  getFlinchDelay: () => number;
  // Programme `callback` dans `ms` ; rend de quoi l'annuler.
  schedule: (callback: () => void, ms: number) => () => void;
  random: () => number;
  log: (message: string) => void;
};

export type FoxReward = {
  // Un rachat : son sound se joue (la queue des sounds s'occupe des points), puis le renard dit une phrase de la récompense.
  // Sans sound, la phrase part tout de suite. La récompense d'un renard (clash, wake) n'a pas de phrase ici. Une récompense qui
  // choque le renard (flinch) le tourne vers Fenysk foxFlinchDelay après le départ de son sound, sans sound tout de suite,
  // avant la phrase.
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
  isFlinch,
  getFlinchDelay,
  schedule,
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

  // Caché ou occupé par un autre show, le renard ne montre rien : le journal ne le dit pas.
  const flinch = ({ title }: RewardEvent): void => {
    if (mode.flash(FLINCH_MODE) > 0)
      log(`Renard : récompense « ${title} », il se tourne vers Fenysk, choqué.`);
  };

  const flinchAfterDelay = (run: () => void): void => {
    const delay = getFlinchDelay();
    if (delay > 0) schedule(run, delay);
    else run();
  };

  return {
    redeem(redemption) {
      const list = isReserved(redemption.title) ? [] : phrases.get(redemption.rewardId);
      const afterSound = list.length > 0 ? () => say(redemption, list) : undefined;
      const flinchNow = isFlinch(redemption.title) ? () => flinch(redemption) : undefined;
      // Le délai est lu au départ du sound, pas au rachat : la queue peut avoir attendu.
      const onPlay = flinchNow && (() => flinchAfterDelay(flinchNow));
      if (sounds.redeem(redemption, afterSound, onPlay)) return;
      flinchNow?.();
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

import { toPhraseLines } from "../domain/phrase.rules";
import { toPhraseIssues } from "../domain/reward-phrase.rules";
import type { RewardPhrasesEntry, RewardPhrasesFile } from "../domain/reward-phrase.schema";
import type { RewardChoice } from "../domain/sound.schema";
import { type RewardPort, refuse, refuseReward, type SoundResult } from "./sound.usecase";

// Le disque vu du usecase : infra l'implémente (data/reward-phrases.json, écriture atomique). `update` peut lever.
export type RewardPhraseStore = {
  get(): RewardPhrasesFile;
  update(file: RewardPhrasesFile): void;
};

export type RewardPhraseLibrary = {
  // Les phrases d'une récompense, une liste vide si elle n'en a pas.
  get(rewardId: string): readonly string[];
  // Toutes les récompenses de la chaîne avec leurs phrases, puis celles qui ont disparu de Twitch et en gardent. Relit aussi le
  // titre de Twitch, que le fichier garde pour reconnaître une récompense disparue.
  list(): Promise<SoundResult<RewardPhrasesEntry[]>>;
  // Remplace les phrases d'une récompense (vide : les retire) ; rend celles qui sont gardées. Une phrase vide est écartée, une
  // variable inconnue refusée, comme la récompense d'un renard (clash, wake) : ses phrases se règlent dans l'onglet Renard.
  update(rewardId: string, phrases: readonly string[]): Promise<SoundResult<string[]>>;
};

export type RewardPhraseLibraryDeps = {
  store: RewardPhraseStore;
  rewards: Pick<RewardPort, "list">;
  // Le titre est celui d'une récompense du renard.
  isReserved: (title: string) => boolean;
  log: (message: string) => void;
};

const toMessage = (error: unknown): string => (error instanceof Error ? error.message : String(error));

// Par titre, puis par identifiant : l'ordre ne dépend ni de Twitch ni du fichier.
const byTitle = (a: RewardPhrasesEntry, b: RewardPhrasesEntry): number =>
  a.title.localeCompare(b.title, "fr") || a.id.localeCompare(b.id);

const toFileWithout = (file: RewardPhrasesFile, rewardId: string): RewardPhrasesFile =>
  Object.fromEntries(Object.entries(file).filter(([id]) => id !== rewardId));

export function createRewardPhraseLibrary({
  store,
  rewards,
  isReserved,
  log,
}: RewardPhraseLibraryDeps): RewardPhraseLibrary {
  let file = store.get();

  // Le disque d'abord, la mémoire ensuite : une panne de disque ne change rien.
  const write = (next: RewardPhrasesFile): void => {
    store.update(next);
    file = next;
  };

  const toEntry = (
    id: string,
    title: string,
    phrases: readonly string[],
    isMissing: boolean,
  ): RewardPhrasesEntry => ({ id, title, isMissing, isReserved: isReserved(title), phrases: [...phrases] });

  // Twitch a changé le titre d'une récompense qui a des phrases : le fichier le suit.
  const refreshTitles = (choices: readonly RewardChoice[]): void => {
    const next: RewardPhrasesFile = { ...file };
    let hasChanged = false;
    for (const { id, title } of choices) {
      const record = file[id];
      if (record && record.title !== title) {
        next[id] = { ...record, title };
        hasChanged = true;
      }
    }
    if (!hasChanged) return;
    try {
      write(next);
    } catch (error) {
      log(`Phrases des récompenses : titres de Twitch non relus (${toMessage(error)}).`);
    }
  };

  // Le titre de la récompense : celui que le fichier garde, sinon celui de Twitch (elle doit y exister encore).
  const getTitle = async (rewardId: string): Promise<SoundResult<string>> => {
    const known = file[rewardId];
    if (known) return { ok: true, value: known.title };
    const listed = await rewards.list();
    if (!listed.ok) return refuseReward(listed);
    const choice = listed.value.find(({ id }) => id === rewardId);
    return choice
      ? { ok: true, value: choice.title }
      : refuse(404, "", "cette récompense n'existe pas sur Twitch");
  };

  const save = (next: RewardPhrasesFile, phrases: string[], title: string): SoundResult<string[]> => {
    try {
      write(next);
    } catch (error) {
      return refuse(422, "phrases", `rien n'est enregistré : ${toMessage(error)}`);
    }
    const what = phrases.length > 0 ? `${phrases.length} phrase(s) enregistrée(s)` : "phrases retirées";
    log(`Récompense « ${title} » : ${what}.`);
    return { ok: true, value: phrases };
  };

  // Retirer les phrases ne demande rien à Twitch : la récompense a pu disparaître, ou Twitch être injoignable.
  const clear = (rewardId: string): SoundResult<string[]> => {
    const record = file[rewardId];
    return record ? save(toFileWithout(file, rewardId), [], record.title) : { ok: true, value: [] };
  };

  return {
    get: (rewardId) => file[rewardId]?.phrases ?? [],
    async list() {
      const listed = await rewards.list();
      if (!listed.ok) return refuseReward(listed);
      refreshTitles(listed.value);
      const known = new Set(listed.value.map(({ id }) => id));
      const onTwitch = listed.value.map(({ id, title }) =>
        toEntry(id, title, file[id]?.phrases ?? [], false),
      );
      const missing = Object.entries(file)
        .filter(([id]) => !known.has(id))
        .map(([id, { title, phrases }]) => toEntry(id, title, phrases, true));
      return { ok: true, value: [...onTwitch.sort(byTitle), ...missing.sort(byTitle)] };
    },
    async update(rewardId, input) {
      const phrases = toPhraseLines(input.join("\n"));
      const issues = toPhraseIssues(phrases).map((message) => ({ path: "phrases", message }));
      if (issues.length > 0) return { ok: false, status: 422, issues };
      if (phrases.length === 0) return clear(rewardId);
      const title = await getTitle(rewardId);
      if (!title.ok) return title;
      if (isReserved(title.value)) {
        return refuse(
          422,
          "phrases",
          "cette récompense est celle du renard : ses phrases se règlent dans l'onglet Renard",
        );
      }
      return save({ ...file, [rewardId]: { title: title.value, phrases } }, phrases, title.value);
    },
  };
}

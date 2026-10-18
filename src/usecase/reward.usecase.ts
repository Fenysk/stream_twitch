import { isRecordKept } from "../domain/reward.rules";
import type { RewardCreation, RewardRecord, RewardRecordsFile, RewardSummary } from "../domain/reward.schema";
import type { RewardChange, RewardChoice, RewardFields, RewardStatus } from "../domain/reward.types";
import { refuse, type SoundLibrary, type SoundResult } from "./sound.usecase";

// Le résultat d'un appel à Twitch : sa valeur, ou son refus. `status` : le code HTTP de Twitch (404 : il ne connaît pas ce
// reward), 401 quand la connexion n'est pas prête, 0 quand Twitch n'a pas répondu. Le message est en français et ne porte
// jamais un jeton.
export type RewardResult<Value> = { ok: true; value: Value } | { ok: false; status: number; message: string };

// Les rewards de Twitch vus du usecase : infra l'implémente (Helix, avec le jeton d'Alexis).
export type RewardPort = {
  // Les rewards de la chaîne, faits par l'app ou à la main (`isManageable` : l'app peut les gérer, elle les a créés).
  list(): Promise<RewardResult<RewardChoice[]>>;
  // Crée un reward qui ne saute pas la file de Twitch ; rend son identifiant.
  create(fields: RewardFields): Promise<RewardResult<string>>;
  update(rewardId: string, change: RewardChange): Promise<RewardResult<null>>;
  delete(rewardId: string): Promise<RewardResult<null>>;
  // Les identifiants des redemptions encore UNFULFILLED de ce reward.
  listPending(rewardId: string): Promise<RewardResult<string[]>>;
  settle(redemption: { id: string; rewardId: string }, status: RewardStatus): Promise<RewardResult<null>>;
};

// Le disque vu du usecase : infra l'implémente (data/rewards.json, écriture atomique). `update` peut lever.
export type RewardRecordStore = {
  get(): RewardRecordsFile;
  update(file: RewardRecordsFile): void;
};

export type RewardLibrary = {
  // Le reward `rewardId` tel que data/rewards.json le garde : son sound et si l'app le gère. Rien s'il n'y est pas.
  getRecord(rewardId: string): RewardRecord | undefined;
  // Les titres des rewards qui désignent ce sound.
  listTitlesOf(soundId: string): string[];
  // Les rewards de la chaîne (Twitch, joint à data/rewards.json), puis ceux qui n'existent plus sur Twitch. Relit aussi, depuis
  // Twitch, le titre que le fichier garde pour reconnaître un reward disparu.
  list(): Promise<SoundResult<RewardSummary[]>>;
  // Crée le reward sur Twitch d'abord, puis son enregistrement : si le disque échoue, le reward part de Twitch.
  create(draft: RewardCreation): Promise<SoundResult<RewardSummary>>;
  // Modifie un reward que l'app gère (titre, coût, pace) sur Twitch ; refuse celui qu'Alexis a fait sur Twitch.
  update(rewardId: string, fields: RewardFields): Promise<SoundResult<RewardSummary>>;
  // Supprime un reward que l'app gère : la queue rend d'abord les points de ses rachats en attente, puis Twitch le supprime, puis
  // son enregistrement et ses phrases partent. Son sound reste.
  delete(rewardId: string): Promise<SoundResult<undefined>>;
  // Choisit le sound d'un reward (`null` : aucun) sans rien écrire sur Twitch. Un reward sans enregistrement doit exister sur
  // Twitch : l'app le gère alors s'il est de ceux qu'elle a créés.
  updateSound(rewardId: string, sound: string | null): Promise<SoundResult<string | null>>;
  // Le sound est supprimé : les rewards qui le désignent n'en ont plus (leur enregistrement part s'ils ne sont pas gérés). Lève
  // si le disque échoue.
  detachSound(soundId: string): void;
  // Au démarrage du stream : les rewards que l'app gère sortent de pause et les redemptions restées UNFULFILLED sont remboursées.
  // Une seule fois par démarrage, une fois Twitch joint : se reconnecter en plein stream ne rembourse pas ce que la queue est en
  // train de jouer. Twitch injoignable (pas de connexion, pas de réponse) : le prochain appel recommence.
  openRewards(): Promise<void>;
  // À l'arrêt : les rewards que l'app gère se mettent en pause, les viewers ne peuvent plus dépenser leurs points.
  pauseRewards(): Promise<void>;
};

export type RewardLibraryDeps = {
  store: RewardRecordStore;
  twitch: RewardPort;
  // Un reward ne désigne qu'un sound qui existe.
  sounds: Pick<SoundLibrary, "get">;
  // Avant la suppression d'un reward : la queue rend les points de ses redemptions en attente (Twitch les marquerait FULFILLED).
  onDelete?: (rewardId: string) => Promise<void>;
  // Après la suppression d'un reward : ses phrases de Jean-Renard partent.
  clearPhrases?: (rewardId: string) => Promise<void>;
  log: (message: string) => void;
};

// Twitch muet ou en panne : 502 ; un refus de Twitch : 422.
export const refuseReward = ({
  status,
  message,
}: {
  status: number;
  message: string;
}): SoundResult<never> => ({
  ok: false,
  status: status === 0 || status >= 500 ? 502 : 422,
  issues: [{ path: "", message }],
});

const NOT_ON_TWITCH = "cette récompense n'existe pas sur Twitch";
const NO_SOUND = "ce son n'existe pas";
// Twitch n'a pas répondu, ou la connexion n'est pas prête : rien ne sert d'insister reward après reward.
const isUnreachable = (status: number): boolean => status === 0 || status === 401;

const toMessage = (error: unknown): string => (error instanceof Error ? error.message : String(error));

// Par titre, puis par identifiant : l'ordre ne dépend ni de Twitch ni du fichier.
const byTitle = (a: { id: string; title: string }, b: { id: string; title: string }): number =>
  a.title.localeCompare(b.title, "fr") || a.id.localeCompare(b.id);

const toNotManaged = (what: string): SoundResult<never> =>
  refuse(422, "", `cette récompense a été faite sur Twitch : ${what}`);

export function createRewardLibrary({
  store,
  twitch,
  sounds,
  onDelete,
  clearPhrases,
  log,
}: RewardLibraryDeps): RewardLibrary {
  let file = store.get();
  let areRewardsOpen = false;

  // Le disque d'abord, la mémoire ensuite : une panne de disque ne change rien.
  const write = (next: RewardRecordsFile): void => {
    store.update(next);
    file = next;
  };

  const toFileWithout = (rewardId: string): RewardRecordsFile =>
    Object.fromEntries(Object.entries(file).filter(([id]) => id !== rewardId));

  // Les rewards que l'app gère, par titre : ce sont les seuls qu'elle met en pause et rembourse.
  const listManaged = (): { id: string; title: string }[] =>
    Object.entries(file)
      .filter(([, record]) => record.isManaged)
      .map(([id, { title }]) => ({ id, title }))
      .sort(byTitle);

  // Le sound du reward, `null` s'il n'en a pas ou si son dossier a disparu.
  const toSound = (record: RewardRecord | undefined): string | null => {
    const sound = record?.sound ?? null;
    return sound !== null && sounds.get(sound) ? sound : null;
  };

  const toSummary = (choice: RewardChoice): RewardSummary => {
    const record = file[choice.id];
    const { id, title, cost, pace } = choice;
    return {
      id,
      title,
      cost,
      pace,
      isManaged: record?.isManaged ?? false,
      isMissing: false,
      sound: toSound(record),
    };
  };

  // Un reward qui n'existe plus sur Twitch : seul son enregistrement le montre, son coût et sa pace ne sont plus connus.
  const toMissing = (id: string, record: RewardRecord): RewardSummary => ({
    id,
    title: record.title,
    cost: 0,
    pace: 0,
    isManaged: record.isManaged,
    isMissing: true,
    sound: toSound(record),
  });

  // Twitch a changé le titre d'un reward qui a un enregistrement : le fichier le suit.
  const refreshTitles = (choices: readonly RewardChoice[]): void => {
    const next: RewardRecordsFile = { ...file };
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
      log(`Récompenses : titres de Twitch non relus (${toMessage(error)}).`);
    }
  };

  // Le reward d'un enregistrement dont le titre vient de changer sur Twitch : le titre se relit à la prochaine liste si le disque échoue.
  const keepTitle = (rewardId: string, record: RewardRecord, title: string): void => {
    if (record.title === title) return;
    try {
      write({ ...file, [rewardId]: { ...record, title } });
    } catch (error) {
      log(`Récompense « ${title} » : titre non gardé (${toMessage(error)}).`);
    }
  };

  // Le reward d'un sound qu'on n'a pas pu enregistrer part de Twitch : sans cela il resterait, sans que l'app le sache.
  const undoReward = async (rewardId: string, title: string): Promise<void> => {
    const undone = await twitch.delete(rewardId);
    if (!undone.ok) log(`Récompense « ${title} » : n'a pas pu être retirée de Twitch (${undone.message}).`);
  };

  // L'enregistrement d'un reward qui n'en a pas encore : Twitch doit le connaître. L'app le gère s'il est de ceux qu'elle a créés.
  const createRecord = async (rewardId: string): Promise<SoundResult<RewardRecord>> => {
    const listed = await twitch.list();
    if (!listed.ok) return refuseReward(listed);
    const choice = listed.value.find(({ id }) => id === rewardId);
    if (!choice) return refuse(404, "", NOT_ON_TWITCH);
    return { ok: true, value: { title: choice.title, sound: null, isManaged: choice.isManageable } };
  };

  // L'enregistrement d'un reward : celui que rewards.json garde, ou celui que Twitch lui donnerait.
  const getRecordOf = async (rewardId: string): Promise<SoundResult<RewardRecord>> => {
    const known = file[rewardId];
    return known ? { ok: true, value: known } : createRecord(rewardId);
  };

  // Garde l'enregistrement d'un reward ; il part du fichier s'il n'a plus de raison d'y être.
  const keepRecord = (rewardId: string, next: RewardRecord): SoundResult<RewardRecord> => {
    try {
      write(isRecordKept(next) ? { ...file, [rewardId]: next } : toFileWithout(rewardId));
    } catch (error) {
      return refuse(422, "sound", `rien n'est enregistré : ${toMessage(error)}`);
    }
    return { ok: true, value: next };
  };

  const refundPending = async (title: string, rewardId: string): Promise<void> => {
    const pending = await twitch.listPending(rewardId);
    if (!pending.ok) {
      log(`Récompense « ${title} » : rachats en attente illisibles (${pending.message}).`);
      return;
    }
    for (const id of pending.value) {
      const canceled = await twitch.settle({ id, rewardId }, "CANCELED");
      if (!canceled.ok) log(`Récompense « ${title} » : points non rendus (${canceled.message}).`);
    }
    if (pending.value.length > 0) {
      log(`Récompense « ${title} » : ${pending.value.length} rachat(s) en attente remboursé(s).`);
    }
  };

  // Un reward sort de pause et ses rachats en attente sont remboursés ; faux quand Twitch n'est pas joignable.
  const resumeReward = async (title: string, rewardId: string): Promise<boolean> => {
    const resumed = await twitch.update(rewardId, { isPaused: false });
    if (resumed.ok) {
      await refundPending(title, rewardId);
      return true;
    }
    log(`Récompense « ${title} » : pas remise en route (${resumed.message}).`);
    return !isUnreachable(resumed.status);
  };

  return {
    getRecord: (rewardId) => file[rewardId],
    listTitlesOf: (soundId) =>
      Object.values(file)
        .filter(({ sound }) => sound === soundId)
        .map(({ title }) => title)
        .sort((a, b) => a.localeCompare(b, "fr")),
    async list() {
      const listed = await twitch.list();
      if (!listed.ok) return refuseReward(listed);
      refreshTitles(listed.value);
      const known = new Set(listed.value.map(({ id }) => id));
      const onTwitch = listed.value.map(toSummary).sort(byTitle);
      const missing = Object.entries(file)
        .filter(([id]) => !known.has(id))
        .map(([id, record]) => toMissing(id, record))
        .sort(byTitle);
      return { ok: true, value: [...onTwitch, ...missing] };
    },
    async create({ title, cost, pace, sound }) {
      if (sound !== null && !sounds.get(sound)) return refuse(422, "sound", NO_SOUND);
      const created = await twitch.create({ title, cost, pace });
      if (!created.ok) return refuseReward(created);
      const id = created.value;
      try {
        write({ ...file, [id]: { title, sound, isManaged: true } });
      } catch (error) {
        await undoReward(id, title);
        return refuse(422, "", `rien n'est enregistré : ${toMessage(error)}`);
      }
      log(`Récompense « ${title} » créée sur Twitch (${id}).`);
      return { ok: true, value: { id, title, cost, pace, isManaged: true, isMissing: false, sound } };
    },
    async update(rewardId, fields) {
      const record = file[rewardId];
      if (!record?.isManaged) return toNotManaged("elle se modifie là-bas.");
      const updated = await twitch.update(rewardId, fields);
      if (!updated.ok) return refuseReward(updated);
      keepTitle(rewardId, record, fields.title);
      log(`Récompense « ${fields.title} » mise à jour sur Twitch (${rewardId}).`);
      const { title, cost, pace } = fields;
      return {
        ok: true,
        value: { id: rewardId, title, cost, pace, isManaged: true, isMissing: false, sound: toSound(record) },
      };
    },
    async delete(rewardId) {
      const record = file[rewardId];
      if (!record?.isManaged) return toNotManaged("elle se supprime là-bas.");
      await onDelete?.(rewardId);
      const deleted = await twitch.delete(rewardId);
      if (!deleted.ok && deleted.status !== 404) return refuseReward(deleted);
      try {
        write(toFileWithout(rewardId));
      } catch (error) {
        return refuse(
          422,
          "",
          `la récompense est supprimée de Twitch, mais pas de l'app : ${toMessage(error)}`,
        );
      }
      await clearPhrases?.(rewardId);
      log(`Récompense « ${record.title} » supprimée (${rewardId}).`);
      return { ok: true, value: undefined };
    },
    async updateSound(rewardId, sound) {
      if (sound !== null && !sounds.get(sound)) return refuse(422, "sound", NO_SOUND);
      if (!file[rewardId] && sound === null) return { ok: true, value: null };
      const base = await getRecordOf(rewardId);
      if (!base.ok) return base;
      const kept = keepRecord(rewardId, { ...base.value, sound });
      if (!kept.ok) return kept;
      log(`Récompense « ${kept.value.title} » : ${sound === null ? "plus de son" : `son ${sound}`}.`);
      return { ok: true, value: sound };
    },
    detachSound(soundId) {
      const holders = Object.entries(file).filter(([, record]) => record.sound === soundId);
      if (holders.length === 0) return;
      const next = { ...file };
      for (const [id, record] of holders) {
        const detached = { ...record, sound: null };
        if (isRecordKept(detached)) next[id] = detached;
        else delete next[id];
      }
      write(next);
      log(`Son ${soundId} supprimé : ${holders.length} récompense(s) n'ont plus de son.`);
    },
    async openRewards() {
      if (areRewardsOpen) return;
      for (const { id, title } of listManaged()) {
        if (!(await resumeReward(title, id))) return;
      }
      areRewardsOpen = true;
    },
    async pauseRewards() {
      areRewardsOpen = false;
      await Promise.all(
        listManaged().map(async ({ id, title }) => {
          const paused = await twitch.update(id, { isPaused: true });
          if (!paused.ok) log(`Récompense « ${title} » : pas mise en pause (${paused.message}).`);
        }),
      );
    },
  };
}

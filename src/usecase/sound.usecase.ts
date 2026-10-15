import type { RewardChange, RewardFields, RewardStatus } from "../domain/reward.types";
import { AUDIO_MIME, isTitleTaken, toAudioFile } from "../domain/sound.rules";
import type {
  RewardChoice,
  RewardChoices,
  SoundFields,
  SoundFile,
  SoundIssue,
  SoundSummary,
} from "../domain/sound.schema";

// Un son gardé : ses réglages, le format de son fichier, son reward et sa version (elle change à chaque écriture).
export type StoredSound = SoundFile & { id: string; version: string };

// Le disque vu du usecase : infra l'implémente (data/sounds/<id>/, écritures atomiques). Les écritures peuvent lever.
// `update` sans fichier garde l'ancien.
export type SoundStore = {
  list(): StoredSound[];
  get(id: string): StoredSound | undefined;
  getFile(id: string): Uint8Array | undefined;
  create(id: string, sound: SoundFile, file: Uint8Array): StoredSound;
  update(id: string, sound: SoundFile, file: Uint8Array | undefined): StoredSound;
  delete(id: string): void;
};

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

// Les réglages d'un son et son fichier audio ; le fichier manque à la modification quand on garde l'ancien. `rewardId` (à la
// création) : relier le son à ce reward déjà fait sur Twitch, dont le titre, le coût et la pace remplacent ceux du brouillon.
export type SoundDraft = SoundFields & { file?: Uint8Array; rewardId?: string };

export type SoundResult<Value> =
  | { ok: true; value: Value }
  | { ok: false; status: 404 | 422 | 502; issues: SoundIssue[] };

export type SoundAudio = { bytes: Uint8Array; mime: string };

export type SoundLibrary = {
  list(): SoundSummary[];
  get(id: string): SoundSummary | undefined;
  // Le son dont c'est le reward : celui qu'un rachat doit jouer.
  getByReward(rewardId: string): SoundSummary | undefined;
  getAudio(id: string): SoundAudio | undefined;
  // Les rewards de la chaîne qui n'ont pas de son, et les sons dont le reward a disparu de Twitch. Relit aussi, depuis Twitch,
  // le titre, le coût et la pace des sons reliés à un reward que l'app ne gère pas.
  listRewards(): Promise<SoundResult<RewardChoices>>;
  // Créer, modifier et supprimer un son le font aussi sur Twitch, d'abord : un refus de Twitch ne laisse rien de gardé. Un son
  // relié à un reward que l'app ne gère pas n'y touche jamais : seuls son fichier et son fader changent, et supprimer le son
  // laisse le reward.
  create(draft: SoundDraft): Promise<SoundResult<SoundSummary>>;
  update(id: string, draft: SoundDraft): Promise<SoundResult<SoundSummary>>;
  delete(id: string): Promise<SoundResult<undefined>>;
  // Au démarrage du stream : les rewards sortent de pause et les redemptions restées UNFULFILLED sont remboursées. Une seule
  // fois par démarrage, une fois Twitch joint : se reconnecter en plein stream ne rembourse pas ce que la queue est en train
  // de jouer. Twitch injoignable (pas de connexion, pas de réponse) : le prochain appel recommence.
  openRewards(): Promise<void>;
  // À l'arrêt : les rewards se mettent en pause, les viewers ne peuvent plus dépenser leurs points.
  pauseRewards(): Promise<void>;
};

export type SoundLibraryDeps = {
  store: SoundStore;
  rewards: RewardPort;
  createId: () => string;
  // Avant la suppression d'un son : la queue rend les points de ses redemptions en attente (Twitch les marquerait FULFILLED).
  onDelete?: (id: string) => Promise<void>;
  log: (message: string) => void;
};

const toSummary = ({
  id,
  title,
  cost,
  pace,
  fader,
  version,
  rewardId,
  isManaged,
}: StoredSound): SoundSummary => ({
  id,
  title,
  cost,
  pace,
  fader,
  version,
  hasReward: rewardId !== null,
  isManaged,
});

export const refuse = (status: 404 | 422, path: string, message: string): SoundResult<never> => ({
  ok: false,
  status,
  issues: [{ path, message }],
});

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

const NOT_FOUND = "son introuvable";
// Twitch n'a pas répondu, ou la connexion n'est pas prête : rien ne sert d'insister reward après reward.
const isUnreachable = (status: number): boolean => status === 0 || status === 401;

const toMessage = (error: unknown): string => (error instanceof Error ? error.message : String(error));

export function createSoundLibrary({
  store,
  rewards,
  createId,
  onDelete,
  log,
}: SoundLibraryDeps): SoundLibrary {
  let areRewardsOpen = false;
  // Par titre, puis par identifiant : copier data/ (un autre PC, un nouveau worktree) ne garde pas les dates de création.
  const listStored = (): StoredSound[] =>
    [...store.list()].sort((a, b) => a.title.localeCompare(b.title, "fr") || a.id.localeCompare(b.id));

  const getTitlesExcept = (id: string | undefined): string[] =>
    store
      .list()
      .filter((sound) => sound.id !== id)
      .map(({ title }) => title);

  // Les refus d'un brouillon : un titre pris, un fichier qui n'est pas de l'audio. `format` : celui du nouveau fichier.
  const toDraftRefusal = (
    draft: SoundDraft,
    id: string | undefined,
  ): { format: SoundFile["format"] | undefined; issues: SoundIssue[] } => {
    const issues: SoundIssue[] = [];
    if (isTitleTaken(draft.title, getTitlesExcept(id))) {
      issues.push({ path: "title", message: "un autre son porte déjà ce titre" });
    }
    if (!draft.file) {
      if (id === undefined) issues.push({ path: "file", message: "le fichier audio manque" });
      return { format: undefined, issues };
    }
    const audio = toAudioFile(draft.file);
    if (!audio.ok) issues.push({ path: "file", message: audio.message });
    return { format: audio.ok ? audio.format : undefined, issues };
  };

  // Un son modifié garde son reward ; le reward suit le titre, le coût et la pace s'ils changent. Un reward que Twitch ne
  // connaît plus (supprimé à la main) est recréé ; un son sans reward en reçoit un. Un reward que l'app ne gère pas n'est jamais
  // touché.
  const syncReward = async (
    current: StoredSound,
    fields: RewardFields,
  ): Promise<RewardResult<string | null>> => {
    const { rewardId } = current;
    if (!current.isManaged) return { ok: true, value: rewardId };
    if (rewardId === null) return rewards.create(fields);
    if (current.title === fields.title && current.cost === fields.cost && current.pace === fields.pace) {
      return { ok: true, value: rewardId };
    }
    const updated = await rewards.update(rewardId, fields);
    if (updated.ok) return { ok: true, value: rewardId };
    if (updated.status !== 404) return updated;
    log(`Son « ${current.title} » : sa récompense a disparu de Twitch, elle est recréée.`);
    return rewards.create(fields);
  };

  // Le reward déjà fait sur Twitch auquel on relie un son : il doit exister encore, et n'avoir pas de son.
  const getChoice = async (rewardId: string): Promise<SoundResult<RewardChoice>> => {
    const listed = await rewards.list();
    if (!listed.ok) return refuseReward(listed);
    const choice = listed.value.find(({ id }) => id === rewardId);
    if (!choice) return refuse(422, "rewardId", "cette récompense n'existe plus sur Twitch");
    if (store.list().some((sound) => sound.rewardId === rewardId)) {
      return refuse(422, "rewardId", "cette récompense a déjà un son");
    }
    return { ok: true, value: choice };
  };

  // Garde un son neuf (son reward existe déjà chez Twitch) ; si le disque échoue, `undo` retire le reward qu'on vient de créer.
  const createStored = async (
    sound: SoundFile,
    file: Uint8Array,
    undo: (() => Promise<void>) | undefined,
  ): Promise<SoundResult<SoundSummary>> => {
    const id = createId();
    try {
      const stored = store.create(id, sound, file);
      const reward = sound.isManaged ? "sa récompense existe sur Twitch" : "relié à une récompense de Twitch";
      log(`Son « ${stored.title} » créé (${id}), ${reward}.`);
      return { ok: true, value: toSummary(stored) };
    } catch (error) {
      await undo?.();
      return refuse(422, "", `rien n'est enregistré : ${toMessage(error)}`);
    }
  };

  // Un son avec un reward neuf : Twitch le crée d'abord, le disque ensuite.
  const createOwn = async (draft: SoundDraft): Promise<SoundResult<SoundSummary>> => {
    const { format, issues } = toDraftRefusal(draft, undefined);
    if (issues.length > 0 || !format || !draft.file) return { ok: false, status: 422, issues };
    const { title, cost, pace, fader } = draft;
    const reward = await rewards.create({ title, cost, pace });
    if (!reward.ok) return refuseReward(reward);
    const sound = { title, cost, pace, fader, format, rewardId: reward.value, isManaged: true };
    return createStored(sound, draft.file, () => undoReward(reward.value, title));
  };

  // Un son relié à un reward de Twitch : son titre, son coût et sa pace sont ceux de Twitch, pas ceux du formulaire. Si l'app
  // a créé ce reward, elle le gère ; sinon elle ne fait que le lire.
  const createLinked = async (
    draft: SoundDraft,
    choice: RewardChoice,
  ): Promise<SoundResult<SoundSummary>> => {
    const { title, cost, pace } = choice;
    const { format, issues } = toDraftRefusal({ ...draft, title, cost, pace }, undefined);
    if (issues.length > 0 || !format || !draft.file) return { ok: false, status: 422, issues };
    const sound = {
      title,
      cost,
      pace,
      fader: draft.fader,
      format,
      rewardId: choice.id,
      isManaged: choice.isManageable,
    };
    return createStored(sound, draft.file, undefined);
  };

  // Un son relié à un reward que l'app ne gère pas lit sur Twitch son titre, son coût et sa pace : le reste de l'état est
  // relu à chaque liste (les titres de Twitch changent sans l'app).
  const refreshFields = (sound: StoredSound, choice: RewardChoice): void => {
    const { title, cost, pace } = choice;
    if (sound.isManaged || (sound.title === title && sound.cost === cost && sound.pace === pace)) return;
    const { fader, format, rewardId, isManaged } = sound;
    try {
      store.update(sound.id, { title, cost, pace, fader, format, rewardId, isManaged }, undefined);
    } catch (error) {
      log(`Son « ${sound.title} » : titre, coût et pace de Twitch non relus (${toMessage(error)}).`);
    }
  };

  // Un son qu'on supprime : la queue rend d'abord les points de ses rachats en attente, puis son reward part de Twitch. Un
  // reward que l'app ne gère pas reste sur Twitch : elle n'a pas le droit de le supprimer (rien n'est rendu non plus).
  const deleteRewardOf = async (sound: StoredSound): Promise<RewardResult<null> | undefined> => {
    if (sound.rewardId === null) return undefined;
    await onDelete?.(sound.id);
    return sound.isManaged ? rewards.delete(sound.rewardId) : undefined;
  };

  // Le reward d'un son qu'on n'a pas pu garder part de Twitch : sans cela il resterait, sans son.
  const undoReward = async (rewardId: string, title: string): Promise<void> => {
    const undone = await rewards.delete(rewardId);
    if (!undone.ok)
      log(`Son « ${title} » : sa récompense Twitch n'a pas pu être retirée (${undone.message}).`);
  };

  const refundPending = async (sound: StoredSound, rewardId: string): Promise<void> => {
    const pending = await rewards.listPending(rewardId);
    if (!pending.ok) {
      log(`Récompense de « ${sound.title} » : rachats en attente illisibles (${pending.message}).`);
      return;
    }
    for (const id of pending.value) {
      const canceled = await rewards.settle({ id, rewardId }, "CANCELED");
      if (!canceled.ok) log(`Récompense de « ${sound.title} » : points non rendus (${canceled.message}).`);
    }
    if (pending.value.length > 0) {
      log(`Récompense de « ${sound.title} » : ${pending.value.length} rachat(s) en attente remboursé(s).`);
    }
  };

  // Un reward sort de pause et ses rachats en attente sont remboursés ; faux quand Twitch n'est pas joignable.
  const resumeReward = async (sound: StoredSound, rewardId: string): Promise<boolean> => {
    const resumed = await rewards.update(rewardId, { isPaused: false });
    if (resumed.ok) {
      await refundPending(sound, rewardId);
      return true;
    }
    log(`Récompense de « ${sound.title} » : pas remise en route (${resumed.message}).`);
    return !isUnreachable(resumed.status);
  };

  return {
    list: () => listStored().map(toSummary),
    get(id) {
      const stored = store.get(id);
      return stored && toSummary(stored);
    },
    getByReward(rewardId) {
      const stored = store.list().find((sound) => sound.rewardId === rewardId);
      return stored && toSummary(stored);
    },
    getAudio(id) {
      const stored = store.get(id);
      const bytes = stored && store.getFile(id);
      return stored && bytes ? { bytes, mime: AUDIO_MIME[stored.format] } : undefined;
    },
    async listRewards() {
      const listed = await rewards.list();
      if (!listed.ok) return refuseReward(listed);
      const known = new Map(listed.value.map((choice) => [choice.id, choice]));
      const linked = store.list().filter(({ rewardId }) => rewardId !== null);
      const missing: string[] = [];
      for (const sound of linked) {
        const choice = sound.rewardId === null ? undefined : known.get(sound.rewardId);
        if (choice) refreshFields(sound, choice);
        else missing.push(sound.id);
      }
      const taken = new Set(linked.map(({ rewardId }) => rewardId));
      return { ok: true, value: { choices: listed.value.filter(({ id }) => !taken.has(id)), missing } };
    },
    async create(draft) {
      if (draft.rewardId === undefined) return createOwn(draft);
      const linked = await getChoice(draft.rewardId);
      return linked.ok ? createLinked(draft, linked.value) : linked;
    },
    async update(id, draft) {
      const current = store.get(id);
      if (!current) return refuse(404, "", NOT_FOUND);
      // Un reward que l'app ne gère pas garde ses titre, coût et pace : seuls le fichier et le fader changent.
      const fields = current.isManaged
        ? draft
        : { ...draft, title: current.title, cost: current.cost, pace: current.pace };
      const { format, issues } = toDraftRefusal(fields, id);
      if (issues.length > 0) return { ok: false, status: 422, issues };
      const { title, cost, pace, fader } = fields;
      const reward = await syncReward(current, { title, cost, pace });
      if (!reward.ok) return refuseReward(reward);
      try {
        const sound = {
          title,
          cost,
          pace,
          fader,
          format: format ?? current.format,
          rewardId: reward.value,
          isManaged: current.isManaged,
        };
        const stored = store.update(id, sound, draft.file);
        log(`Son « ${stored.title} » mis à jour (${id}).`);
        return { ok: true, value: toSummary(stored) };
      } catch (error) {
        return refuse(
          422,
          "",
          `rien n'est enregistré ici (la récompense Twitch a peut-être changé) : ${toMessage(error)}`,
        );
      }
    },
    async delete(id) {
      const current = store.get(id);
      if (!current) return refuse(404, "", NOT_FOUND);
      const removed = await deleteRewardOf(current);
      if (removed && !removed.ok && removed.status !== 404) return refuseReward(removed);
      try {
        store.delete(id);
      } catch (error) {
        return refuse(422, "", `rien n'est supprimé : ${toMessage(error)}`);
      }
      log(`Son « ${current.title} » supprimé (${id}).`);
      return { ok: true, value: undefined };
    },
    async openRewards() {
      if (areRewardsOpen) return;
      for (const sound of listStored()) {
        // Seuls les rewards que l'app gère sortent de pause : celle des autres, elle n'y a pas droit.
        if (sound.rewardId === null || !sound.isManaged) continue;
        if (!(await resumeReward(sound, sound.rewardId))) return;
      }
      areRewardsOpen = true;
    },
    async pauseRewards() {
      areRewardsOpen = false;
      await Promise.all(
        listStored().map(async ({ title, rewardId, isManaged }) => {
          if (rewardId === null || !isManaged) return;
          const paused = await rewards.update(rewardId, { isPaused: true });
          if (!paused.ok) log(`Récompense de « ${title} » : pas mise en pause (${paused.message}).`);
        }),
      );
    },
  };
}

import { AUDIO_MIME, isTitleTaken, toAudioFile } from "../domain/sound.rules";
import type { SoundFields, SoundFile, SoundIssue, SoundSummary } from "../domain/sound.schema";

// Un sound gardé : ses réglages, le format de son fichier et sa version (elle change à chaque écriture).
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

// Les réglages d'un sound et son fichier audio ; le fichier manque à la modification quand on garde l'ancien.
export type SoundDraft = SoundFields & { file?: Uint8Array };

export type SoundResult<Value> =
  | { ok: true; value: Value }
  | { ok: false; status: 404 | 422 | 502; issues: SoundIssue[] };

export type SoundAudio = { bytes: Uint8Array; mime: string };

// Ce qu'il faut pour jouer un sound : la queue et l'émission n'ont pas besoin de savoir qui l'utilise.
export type PlayableSound = Pick<SoundSummary, "id" | "title" | "fader" | "version">;

export type SoundLibrary = {
  // Les sounds, avec qui les utilise.
  list(): SoundSummary[];
  get(id: string): PlayableSound | undefined;
  getAudio(id: string): SoundAudio | undefined;
  // Un sound ne touche pas à Twitch : le créer, le modifier ou le supprimer laisse tous les rewards où ils sont.
  create(draft: SoundDraft): SoundResult<SoundSummary>;
  update(id: string, draft: SoundDraft): SoundResult<SoundSummary>;
  // Supprimer : la queue rend d'abord les points des rachats en attente de ce sound, puis les rewards qui le désignent n'en ont plus.
  delete(id: string): Promise<SoundResult<undefined>>;
};

export type SoundLibraryDeps = {
  store: SoundStore;
  createId: () => string;
  // Qui utilise un sound : les titres des rewards qui le désignent, et les clips confirmés qui ont un de ses rires (par sound ;
  // `undefined` quand le dossier des clips est illisible : le nombre n'est alors pas inventé).
  usage: {
    listRewardTitles(soundId: string): string[];
    listClipCounts(): ReadonlyMap<string, number> | undefined;
  };
  // Avant la suppression d'un sound : la queue rend les points de ses redemptions en attente (Twitch les marquerait FULFILLED),
  // puis les rewards qui le désignent le lâchent. Lève si le disque échoue : rien n'est alors supprimé.
  onDelete?: (id: string) => Promise<void>;
  log: (message: string) => void;
};

export const refuse = (status: 404 | 422, path: string, message: string): SoundResult<never> => ({
  ok: false,
  status,
  issues: [{ path, message }],
});

const NOT_FOUND = "son introuvable";

const toMessage = (error: unknown): string => (error instanceof Error ? error.message : String(error));

export function createSoundLibrary({
  store,
  createId,
  usage,
  onDelete,
  log,
}: SoundLibraryDeps): SoundLibrary {
  // Par titre, puis par identifiant : copier data/ (un autre PC, un nouveau worktree) ne garde pas les dates de création.
  const listStored = (): StoredSound[] =>
    [...store.list()].sort((a, b) => a.title.localeCompare(b.title, "fr") || a.id.localeCompare(b.id));

  const toPlayable = ({ id, title, fader, version }: StoredSound): PlayableSound => ({
    id,
    title,
    fader,
    version,
  });

  const toSummary = (
    stored: StoredSound,
    clipCounts: ReadonlyMap<string, number> | undefined,
  ): SoundSummary => ({
    ...toPlayable(stored),
    rewardTitles: usage.listRewardTitles(stored.id),
    clipCount: clipCounts === undefined ? null : (clipCounts.get(stored.id) ?? 0),
  });

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

  return {
    list() {
      const clipCounts = usage.listClipCounts();
      return listStored().map((stored) => toSummary(stored, clipCounts));
    },
    get(id) {
      const stored = store.get(id);
      return stored && toPlayable(stored);
    },
    getAudio(id) {
      const stored = store.get(id);
      const bytes = stored && store.getFile(id);
      return stored && bytes ? { bytes, mime: AUDIO_MIME[stored.format] } : undefined;
    },
    create(draft) {
      const { format, issues } = toDraftRefusal(draft, undefined);
      if (issues.length > 0 || !format || !draft.file) return { ok: false, status: 422, issues };
      const { title, fader } = draft;
      const id = createId();
      try {
        const stored = store.create(id, { title, fader, format }, draft.file);
        log(`Son « ${stored.title} » créé (${id}).`);
        return { ok: true, value: toSummary(stored, usage.listClipCounts()) };
      } catch (error) {
        return refuse(422, "", `rien n'est enregistré : ${toMessage(error)}`);
      }
    },
    update(id, draft) {
      const current = store.get(id);
      if (!current) return refuse(404, "", NOT_FOUND);
      const { format, issues } = toDraftRefusal(draft, id);
      if (issues.length > 0) return { ok: false, status: 422, issues };
      const { title, fader } = draft;
      try {
        const stored = store.update(id, { title, fader, format: format ?? current.format }, draft.file);
        log(`Son « ${stored.title} » mis à jour (${id}).`);
        return { ok: true, value: toSummary(stored, usage.listClipCounts()) };
      } catch (error) {
        return refuse(422, "", `rien n'est enregistré : ${toMessage(error)}`);
      }
    },
    async delete(id) {
      const current = store.get(id);
      if (!current) return refuse(404, "", NOT_FOUND);
      try {
        await onDelete?.(id);
        store.delete(id);
      } catch (error) {
        return refuse(422, "", `rien n'est supprimé : ${toMessage(error)}`);
      }
      log(`Son « ${current.title} » supprimé (${id}).`);
      return { ok: true, value: undefined };
    },
  };
}

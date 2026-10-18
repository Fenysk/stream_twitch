import { describe, expect, it } from "vitest";
import type { RewardRecordsFile } from "../domain/reward.schema";
import type { RewardChoice } from "../domain/reward.types";
import type { SoundFile } from "../domain/sound.schema";
import {
  createRewardLibrary,
  type RewardPort,
  type RewardRecordStore,
  type RewardResult,
} from "./reward.usecase";
import { createSoundLibrary, type SoundDraft, type SoundStore, type StoredSound } from "./sound.usecase";

const ascii = (text: string): number[] => Array.from(text).map((character) => character.charCodeAt(0));
const wav = (): Uint8Array =>
  Uint8Array.from([...ascii("RIFF"), 0, 0, 0, 0, ...ascii("WAVE"), ...new Array(40).fill(1)]);
const ogg = (): Uint8Array => Uint8Array.from([...ascii("OggS"), 0, 2, ...new Array(30).fill(2)]);

// Un faux disque : il garde ce qu'on lui écrit, et donne une version qui change à chaque écriture.
const createFakeStore = () => {
  const entries = new Map<string, { sound: SoundFile; file: Uint8Array; version: number }>();
  let versions = 0;
  let failure: Error | undefined;
  const toStored = (id: string): StoredSound | undefined => {
    const entry = entries.get(id);
    return entry && { id, ...entry.sound, version: String(entry.version) };
  };
  const write = (id: string, sound: SoundFile, file: Uint8Array | undefined): StoredSound => {
    if (failure) throw failure;
    versions += 1;
    const kept = entries.get(id)?.file;
    const bytes = file ?? kept;
    if (!bytes) throw new Error("aucun fichier");
    entries.set(id, { sound, file: bytes, version: versions });
    const stored = toStored(id);
    if (!stored) throw new Error("relecture impossible");
    return stored;
  };
  const store: SoundStore = {
    list: () => [...entries.keys()].flatMap((id) => toStored(id) ?? []),
    get: toStored,
    getFile: (id) => entries.get(id)?.file,
    create: (id, sound, file) => write(id, sound, file),
    update: (id, sound, file) => write(id, sound, file),
    delete(id) {
      if (failure) throw failure;
      entries.delete(id);
    },
  };
  return {
    store,
    entries,
    breakDisk(error: Error) {
      failure = error;
    },
  };
};

// Un faux data/rewards.json : ce qu'on y a écrit, et un disque qui peut tomber en panne.
const createFakeRecords = (initial: RewardRecordsFile) => {
  const state = { file: initial, failure: undefined as Error | undefined };
  const store: RewardRecordStore = {
    get: () => state.file,
    update(next) {
      if (state.failure) throw state.failure;
      state.file = next;
    },
  };
  return { store, state };
};

// Un faux Twitch : il note chaque appel, donne des identifiants de reward qui se suivent, et refuse l'appel dont le test a
// posé l'échec.
type RewardCall = { name: string; rewardId?: string; payload?: unknown };

const createFakeTwitch = () => {
  const calls: RewardCall[] = [];
  const failures = new Map<string, { status: number; message: string }>();
  const pending = new Map<string, string[]>();
  // Les rewards que Twitch donne à la liste (ceux qu'Alexis a faits à la main, et ceux de l'app).
  const remote: RewardChoice[] = [];
  let nextId = 0;
  const answer = <Value>(name: string, value: Value): RewardResult<Value> => {
    const failure = failures.get(name);
    return failure ? { ok: false, ...failure } : { ok: true, value };
  };
  const rewards: RewardPort = {
    async list() {
      calls.push({ name: "list" });
      return answer("list", [...remote]);
    },
    async create(fields) {
      calls.push({ name: "create", payload: fields });
      nextId += 1;
      return answer("create", `reward-${nextId}`);
    },
    async update(rewardId, change) {
      calls.push({ name: "update", rewardId, payload: change });
      return answer("update", null);
    },
    async delete(rewardId) {
      calls.push({ name: "delete", rewardId });
      return answer("delete", null);
    },
    async listPending(rewardId) {
      calls.push({ name: "listPending", rewardId });
      return answer("listPending", pending.get(rewardId) ?? []);
    },
    async settle(redemption, status) {
      calls.push({ name: "settle", rewardId: redemption.rewardId, payload: `${redemption.id}:${status}` });
      return answer("settle", null);
    },
  };
  return { rewards, calls, failures, pending, remote };
};

const draft = (overrides: Partial<SoundDraft> = {}): SoundDraft => ({
  title: "Applaudissements",
  fader: 80,
  file: wav(),
  ...overrides,
});

// Un reward de Twitch ; `isManageable: true` : un reward que l'app a créé. Par défaut, un reward qu'Alexis a fait à la main.
const remoteReward = (id: string, title: string, overrides: Partial<RewardChoice> = {}): RewardChoice => ({
  id,
  title,
  cost: 200,
  pace: 60,
  isManageable: false,
  ...overrides,
});

// Les sounds et les rewards câblés comme runtime.ts le fait : un sound ne parle pas à Twitch, un reward désigne son sound.
const setup = (options: { records?: RewardRecordsFile } = {}) => {
  const fake = createFakeStore();
  const twitch = createFakeTwitch();
  const disk = createFakeRecords(options.records ?? {});
  const logs: string[] = [];
  const deleted: string[] = [];
  // Les clips confirmés qui ont un rire de chaque sound ; `undefined` : le dossier des clips est illisible.
  const clips: { counts: Map<string, number> | undefined } = { counts: new Map() };
  let ids = 0;
  const sounds = createSoundLibrary({
    store: fake.store,
    createId: () => {
      ids += 1;
      return `sound00${ids}`;
    },
    usage: {
      listRewardTitles: (soundId) => rewards.listTitlesOf(soundId),
      listClipCounts: () => clips.counts,
    },
    onDelete: async (id) => {
      deleted.push(id);
      rewards.detachSound(id);
    },
    log: (line) => logs.push(line),
  });
  const rewards = createRewardLibrary({
    store: disk.store,
    twitch: twitch.rewards,
    sounds,
    log: (line) => logs.push(line),
  });
  return { ...fake, sounds, rewards, twitch, disk, logs, deleted, clips };
};

describe("createSoundLibrary : créer un sound", () => {
  it("garde le sound et son fichier, et rend sa fiche avec une version et sans utilisateur", () => {
    const { sounds, entries } = setup();
    const result = sounds.create(draft());
    expect(result).toEqual({
      ok: true,
      value: {
        id: "sound001",
        title: "Applaudissements",
        fader: 80,
        version: "1",
        rewardTitles: [],
        clipCount: 0,
      },
    });
    expect(entries.get("sound001")?.sound).toEqual({ title: "Applaudissements", fader: 80, format: "wav" });
    expect(sounds.list()).toHaveLength(1);
  });

  it("lit le format du fichier dans ses octets : un ogg est gardé comme ogg", () => {
    const { sounds, entries } = setup();
    sounds.create(draft({ file: ogg() }));
    expect(entries.get("sound001")?.sound.format).toBe("ogg");
  });

  it("refuse un sound sans fichier", () => {
    const { sounds } = setup();
    const { file: _missing, ...withoutFile } = draft();
    expect(sounds.create(withoutFile)).toEqual({
      ok: false,
      status: 422,
      issues: [{ path: "file", message: "le fichier audio manque" }],
    });
    expect(sounds.list()).toEqual([]);
  });

  it("refuse un fichier qui n'est pas de l'audio, ou trop lourd, sans rien garder", () => {
    const { sounds } = setup();
    const notAudio = sounds.create(draft({ file: Uint8Array.from(ascii("<html></html>")) }));
    expect(notAudio).toEqual({
      ok: false,
      status: 422,
      issues: [{ path: "file", message: "ce fichier n'est pas un mp3, un wav ou un ogg" }],
    });
    const heavy = new Uint8Array(5 * 1024 * 1024 + 1);
    heavy.set(wav());
    const tooHeavy = sounds.create(draft({ file: heavy }));
    expect(tooHeavy.ok).toBe(false);
    expect(sounds.list()).toEqual([]);
  });

  it("refuse un titre déjà pris par un autre sound, majuscules et blancs de bord comptés pour rien", () => {
    const { sounds } = setup();
    sounds.create(draft());
    const result = sounds.create(draft({ title: "  APPLAUDISSEMENTS " }));
    expect(result).toEqual({
      ok: false,
      status: 422,
      issues: [{ path: "title", message: "un autre son porte déjà ce titre" }],
    });
    expect(sounds.list()).toHaveLength(1);
  });

  it("dit qu'une panne du disque n'a rien enregistré", () => {
    const { sounds, breakDisk } = setup();
    breakDisk(new Error("disque plein"));
    expect(sounds.create(draft())).toEqual({
      ok: false,
      status: 422,
      issues: [{ path: "", message: "rien n'est enregistré : disque plein" }],
    });
  });
});

describe("createSoundLibrary : lire", () => {
  it("liste les sounds par titre, puis par identifiant", () => {
    const { sounds } = setup();
    sounds.create(draft({ title: "Zut" }));
    sounds.create(draft({ title: "Applaudissements" }));
    sounds.create(draft({ title: "Rire" }));
    expect(sounds.list().map(({ title }) => title)).toEqual(["Applaudissements", "Rire", "Zut"]);
  });

  it("donne un sound par son identifiant, et son fichier avec son type MIME", () => {
    const { sounds } = setup();
    sounds.create(draft({ file: ogg() }));
    expect(sounds.get("sound001")).toEqual({
      id: "sound001",
      title: "Applaudissements",
      fader: 80,
      version: "1",
    });
    expect(sounds.get("inconnu")).toBeUndefined();
    const audio = sounds.getAudio("sound001");
    expect(audio?.mime).toBe("audio/ogg");
    expect(Array.from(audio?.bytes ?? []).slice(0, 4)).toEqual(ascii("OggS"));
    expect(sounds.getAudio("inconnu")).toBeUndefined();
  });
});

describe("createSoundLibrary : modifier un sound", () => {
  it("change les réglages et garde l'ancien fichier quand il n'en vient pas de nouveau, avec une autre version", () => {
    const { sounds, entries } = setup();
    sounds.create(draft());
    const { file: _kept, ...fields } = draft({ title: "Bravo", fader: 40 });
    const result = sounds.update("sound001", fields);
    expect(result).toEqual({
      ok: true,
      value: { id: "sound001", title: "Bravo", fader: 40, version: "2", rewardTitles: [], clipCount: 0 },
    });
    expect(entries.get("sound001")?.sound.format).toBe("wav");
  });

  it("remplace le fichier, et son format avec lui", () => {
    const { sounds, entries } = setup();
    sounds.create(draft());
    sounds.update("sound001", draft({ file: ogg() }));
    expect(entries.get("sound001")?.sound.format).toBe("ogg");
  });

  it("laisse un sound garder son propre titre, mais pas prendre celui d'un autre", () => {
    const { sounds } = setup();
    sounds.create(draft({ title: "Rire" }));
    sounds.create(draft({ title: "Bravo" }));
    expect(sounds.update("sound001", draft({ title: "Rire", fader: 10 })).ok).toBe(true);
    expect(sounds.update("sound001", draft({ title: "bravo" }))).toEqual({
      ok: false,
      status: 422,
      issues: [{ path: "title", message: "un autre son porte déjà ce titre" }],
    });
    expect(sounds.get("sound001")?.title).toBe("Rire");
  });

  it("refuse un sound inconnu, et un fichier qui n'est pas de l'audio sans toucher à l'ancien", () => {
    const { sounds } = setup();
    expect(sounds.update("inconnu", draft())).toEqual({
      ok: false,
      status: 404,
      issues: [{ path: "", message: "son introuvable" }],
    });
    sounds.create(draft());
    const result = sounds.update("sound001", draft({ file: Uint8Array.from(ascii("texte")) }));
    expect(result.ok).toBe(false);
    expect(sounds.getAudio("sound001")?.mime).toBe("audio/wav");
  });
});

describe("createSoundLibrary : supprimer un sound", () => {
  it("retire le sound et son fichier", async () => {
    const { sounds } = setup();
    sounds.create(draft());
    expect(await sounds.delete("sound001")).toEqual({ ok: true, value: undefined });
    expect(sounds.list()).toEqual([]);
    expect(sounds.getAudio("sound001")).toBeUndefined();
  });

  it("refuse un sound inconnu", async () => {
    const { sounds } = setup();
    expect(await sounds.delete("inconnu")).toEqual({
      ok: false,
      status: 404,
      issues: [{ path: "", message: "son introuvable" }],
    });
  });

  it("dit qu'une panne du disque n'a rien supprimé", async () => {
    const { sounds, breakDisk } = setup();
    sounds.create(draft());
    breakDisk(new Error("fichier utilisé"));
    expect(await sounds.delete("sound001")).toEqual({
      ok: false,
      status: 422,
      issues: [{ path: "", message: "rien n'est supprimé : fichier utilisé" }],
    });
  });
});

describe("createSoundLibrary : un sound ne parle jamais à Twitch", () => {
  it("n'y crée aucun reward, et le journal ne parle que du sound", () => {
    const { sounds, twitch, logs } = setup();
    sounds.create(draft({ title: "Rire" }));
    expect(twitch.calls).toEqual([]);
    expect(logs).toEqual(["Son « Rire » créé (sound001)."]);
  });

  it("se crée même quand Twitch refuse tout : chaîne non affiliée, titre pris, connexion perdue", () => {
    const { sounds, twitch } = setup();
    twitch.failures.set("create", { status: 403, message: "Twitch refuse : la chaîne n'est pas affiliée." });
    twitch.failures.set("list", { status: 401, message: "Twitch n'est pas prêt." });
    twitch.remote.push(remoteReward("pris", "Applaudissements"));
    expect(sounds.create(draft()).ok).toBe(true);
    expect(sounds.list()).toHaveLength(1);
    expect(twitch.calls).toEqual([]);
  });

  it("ne demande rien à Twitch quand le sound est refusé ici, ni quand le disque tombe en panne", () => {
    const { sounds, twitch, breakDisk } = setup();
    sounds.create(draft());
    sounds.create(draft({ title: "applaudissements" }));
    sounds.create(draft({ title: "Autre", file: Uint8Array.from(ascii("texte")) }));
    breakDisk(new Error("disque plein"));
    sounds.create(draft({ title: "Troisième" }));
    expect(twitch.calls).toEqual([]);
  });

  it("change le titre, le fader et le fichier sans toucher au titre du reward qui le désigne", async () => {
    const { sounds, rewards, twitch, disk } = setup();
    sounds.create(draft({ title: "Rire" }));
    await rewards.create({ title: "Fou rire", cost: 100, pace: 30, sound: "sound001" });
    twitch.calls.length = 0;
    expect(sounds.update("sound001", draft({ title: "Bravo", fader: 10, file: ogg() })).ok).toBe(true);
    expect(twitch.calls).toEqual([]);
    expect(disk.state.file["reward-1"]).toEqual({ title: "Fou rire", sound: "sound001", isManaged: true });
  });

  it("se modifie quand Twitch ne répond pas, et ne recrée jamais un reward", () => {
    const { sounds, twitch } = setup();
    sounds.create(draft());
    twitch.failures.set("update", { status: 0, message: "Twitch ne répond pas." });
    twitch.failures.set("create", { status: 0, message: "Twitch ne répond pas." });
    expect(sounds.update("sound001", draft({ title: "Bravo", fader: 5 })).ok).toBe(true);
    expect(twitch.calls).toEqual([]);
  });
});

describe("createSoundLibrary : supprimer un sound retire son lien sans toucher à Twitch", () => {
  it("rend d'abord les points en attente, retire le sound, et laisse le reward géré sans sound sur Twitch", async () => {
    const { sounds, rewards, twitch, deleted, disk } = setup();
    sounds.create(draft());
    await rewards.create({ title: "Rire", cost: 100, pace: 30, sound: "sound001" });
    twitch.calls.length = 0;
    expect(await sounds.delete("sound001")).toEqual({ ok: true, value: undefined });
    expect(deleted).toEqual(["sound001"]);
    expect(twitch.calls).toEqual([]);
    expect(sounds.list()).toEqual([]);
    expect(disk.state.file).toEqual({ "reward-1": { title: "Rire", sound: null, isManaged: true } });
  });

  it("retire de rewards.json le reward fait sur Twitch qui n'a plus de sound, sans le supprimer de Twitch", async () => {
    const { sounds, twitch, disk, logs } = setup({
      records: {
        clash: { title: "Clasher Fenysk", sound: "sound001", isManaged: false },
        autre: { title: "Autre", sound: "sound002", isManaged: false },
      },
    });
    sounds.create(draft());
    sounds.create(draft({ title: "Bravo" }));
    expect(await sounds.delete("sound001")).toEqual({ ok: true, value: undefined });
    expect(disk.state.file).toEqual({ autre: { title: "Autre", sound: "sound002", isManaged: false } });
    expect(twitch.calls).toEqual([]);
    expect(logs).toContain("Son sound001 supprimé : 1 récompense(s) n'ont plus de son.");
  });

  it("laisse chaque reward qui le désignait sans sound quand il en avait plusieurs", async () => {
    const { sounds, disk } = setup({
      records: {
        a: { title: "A", sound: "sound001", isManaged: true },
        b: { title: "B", sound: "sound001", isManaged: false },
        c: { title: "C", sound: "sound002", isManaged: false },
      },
    });
    sounds.create(draft());
    sounds.create(draft({ title: "Bravo" }));
    await sounds.delete("sound001");
    expect(disk.state.file).toEqual({
      a: { title: "A", sound: null, isManaged: true },
      c: { title: "C", sound: "sound002", isManaged: false },
    });
  });

  it("ne supprime rien quand rewards.json ne s'écrit pas : le sound reste, désigné par ses rewards", async () => {
    const { sounds, disk } = setup({
      records: { clash: { title: "Clash", sound: "sound001", isManaged: false } },
    });
    sounds.create(draft());
    disk.state.failure = new Error("disque plein");
    expect(await sounds.delete("sound001")).toEqual({
      ok: false,
      status: 422,
      issues: [{ path: "", message: "rien n'est supprimé : disque plein" }],
    });
    expect(sounds.list()).toHaveLength(1);
    expect(disk.state.file.clash?.sound).toBe("sound001");
  });

  it("se supprime quand Twitch ne répond pas : il n'est pas appelé", async () => {
    const { sounds, rewards, twitch } = setup();
    sounds.create(draft());
    await rewards.create({ title: "Rire", cost: 100, pace: 30, sound: "sound001" });
    twitch.failures.set("delete", { status: 0, message: "Twitch ne répond pas." });
    twitch.calls.length = 0;
    expect((await sounds.delete("sound001")).ok).toBe(true);
    expect(twitch.calls).toEqual([]);
  });
});

describe("createSoundLibrary : qui utilise un sound", () => {
  it("dit « pas utilisé » d'un sound que ni reward ni clip ne désigne", () => {
    const { sounds } = setup();
    sounds.create(draft());
    expect(sounds.list()).toMatchObject([{ id: "sound001", rewardTitles: [], clipCount: 0 }]);
  });

  it("donne les titres des rewards qui le désignent, par ordre alphabétique", () => {
    const { sounds } = setup({
      records: {
        a: { title: "Zut alors", sound: "sound001", isManaged: false },
        b: { title: "Applaudir", sound: "sound001", isManaged: true },
        c: { title: "Autre sound", sound: "sound002", isManaged: false },
      },
    });
    sounds.create(draft());
    sounds.create(draft({ title: "Bravo" }));
    expect(sounds.list().map(({ id, rewardTitles }) => [id, rewardTitles])).toEqual([
      ["sound001", ["Applaudir", "Zut alors"]],
      ["sound002", ["Autre sound"]],
    ]);
  });

  it("laisse un même sound servir deux rewards, et leur laisse choisir chacun le leur", async () => {
    const { sounds, rewards, disk } = setup();
    sounds.create(draft());
    sounds.create(draft({ title: "Bravo" }));
    await rewards.create({ title: "Rire", cost: 100, pace: 30, sound: "sound001" });
    await rewards.create({ title: "Gros rire", cost: 500, pace: 0, sound: "sound001" });
    expect(sounds.list()[0]?.rewardTitles).toEqual(["Gros rire", "Rire"]);
    await rewards.updateSound("reward-2", "sound002");
    expect(sounds.list().map(({ id, rewardTitles }) => [id, rewardTitles])).toEqual([
      ["sound001", ["Rire"]],
      ["sound002", ["Gros rire"]],
    ]);
    expect(disk.state.file["reward-1"]?.sound).toBe("sound001");
  });

  it("compte les clips confirmés qui ont un de ses rires", () => {
    const { sounds, clips } = setup();
    sounds.create(draft());
    sounds.create(draft({ title: "Bravo" }));
    clips.counts = new Map([["sound001", 3]]);
    expect(sounds.list().map(({ id, clipCount }) => [id, clipCount])).toEqual([
      ["sound001", 3],
      ["sound002", 0],
    ]);
  });

  it("n'invente pas le nombre de clips quand le dossier des clips est illisible : il vaut null", () => {
    const { sounds, clips } = setup();
    clips.counts = undefined;
    const created = sounds.create(draft());
    expect(created).toMatchObject({ ok: true, value: { clipCount: null } });
    expect(sounds.list()).toMatchObject([{ clipCount: null }]);
  });

  it("garde les utilisateurs d'un sound dans la fiche rendue par sa création et sa modification", async () => {
    const { sounds, rewards, clips } = setup();
    sounds.create(draft());
    await rewards.create({ title: "Rire", cost: 100, pace: 30, sound: "sound001" });
    clips.counts = new Map([["sound001", 2]]);
    const updated = sounds.update("sound001", draft({ fader: 10 }));
    expect(updated).toMatchObject({ ok: true, value: { fader: 10, rewardTitles: ["Rire"], clipCount: 2 } });
  });

  it("lit les clips une fois par liste, pas une fois par sound", () => {
    const { sounds, clips } = setup();
    for (const title of ["A", "B", "C"]) sounds.create(draft({ title }));
    let reads = 0;
    const counts = new Map<string, number>();
    Object.defineProperty(clips, "counts", {
      get() {
        reads += 1;
        return counts;
      },
    });
    sounds.list();
    expect(reads).toBe(1);
  });
});

describe("createRewardLibrary : le sound d'un reward", () => {
  it("retrouve l'enregistrement d'un reward, avec son sound et s'il est géré, et rien pour un autre", async () => {
    const { sounds, rewards } = setup();
    sounds.create(draft({ title: "Rire" }));
    await rewards.create({ title: "Fou rire", cost: 100, pace: 30, sound: "sound001" });
    expect(rewards.getRecord("reward-1")).toEqual({ title: "Fou rire", sound: "sound001", isManaged: true });
    expect(rewards.getRecord("reward-99")).toBeUndefined();
  });

  it("lit l'enregistrement tel que rewards.json le garde au démarrage", () => {
    const { rewards } = setup({
      records: { clash: { title: "Clash", sound: "sound001", isManaged: false } },
    });
    expect(rewards.getRecord("clash")).toEqual({ title: "Clash", sound: "sound001", isManaged: false });
  });
});

describe("createRewardLibrary : les rewards suivent le stream", () => {
  const toLine = ({ name, rewardId, payload }: RewardCall): string =>
    `${name}:${rewardId ?? ""}:${JSON.stringify(payload ?? "")}`;

  it("sort chaque reward géré de pause au démarrage et rembourse ses redemptions en attente", async () => {
    const { rewards, twitch, logs } = setup();
    await rewards.create({ title: "Rire", cost: 100, pace: 30, sound: null });
    await rewards.create({ title: "Bravo", cost: 100, pace: 30, sound: null });
    twitch.calls.length = 0;
    twitch.pending.set("reward-1", ["red-a", "red-b"]);
    await rewards.openRewards();
    expect(twitch.calls.map(toLine)).toEqual([
      'update:reward-2:{"isPaused":false}',
      'listPending:reward-2:""',
      'update:reward-1:{"isPaused":false}',
      'listPending:reward-1:""',
      'settle:reward-1:"red-a:CANCELED"',
      'settle:reward-1:"red-b:CANCELED"',
    ]);
    expect(logs).toContain("Récompense « Rire » : 2 rachat(s) en attente remboursé(s).");
  });

  it("ne s'ouvre qu'une fois par démarrage : se reconnecter en plein stream ne rembourse rien", async () => {
    const { rewards, twitch } = setup();
    await rewards.create({ title: "Rire", cost: 100, pace: 30, sound: null });
    await rewards.openRewards();
    twitch.calls.length = 0;
    twitch.pending.set("reward-1", ["red-en-cours"]);
    await rewards.openRewards();
    expect(twitch.calls).toEqual([]);
  });

  it("recommence quand Twitch n'avait pas répondu, et s'ouvre de nouveau après l'arrêt", async () => {
    const { rewards, twitch } = setup();
    await rewards.create({ title: "Rire", cost: 100, pace: 30, sound: null });
    twitch.failures.set("update", { status: 0, message: "Twitch ne répond pas." });
    await rewards.openRewards();
    twitch.failures.clear();
    twitch.calls.length = 0;
    await rewards.openRewards();
    expect(twitch.calls.map(({ name }) => name)).toEqual(["update", "listPending"]);
    await rewards.pauseRewards();
    twitch.calls.length = 0;
    await rewards.openRewards();
    expect(twitch.calls.map(({ name }) => name)).toEqual(["update", "listPending"]);
  });

  it("n'insiste pas quand Twitch n'est pas prêt : un seul essai, le journal le dit", async () => {
    const { rewards, twitch, logs } = setup();
    await rewards.create({ title: "Rire", cost: 100, pace: 30, sound: null });
    await rewards.create({ title: "Bravo", cost: 100, pace: 30, sound: null });
    twitch.calls.length = 0;
    twitch.failures.set("update", { status: 401, message: "Twitch n'est pas prêt." });
    await rewards.openRewards();
    expect(twitch.calls).toHaveLength(1);
    expect(logs.at(-1)).toBe("Récompense « Bravo » : pas remise en route (Twitch n'est pas prêt.).");
  });

  it("passe au reward suivant quand l'un a disparu de Twitch", async () => {
    const { rewards, twitch, logs } = setup();
    await rewards.create({ title: "Rire", cost: 100, pace: 30, sound: null });
    await rewards.create({ title: "Bravo", cost: 100, pace: 30, sound: null });
    twitch.calls.length = 0;
    twitch.failures.set("update", { status: 404, message: "inconnu" });
    await rewards.openRewards();
    expect(twitch.calls.map(({ name }) => name)).toEqual(["update", "update"]);
    expect(logs.filter((line) => line.includes("pas remise en route"))).toHaveLength(2);
  });

  it("met chaque reward géré en pause à l'arrêt, avec ou sans sound, et jamais un reward fait sur Twitch", async () => {
    const { sounds, rewards, twitch } = setup({
      records: { clash: { title: "Clasher Fenysk", sound: "sound001", isManaged: false } },
    });
    sounds.create(draft());
    await rewards.create({ title: "Rire", cost: 100, pace: 30, sound: "sound001" });
    await rewards.create({ title: "Sans sound", cost: 100, pace: 30, sound: null });
    twitch.calls.length = 0;
    await rewards.pauseRewards();
    expect(twitch.calls.map(toLine).sort()).toEqual([
      'update:reward-1:{"isPaused":true}',
      'update:reward-2:{"isPaused":true}',
    ]);
  });

  it("écrit dans le journal un reward qui ne se met pas en pause", async () => {
    const { rewards, twitch, logs } = setup();
    await rewards.create({ title: "Rire", cost: 100, pace: 30, sound: null });
    twitch.failures.set("update", { status: 0, message: "Twitch ne répond pas." });
    await rewards.pauseRewards();
    expect(logs.at(-1)).toBe("Récompense « Rire » : pas mise en pause (Twitch ne répond pas.).");
  });

  it("ne remet en route ni ne met en pause un reward que l'app ne gère pas, et ne rembourse rien", async () => {
    const { sounds, rewards, twitch } = setup({
      records: { clash: { title: "Clasher Fenysk", sound: "sound001", isManaged: false } },
    });
    sounds.create(draft());
    await rewards.create({ title: "Rire", cost: 100, pace: 30, sound: "sound001" });
    twitch.calls.length = 0;
    twitch.pending.set("clash", ["red-a"]);
    await rewards.openRewards();
    await rewards.pauseRewards();
    expect(twitch.calls.filter(({ rewardId }) => rewardId === "clash")).toEqual([]);
    expect(twitch.calls.map(({ name, rewardId }) => `${name}:${rewardId}`)).toEqual([
      "update:reward-1",
      "listPending:reward-1",
      "update:reward-1",
    ]);
  });
});

describe("createRewardLibrary : choisir le sound d'un reward déjà fait sur Twitch", () => {
  it("crée l'enregistrement du reward avec le titre de Twitch, sans le gérer, et sans rien écrire sur Twitch", async () => {
    const { sounds, rewards, twitch, disk } = setup();
    twitch.remote.push(remoteReward("clash", "Clasher Fenysk", { cost: 300, pace: 90 }));
    sounds.create(draft());
    expect(await rewards.updateSound("clash", "sound001")).toEqual({ ok: true, value: "sound001" });
    expect(disk.state.file).toEqual({
      clash: { title: "Clasher Fenysk", sound: "sound001", isManaged: false },
    });
    expect(twitch.calls.map(({ name }) => name)).toEqual(["list"]);
  });

  it("tient pour géré un reward de la liste que l'app a créé", async () => {
    const { sounds, rewards, twitch, disk } = setup();
    twitch.remote.push(remoteReward("mien", "Créé par l'app", { isManageable: true }));
    sounds.create(draft());
    await rewards.updateSound("mien", "sound001");
    expect(disk.state.file.mien).toEqual({ title: "Créé par l'app", sound: "sound001", isManaged: true });
  });

  it("refuse un sound inconnu, un reward que Twitch ne connaît plus, et un Twitch qui ne répond pas, sans rien enregistrer", async () => {
    const { sounds, rewards, twitch, disk } = setup();
    twitch.remote.push(remoteReward("clash", "Clasher Fenysk"));
    sounds.create(draft());
    expect(await rewards.updateSound("clash", "inconnu")).toEqual({
      ok: false,
      status: 422,
      issues: [{ path: "sound", message: "ce son n'existe pas" }],
    });
    expect(await rewards.updateSound("disparu", "sound001")).toEqual({
      ok: false,
      status: 404,
      issues: [{ path: "", message: "cette récompense n'existe pas sur Twitch" }],
    });
    twitch.failures.set("list", { status: 0, message: "Twitch ne répond pas." });
    expect(await rewards.updateSound("clash", "sound001")).toMatchObject({ ok: false, status: 502 });
    expect(disk.state.file).toEqual({});
  });

  it("retire le sound d'un reward fait sur Twitch : son enregistrement part, et rien ne se demande à Twitch", async () => {
    const { rewards, twitch, disk } = setup({
      records: { clash: { title: "Clasher Fenysk", sound: "sound001", isManaged: false } },
    });
    expect(await rewards.updateSound("clash", null)).toEqual({ ok: true, value: null });
    expect(disk.state.file).toEqual({});
    expect(twitch.calls).toEqual([]);
  });

  it("retire le sound d'un reward géré sans retirer le reward : son enregistrement reste", async () => {
    const { sounds, rewards, disk } = setup();
    sounds.create(draft());
    await rewards.create({ title: "Rire", cost: 100, pace: 30, sound: "sound001" });
    await rewards.updateSound("reward-1", null);
    expect(disk.state.file).toEqual({ "reward-1": { title: "Rire", sound: null, isManaged: true } });
  });

  it("dit qu'un reward sans enregistrement qu'on veut laisser sans sound n'a rien à enregistrer, sans appeler Twitch", async () => {
    const { rewards, twitch, disk } = setup();
    expect(await rewards.updateSound("clash", null)).toEqual({ ok: true, value: null });
    expect(disk.state.file).toEqual({});
    expect(twitch.calls).toEqual([]);
  });

  it("dit qu'une panne du disque n'a rien enregistré", async () => {
    const { sounds, rewards, twitch, disk } = setup();
    twitch.remote.push(remoteReward("clash", "Clasher Fenysk"));
    sounds.create(draft());
    disk.state.failure = new Error("disque plein");
    expect(await rewards.updateSound("clash", "sound001")).toEqual({
      ok: false,
      status: 422,
      issues: [{ path: "sound", message: "rien n'est enregistré : disque plein" }],
    });
  });
});

import { describe, expect, it } from "vitest";
import type { RewardChoice, SoundFile } from "../domain/sound.schema";
import {
  createSoundLibrary,
  type RewardPort,
  type RewardResult,
  type SoundDraft,
  type SoundStore,
  type StoredSound,
} from "./sound.usecase";

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

// Un faux Twitch : il note chaque appel, donne des identifiants de reward qui se suivent, et refuse l'appel dont le test a
// posé l'échec.
type RewardCall = { name: string; rewardId?: string; payload?: unknown };

const createFakeRewards = () => {
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
  cost: 100,
  pace: 30,
  fader: 80,
  file: wav(),
  ...overrides,
});

const setup = () => {
  const fake = createFakeStore();
  const twitch = createFakeRewards();
  const logs: string[] = [];
  const deleted: string[] = [];
  let ids = 0;
  const library = createSoundLibrary({
    store: fake.store,
    rewards: twitch.rewards,
    createId: () => {
      ids += 1;
      return `sound00${ids}`;
    },
    onDelete: async (id) => {
      deleted.push(id);
    },
    log: (line) => logs.push(line),
  });
  return { ...fake, library, logs, deleted, twitch };
};

describe("createSoundLibrary : créer un son", () => {
  it("garde le son et son fichier, et rend sa fiche avec une version", async () => {
    const { library, entries } = setup();
    const result = await library.create(draft());
    expect(result).toEqual({
      ok: true,
      value: {
        id: "sound001",
        title: "Applaudissements",
        cost: 100,
        pace: 30,
        fader: 80,
        version: "1",
        hasReward: true,
        isManaged: true,
      },
    });
    expect(entries.get("sound001")?.sound.format).toBe("wav");
    expect(library.list()).toHaveLength(1);
  });

  it("lit le format du fichier dans ses octets : un ogg est gardé comme ogg", async () => {
    const { library, entries } = setup();
    await library.create(draft({ file: ogg() }));
    expect(entries.get("sound001")?.sound.format).toBe("ogg");
  });

  it("refuse un son sans fichier", async () => {
    const { library } = setup();
    const { file: _missing, ...withoutFile } = draft();
    expect(await library.create(withoutFile)).toEqual({
      ok: false,
      status: 422,
      issues: [{ path: "file", message: "le fichier audio manque" }],
    });
    expect(library.list()).toEqual([]);
  });

  it("refuse un fichier qui n'est pas de l'audio, ou trop lourd, sans rien garder", async () => {
    const { library } = setup();
    const notAudio = await library.create(draft({ file: Uint8Array.from(ascii("<html></html>")) }));
    expect(notAudio).toEqual({
      ok: false,
      status: 422,
      issues: [{ path: "file", message: "ce fichier n'est pas un mp3, un wav ou un ogg" }],
    });
    const heavy = new Uint8Array(5 * 1024 * 1024 + 1);
    heavy.set(wav());
    const tooHeavy = await library.create(draft({ file: heavy }));
    expect(tooHeavy.ok).toBe(false);
    expect(library.list()).toEqual([]);
  });

  it("refuse un titre déjà pris par un autre son, majuscules et blancs de bord comptés pour rien", async () => {
    const { library } = setup();
    await library.create(draft());
    const result = await library.create(draft({ title: "  APPLAUDISSEMENTS " }));
    expect(result).toEqual({
      ok: false,
      status: 422,
      issues: [{ path: "title", message: "un autre son porte déjà ce titre" }],
    });
    expect(library.list()).toHaveLength(1);
  });

  it("dit qu'une panne du disque n'a rien enregistré", async () => {
    const { library, breakDisk } = setup();
    breakDisk(new Error("disque plein"));
    expect(await library.create(draft())).toEqual({
      ok: false,
      status: 422,
      issues: [{ path: "", message: "rien n'est enregistré : disque plein" }],
    });
  });
});

describe("createSoundLibrary : lire", () => {
  it("liste les sons par titre, puis par identifiant", async () => {
    const { library } = setup();
    await library.create(draft({ title: "Zut" }));
    await library.create(draft({ title: "Applaudissements" }));
    await library.create(draft({ title: "Rire" }));
    expect(library.list().map(({ title }) => title)).toEqual(["Applaudissements", "Rire", "Zut"]);
  });

  it("donne un son par son identifiant, et son fichier avec son type MIME", async () => {
    const { library } = setup();
    await library.create(draft({ file: ogg() }));
    expect(library.get("sound001")?.title).toBe("Applaudissements");
    expect(library.get("inconnu")).toBeUndefined();
    const audio = library.getAudio("sound001");
    expect(audio?.mime).toBe("audio/ogg");
    expect(Array.from(audio?.bytes ?? []).slice(0, 4)).toEqual(ascii("OggS"));
    expect(library.getAudio("inconnu")).toBeUndefined();
  });
});

describe("createSoundLibrary : modifier un son", () => {
  it("change les réglages et garde l'ancien fichier quand il n'en vient pas de nouveau, avec une autre version", async () => {
    const { library, entries } = setup();
    await library.create(draft());
    const { file: _kept, ...fields } = draft({ title: "Bravo", cost: 250, pace: 0, fader: 40 });
    const result = await library.update("sound001", fields);
    expect(result).toEqual({
      ok: true,
      value: {
        id: "sound001",
        title: "Bravo",
        cost: 250,
        pace: 0,
        fader: 40,
        version: "2",
        hasReward: true,
        isManaged: true,
      },
    });
    expect(entries.get("sound001")?.sound.format).toBe("wav");
  });

  it("remplace le fichier, et son format avec lui", async () => {
    const { library, entries } = setup();
    await library.create(draft());
    await library.update("sound001", draft({ file: ogg() }));
    expect(entries.get("sound001")?.sound.format).toBe("ogg");
  });

  it("laisse un son garder son propre titre, mais pas prendre celui d'un autre", async () => {
    const { library } = setup();
    await library.create(draft({ title: "Rire" }));
    await library.create(draft({ title: "Bravo" }));
    expect((await library.update("sound001", draft({ title: "Rire", fader: 10 }))).ok).toBe(true);
    expect(await library.update("sound001", draft({ title: "bravo" }))).toEqual({
      ok: false,
      status: 422,
      issues: [{ path: "title", message: "un autre son porte déjà ce titre" }],
    });
    expect(library.get("sound001")?.title).toBe("Rire");
  });

  it("refuse un son inconnu, et un fichier qui n'est pas de l'audio sans toucher à l'ancien", async () => {
    const { library } = setup();
    expect(await library.update("inconnu", draft())).toEqual({
      ok: false,
      status: 404,
      issues: [{ path: "", message: "son introuvable" }],
    });
    await library.create(draft());
    const result = await library.update("sound001", draft({ file: Uint8Array.from(ascii("texte")) }));
    expect(result.ok).toBe(false);
    expect(library.getAudio("sound001")?.mime).toBe("audio/wav");
  });
});

describe("createSoundLibrary : supprimer un son", () => {
  it("retire le son et son fichier", async () => {
    const { library } = setup();
    await library.create(draft());
    expect(await library.delete("sound001")).toEqual({ ok: true, value: undefined });
    expect(library.list()).toEqual([]);
    expect(library.getAudio("sound001")).toBeUndefined();
  });

  it("refuse un son inconnu", async () => {
    const { library } = setup();
    expect(await library.delete("inconnu")).toEqual({
      ok: false,
      status: 404,
      issues: [{ path: "", message: "son introuvable" }],
    });
  });

  it("dit qu'une panne du disque n'a rien supprimé", async () => {
    const { library, breakDisk } = setup();
    await library.create(draft());
    breakDisk(new Error("fichier utilisé"));
    expect(await library.delete("sound001")).toEqual({
      ok: false,
      status: 422,
      issues: [{ path: "", message: "rien n'est supprimé : fichier utilisé" }],
    });
  });
});

const legacy: SoundFile = {
  title: "Ancien",
  cost: 100,
  pace: 30,
  fader: 80,
  format: "wav",
  rewardId: null,
  isManaged: true,
};

describe("createSoundLibrary : créer un son crée son reward sur Twitch", () => {
  it("crée le reward avec le titre, le coût et la pace, et garde son identifiant avec le son", async () => {
    const { library, entries, twitch, logs } = setup();
    await library.create(draft({ title: "Rire", cost: 250, pace: 45 }));
    expect(twitch.calls).toEqual([{ name: "create", payload: { title: "Rire", cost: 250, pace: 45 } }]);
    expect(entries.get("sound001")?.sound.rewardId).toBe("reward-1");
    expect(logs).toContain("Son « Rire » créé (sound001), sa récompense existe sur Twitch.");
  });

  it("ne garde rien quand Twitch refuse (chaîne non affiliée), et dit pourquoi", async () => {
    const { library, entries, twitch } = setup();
    twitch.failures.set("create", { status: 403, message: "Twitch refuse : la chaîne n'est pas affiliée." });
    expect(await library.create(draft())).toEqual({
      ok: false,
      status: 422,
      issues: [{ path: "", message: "Twitch refuse : la chaîne n'est pas affiliée." }],
    });
    expect(entries.size).toBe(0);
  });

  it("répond 502 quand Twitch ne répond pas", async () => {
    const { library, twitch } = setup();
    twitch.failures.set("create", { status: 0, message: "Twitch ne répond pas." });
    const result = await library.create(draft());
    expect(result).toMatchObject({ ok: false, status: 502 });
  });

  it("ne demande rien à Twitch quand le son est déjà refusé ici (titre pris, fichier faux)", async () => {
    const { library, twitch } = setup();
    await library.create(draft());
    twitch.calls.length = 0;
    await library.create(draft({ title: "applaudissements" }));
    await library.create(draft({ title: "Autre", file: Uint8Array.from(ascii("texte")) }));
    expect(twitch.calls).toEqual([]);
  });

  it("retire le reward de Twitch quand le disque n'a pas pu garder le son", async () => {
    const { library, breakDisk, twitch } = setup();
    breakDisk(new Error("disque plein"));
    const result = await library.create(draft());
    expect(result).toMatchObject({ ok: false, status: 422 });
    expect(twitch.calls.map(({ name, rewardId }) => `${name}:${rewardId ?? ""}`)).toEqual([
      "create:",
      "delete:reward-1",
    ]);
  });
});

describe("createSoundLibrary : modifier un son suit son reward", () => {
  it("ne demande rien à Twitch quand seuls le volume ou le fichier changent", async () => {
    const { library, twitch } = setup();
    await library.create(draft());
    twitch.calls.length = 0;
    await library.update("sound001", draft({ fader: 10 }));
    await library.update("sound001", draft({ file: ogg() }));
    expect(twitch.calls).toEqual([]);
  });

  it("met à jour le reward quand le titre, le coût ou la pace changent", async () => {
    const { library, twitch } = setup();
    await library.create(draft());
    twitch.calls.length = 0;
    await library.update("sound001", draft({ title: "Bravo", cost: 300, pace: 0 }));
    expect(twitch.calls).toEqual([
      { name: "update", rewardId: "reward-1", payload: { title: "Bravo", cost: 300, pace: 0 } },
    ]);
  });

  it("ne change rien ici quand Twitch refuse le nouveau titre", async () => {
    const { library, twitch } = setup();
    await library.create(draft());
    twitch.failures.set("update", {
      status: 400,
      message: "Twitch refuse ce titre : une récompense le porte déjà.",
    });
    const result = await library.update("sound001", draft({ title: "Pris" }));
    expect(result).toEqual({
      ok: false,
      status: 422,
      issues: [{ path: "", message: "Twitch refuse ce titre : une récompense le porte déjà." }],
    });
    expect(library.get("sound001")?.title).toBe("Applaudissements");
  });

  it("recrée le reward que Twitch ne connaît plus (supprimé à la main), et garde le nouveau", async () => {
    const { library, entries, twitch, logs } = setup();
    await library.create(draft());
    twitch.failures.set("update", { status: 404, message: "inconnu" });
    expect((await library.update("sound001", draft({ cost: 500 }))).ok).toBe(true);
    expect(twitch.calls.map(({ name }) => name)).toEqual(["create", "update", "create"]);
    expect(entries.get("sound001")?.sound.rewardId).toBe("reward-2");
    expect(logs).toContain("Son « Applaudissements » : sa récompense a disparu de Twitch, elle est recréée.");
  });

  it("crée le reward d'un son qui n'en a pas encore, même si seul son volume change", async () => {
    const { library, entries, twitch } = setup();
    entries.set("sound009", { sound: legacy, file: wav(), version: 1 });
    expect(library.get("sound009")?.hasReward).toBe(false);
    await library.update("sound009", draft({ title: "Ancien", fader: 5 }));
    expect(twitch.calls).toEqual([{ name: "create", payload: { title: "Ancien", cost: 100, pace: 30 } }]);
    expect(entries.get("sound009")?.sound.rewardId).toBe("reward-1");
    expect(library.get("sound009")?.hasReward).toBe(true);
  });
});

describe("createSoundLibrary : supprimer un son supprime son reward", () => {
  it("rend d'abord les points en attente, retire le reward de Twitch, puis le son", async () => {
    const { library, twitch, deleted } = setup();
    await library.create(draft());
    expect(await library.delete("sound001")).toEqual({ ok: true, value: undefined });
    expect(deleted).toEqual(["sound001"]);
    expect(twitch.calls.at(-1)).toEqual({ name: "delete", rewardId: "reward-1" });
    expect(library.list()).toEqual([]);
  });

  it("garde le son quand Twitch refuse de retirer le reward", async () => {
    const { library, twitch } = setup();
    await library.create(draft());
    twitch.failures.set("delete", { status: 403, message: "Twitch refuse : pas la bonne application." });
    expect(await library.delete("sound001")).toMatchObject({ ok: false, status: 422 });
    expect(library.list()).toHaveLength(1);
  });

  it("supprime quand même le son d'un reward que Twitch ne connaît plus", async () => {
    const { library, twitch } = setup();
    await library.create(draft());
    twitch.failures.set("delete", { status: 404, message: "inconnu" });
    expect((await library.delete("sound001")).ok).toBe(true);
    expect(library.list()).toEqual([]);
  });

  it("ne demande rien à Twitch pour un son qui n'a pas de reward", async () => {
    const { library, entries, twitch, deleted } = setup();
    entries.set("sound009", { sound: legacy, file: wav(), version: 1 });
    expect((await library.delete("sound009")).ok).toBe(true);
    expect(twitch.calls).toEqual([]);
    expect(deleted).toEqual([]);
  });
});

describe("createSoundLibrary : le son d'un reward", () => {
  it("retrouve le son dont c'est le reward, et rien pour un autre", async () => {
    const { library } = setup();
    await library.create(draft({ title: "Rire" }));
    await library.create(draft({ title: "Bravo" }));
    expect(library.getByReward("reward-2")?.title).toBe("Bravo");
    expect(library.getByReward("reward-99")).toBeUndefined();
  });
});

describe("createSoundLibrary : les rewards suivent le stream", () => {
  const toLine = ({ name, rewardId, payload }: RewardCall): string =>
    `${name}:${rewardId ?? ""}:${JSON.stringify(payload ?? "")}`;

  it("sort chaque reward de pause au démarrage et rembourse ses redemptions en attente", async () => {
    const { library, twitch, logs } = setup();
    await library.create(draft({ title: "Rire" }));
    await library.create(draft({ title: "Bravo" }));
    twitch.calls.length = 0;
    twitch.pending.set("reward-1", ["red-a", "red-b"]);
    await library.openRewards();
    expect(twitch.calls.map(toLine)).toEqual([
      'update:reward-2:{"isPaused":false}',
      'listPending:reward-2:""',
      'update:reward-1:{"isPaused":false}',
      'listPending:reward-1:""',
      'settle:reward-1:"red-a:CANCELED"',
      'settle:reward-1:"red-b:CANCELED"',
    ]);
    expect(logs).toContain("Récompense de « Rire » : 2 rachat(s) en attente remboursé(s).");
  });

  it("ne s'ouvre qu'une fois par démarrage : se reconnecter en plein stream ne rembourse rien", async () => {
    const { library, twitch } = setup();
    await library.create(draft({ title: "Rire" }));
    await library.openRewards();
    twitch.calls.length = 0;
    twitch.pending.set("reward-1", ["red-en-cours"]);
    await library.openRewards();
    expect(twitch.calls).toEqual([]);
  });

  it("recommence quand Twitch n'avait pas répondu, et s'ouvre de nouveau après l'arrêt", async () => {
    const { library, twitch } = setup();
    await library.create(draft({ title: "Rire" }));
    twitch.failures.set("update", { status: 0, message: "Twitch ne répond pas." });
    await library.openRewards();
    twitch.failures.clear();
    twitch.calls.length = 0;
    await library.openRewards();
    expect(twitch.calls.map(({ name }) => name)).toEqual(["update", "listPending"]);
    await library.pauseRewards();
    twitch.calls.length = 0;
    await library.openRewards();
    expect(twitch.calls.map(({ name }) => name)).toEqual(["update", "listPending"]);
  });

  it("n'insiste pas quand Twitch n'est pas prêt : un seul essai, le journal le dit", async () => {
    const { library, twitch, logs } = setup();
    await library.create(draft({ title: "Rire" }));
    await library.create(draft({ title: "Bravo" }));
    twitch.calls.length = 0;
    twitch.failures.set("update", { status: 401, message: "Twitch n'est pas prêt." });
    await library.openRewards();
    expect(twitch.calls).toHaveLength(1);
    expect(logs.at(-1)).toBe("Récompense de « Bravo » : pas remise en route (Twitch n'est pas prêt.).");
  });

  it("passe au reward suivant quand l'un a disparu de Twitch", async () => {
    const { library, twitch, logs } = setup();
    await library.create(draft({ title: "Rire" }));
    await library.create(draft({ title: "Bravo" }));
    twitch.calls.length = 0;
    twitch.failures.set("update", { status: 404, message: "inconnu" });
    await library.openRewards();
    expect(twitch.calls.map(({ name }) => name)).toEqual(["update", "update"]);
    expect(logs.filter((line) => line.includes("pas remise en route"))).toHaveLength(2);
  });

  it("met chaque reward en pause à l'arrêt, sans toucher aux sons sans reward", async () => {
    const { library, entries, twitch } = setup();
    await library.create(draft({ title: "Rire" }));
    entries.set("sound009", { sound: legacy, file: wav(), version: 1 });
    twitch.calls.length = 0;
    await library.pauseRewards();
    expect(twitch.calls).toEqual([{ name: "update", rewardId: "reward-1", payload: { isPaused: true } }]);
  });

  it("écrit dans le journal un reward qui ne se met pas en pause", async () => {
    const { library, twitch, logs } = setup();
    await library.create(draft({ title: "Rire" }));
    twitch.failures.set("update", { status: 0, message: "Twitch ne répond pas." });
    await library.pauseRewards();
    expect(logs.at(-1)).toBe("Récompense de « Rire » : pas mise en pause (Twitch ne répond pas.).");
  });
});

// Un reward qu'Alexis a fait sur Twitch (l'app ne le gère pas) ; `isManageable: true` : un reward que l'app a créé.
const remoteReward = (id: string, title: string, overrides: Partial<RewardChoice> = {}): RewardChoice => ({
  id,
  title,
  cost: 200,
  pace: 60,
  isManageable: false,
  ...overrides,
});

describe("createSoundLibrary : relier un son à un reward déjà fait sur Twitch", () => {
  it("liste les rewards de la chaîne qui n'ont pas de son, et les sons dont le reward a disparu", async () => {
    const { library, twitch, entries } = setup();
    twitch.remote.push(
      remoteReward("clash", "Clasher Fenysk"),
      remoteReward("wake", "Réveiller Jean-Renard"),
    );
    await library.create(draft({ rewardId: "wake" }));
    entries.set("sound009", { sound: { ...legacy, rewardId: "disparu" }, file: wav(), version: 1 });
    const result = await library.listRewards();
    expect(result).toEqual({
      ok: true,
      value: { choices: [remoteReward("clash", "Clasher Fenysk")], missing: ["sound009"] },
    });
  });

  it("dit pourquoi Twitch ne donne pas la liste, sans toucher aux sons", async () => {
    const { library, twitch, entries } = setup();
    entries.set("sound009", { sound: legacy, file: wav(), version: 1 });
    twitch.failures.set("list", { status: 401, message: "Twitch n'est pas prêt." });
    expect(await library.listRewards()).toEqual({
      ok: false,
      status: 422,
      issues: [{ path: "", message: "Twitch n'est pas prêt." }],
    });
  });

  it("relit le titre, le coût et la pace de Twitch pour un son relié à un reward que l'app ne gère pas, et seulement pour lui", async () => {
    const { library, twitch, entries } = setup();
    twitch.remote.push(remoteReward("clash", "Clasher Fenysk"));
    await library.create(draft({ rewardId: "clash" }));
    await library.create(draft({ title: "Rire" }));
    twitch.remote.splice(
      0,
      1,
      remoteReward("clash", "Clasher le chat", { cost: 500, pace: 0 }),
      remoteReward("reward-2", "Rire de Twitch", { cost: 1, isManageable: true }),
    );
    await library.listRewards();
    expect(entries.get("sound001")?.sound).toMatchObject({ title: "Clasher le chat", cost: 500, pace: 0 });
    expect(entries.get("sound002")?.sound).toMatchObject({ title: "Rire", cost: 100 });
  });

  it("garde le son avec le titre, le coût et la pace de Twitch (pas ceux du formulaire), sans créer de reward", async () => {
    const { library, twitch, entries } = setup();
    twitch.remote.push(remoteReward("clash", "Clasher Fenysk", { cost: 300, pace: 90 }));
    const result = await library.create(draft({ title: "Autre", cost: 1, pace: 1, rewardId: "clash" }));
    expect(result).toEqual({
      ok: true,
      value: {
        id: "sound001",
        title: "Clasher Fenysk",
        cost: 300,
        pace: 90,
        fader: 80,
        version: "1",
        hasReward: true,
        isManaged: false,
      },
    });
    expect(entries.get("sound001")?.sound).toMatchObject({ rewardId: "clash", isManaged: false });
    expect(twitch.calls.map(({ name }) => name)).toEqual(["list"]);
  });

  it("tient pour géré un reward de la liste que l'app a créé", async () => {
    const { library, twitch } = setup();
    twitch.remote.push(remoteReward("mien", "Créé par l'app", { isManageable: true }));
    const result = await library.create(draft({ rewardId: "mien" }));
    expect(result).toMatchObject({ ok: true, value: { isManaged: true } });
  });

  it("refuse un reward qui a déjà un son, un reward qui n'existe plus, et un Twitch qui ne répond pas", async () => {
    const { library, twitch, entries } = setup();
    twitch.remote.push(remoteReward("clash", "Clasher Fenysk"));
    expect((await library.create(draft({ rewardId: "clash" }))).ok).toBe(true);
    expect(await library.create(draft({ title: "Bis", rewardId: "clash" }))).toEqual({
      ok: false,
      status: 422,
      issues: [{ path: "rewardId", message: "cette récompense a déjà un son" }],
    });
    expect(await library.create(draft({ title: "Ter", rewardId: "disparu" }))).toEqual({
      ok: false,
      status: 422,
      issues: [{ path: "rewardId", message: "cette récompense n'existe plus sur Twitch" }],
    });
    twitch.failures.set("list", { status: 0, message: "Twitch ne répond pas." });
    expect(await library.create(draft({ title: "Quater", rewardId: "clash" }))).toMatchObject({
      ok: false,
      status: 502,
    });
    expect(entries.size).toBe(1);
  });

  it("ne change que le fichier et le fader d'un son relié à un reward que l'app ne gère pas : aucun appel à Twitch", async () => {
    const { library, twitch, entries } = setup();
    twitch.remote.push(remoteReward("clash", "Clasher Fenysk", { cost: 300, pace: 90 }));
    await library.create(draft({ rewardId: "clash" }));
    twitch.calls.length = 0;
    const result = await library.update(
      "sound001",
      draft({ title: "Pirate", cost: 5, pace: 0, fader: 10, file: ogg() }),
    );
    expect(result).toMatchObject({
      ok: true,
      value: { title: "Clasher Fenysk", cost: 300, pace: 90, fader: 10, isManaged: false },
    });
    expect(entries.get("sound001")?.sound.format).toBe("ogg");
    expect(twitch.calls).toEqual([]);
  });

  it("supprime le son sans supprimer son reward : aucun appel à Twitch, et la queue est prévenue", async () => {
    const { library, twitch, deleted } = setup();
    twitch.remote.push(remoteReward("clash", "Clasher Fenysk"));
    await library.create(draft({ rewardId: "clash" }));
    twitch.calls.length = 0;
    expect((await library.delete("sound001")).ok).toBe(true);
    expect(twitch.calls).toEqual([]);
    expect(deleted).toEqual(["sound001"]);
    expect(library.list()).toEqual([]);
  });

  it("ne remet en route ni ne met en pause un reward que l'app ne gère pas, et ne rembourse rien", async () => {
    const { library, twitch } = setup();
    twitch.remote.push(remoteReward("clash", "Clasher Fenysk"));
    await library.create(draft({ rewardId: "clash" }));
    await library.create(draft({ title: "Rire" }));
    twitch.calls.length = 0;
    twitch.pending.set("clash", ["red-a"]);
    await library.openRewards();
    await library.pauseRewards();
    const touched = twitch.calls.filter(({ rewardId }) => rewardId === "clash");
    expect(touched).toEqual([]);
    expect(twitch.calls.map(({ name, rewardId }) => `${name}:${rewardId}`)).toEqual([
      "update:reward-1",
      "listPending:reward-1",
      "update:reward-1",
    ]);
  });
});

import { describe, expect, it } from "vitest";
import type { RewardRecordsFile } from "../domain/reward.schema";
import type { RewardChoice } from "../domain/reward.types";
import {
  createRewardLibrary,
  type RewardPort,
  type RewardRecordStore,
  type RewardResult,
} from "./reward.usecase";

// Un faux Twitch : il note chaque appel dans `events` (avec les autres acteurs, de quoi vérifier l'ordre) et refuse l'appel dont
// le test a posé l'échec.
const createFakeTwitch = (events: string[]) => {
  const failures = new Map<string, { status: number; message: string }>();
  const remote: RewardChoice[] = [];
  let nextId = 0;
  const answer = <Value>(name: string, value: Value): RewardResult<Value> => {
    const failure = failures.get(name);
    return failure ? { ok: false, ...failure } : { ok: true, value };
  };
  const twitch: RewardPort = {
    async list() {
      events.push("twitch:list");
      return answer("list", [...remote]);
    },
    async create(fields) {
      events.push(`twitch:create:${JSON.stringify(fields)}`);
      nextId += 1;
      return answer("create", `reward-${nextId}`);
    },
    async update(rewardId, change) {
      events.push(`twitch:update:${rewardId}:${JSON.stringify(change)}`);
      return answer("update", null);
    },
    async delete(rewardId) {
      events.push(`twitch:delete:${rewardId}`);
      return answer("delete", null);
    },
    async listPending(rewardId) {
      events.push(`twitch:listPending:${rewardId}`);
      return answer("listPending", []);
    },
    async settle(redemption, status) {
      events.push(`twitch:settle:${redemption.id}:${status}`);
      return answer("settle", null);
    },
  };
  return { twitch, failures, remote };
};

const remoteReward = (id: string, title: string, overrides: Partial<RewardChoice> = {}): RewardChoice => ({
  id,
  title,
  cost: 200,
  pace: 60,
  isManageable: false,
  ...overrides,
});

const setup = (records: RewardRecordsFile = {}, existingSounds: readonly string[] = ["rire0001"]) => {
  const events: string[] = [];
  const fake = createFakeTwitch(events);
  const disk = { file: records, writes: 0, failure: undefined as Error | undefined };
  const store: RewardRecordStore = {
    get: () => disk.file,
    update(next) {
      if (disk.failure) throw disk.failure;
      disk.writes += 1;
      disk.file = next;
    },
  };
  const logs: string[] = [];
  const library = createRewardLibrary({
    store,
    twitch: fake.twitch,
    sounds: {
      get: (id) => (existingSounds.includes(id) ? { id, title: id, fader: 80, version: "1" } : undefined),
    },
    onDelete: async (rewardId) => {
      events.push(`queue:forget:${rewardId}`);
    },
    clearPhrases: async (rewardId) => {
      events.push(`phrases:clear:${rewardId}`);
    },
    log: (line) => logs.push(line),
  });
  return { library, events, disk, logs, ...fake };
};

describe("createRewardLibrary : lister les rewards de la chaîne", () => {
  it("joint ceux de Twitch à rewards.json : le sound de chacun et s'il est géré, par titre", async () => {
    const { library, remote } = setup({
      clash: { title: "Clasher Fenysk", sound: "rire0001", isManaged: false },
      mien: { title: "Rire", sound: null, isManaged: true },
    });
    remote.push(
      remoteReward("mien", "Rire", { cost: 100, pace: 30, isManageable: true }),
      remoteReward("clash", "Clasher Fenysk"),
      remoteReward("hydrate", "Hydrate-toi", { cost: 50, pace: 0 }),
    );
    expect(await library.list()).toEqual({
      ok: true,
      value: [
        {
          id: "clash",
          title: "Clasher Fenysk",
          cost: 200,
          pace: 60,
          isManaged: false,
          isMissing: false,
          sound: "rire0001",
        },
        {
          id: "hydrate",
          title: "Hydrate-toi",
          cost: 50,
          pace: 0,
          isManaged: false,
          isMissing: false,
          sound: null,
        },
        { id: "mien", title: "Rire", cost: 100, pace: 30, isManaged: true, isMissing: false, sound: null },
      ],
    });
  });

  it("montre à la fin le reward de rewards.json que Twitch ne connaît plus, avec son dernier titre", async () => {
    const { library, remote } = setup({
      perdu: { title: "Hydrate-toi", sound: "rire0001", isManaged: false },
      mien: { title: "Rire", sound: null, isManaged: true },
    });
    remote.push(remoteReward("zut", "Zut"));
    const result = await library.list();
    expect(result.ok && result.value.map(({ id, isMissing }) => [id, isMissing])).toEqual([
      ["zut", false],
      ["perdu", true],
      ["mien", true],
    ]);
    expect(result).toMatchObject({
      value: [{}, { title: "Hydrate-toi", sound: "rire0001" }, { title: "Rire", isManaged: true }],
    });
  });

  it("ne montre pas comme son celui qui a disparu du disque", async () => {
    const { library, remote } = setup({ clash: { title: "Clash", sound: "disparu1", isManaged: false } });
    remote.push(remoteReward("clash", "Clash"));
    expect(await library.list()).toMatchObject({ ok: true, value: [{ id: "clash", sound: null }] });
  });

  it("relit dans rewards.json le titre que Twitch a changé, et n'écrit rien quand il n'a pas changé", async () => {
    const { library, remote, disk } = setup({
      clash: { title: "Ancien titre", sound: "rire0001", isManaged: false },
      mien: { title: "Rire", sound: null, isManaged: true },
    });
    remote.push(
      remoteReward("clash", "Clasher le chat"),
      remoteReward("mien", "Rire", { isManageable: true }),
    );
    await library.list();
    expect(disk.file.clash?.title).toBe("Clasher le chat");
    expect(disk.writes).toBe(1);
    await library.list();
    expect(disk.writes).toBe(1);
  });

  it("dit pourquoi Twitch ne donne pas la liste : 422 pour un refus, 502 quand il ne répond pas", async () => {
    const { library, failures } = setup();
    failures.set("list", { status: 401, message: "Twitch n'est pas prêt." });
    expect(await library.list()).toEqual({
      ok: false,
      status: 422,
      issues: [{ path: "", message: "Twitch n'est pas prêt." }],
    });
    failures.set("list", { status: 0, message: "Twitch ne répond pas." });
    expect(await library.list()).toMatchObject({ ok: false, status: 502 });
  });
});

describe("createRewardLibrary : créer un reward", () => {
  it("le crée sur Twitch d'abord, puis garde son enregistrement géré, avec son sound", async () => {
    const { library, events, disk, logs } = setup();
    const result = await library.create({ title: "Rire", cost: 250, pace: 45, sound: "rire0001" });
    expect(result).toEqual({
      ok: true,
      value: {
        id: "reward-1",
        title: "Rire",
        cost: 250,
        pace: 45,
        isManaged: true,
        isMissing: false,
        sound: "rire0001",
      },
    });
    expect(events).toEqual(['twitch:create:{"title":"Rire","cost":250,"pace":45}']);
    expect(disk.file).toEqual({ "reward-1": { title: "Rire", sound: "rire0001", isManaged: true } });
    expect(logs).toContain("Récompense « Rire » créée sur Twitch (reward-1).");
  });

  it("le crée sans sound quand le formulaire n'en choisit pas : l'enregistrement existe, parce que l'app l'a créé", async () => {
    const { library, disk } = setup();
    await library.create({ title: "Muet", cost: 100, pace: 0, sound: null });
    expect(disk.file).toEqual({ "reward-1": { title: "Muet", sound: null, isManaged: true } });
  });

  it("refuse un sound qui n'existe pas sans rien demander à Twitch", async () => {
    const { library, events } = setup();
    expect(await library.create({ title: "Rire", cost: 100, pace: 30, sound: "inconnu" })).toEqual({
      ok: false,
      status: 422,
      issues: [{ path: "sound", message: "ce son n'existe pas" }],
    });
    expect(events).toEqual([]);
  });

  it("ne garde rien quand Twitch refuse, et répète son refus en français", async () => {
    const { library, failures, disk } = setup();
    failures.set("create", {
      status: 400,
      message: "Twitch refuse ce titre : une récompense le porte déjà.",
    });
    expect(await library.create({ title: "Rire", cost: 100, pace: 30, sound: null })).toEqual({
      ok: false,
      status: 422,
      issues: [{ path: "", message: "Twitch refuse ce titre : une récompense le porte déjà." }],
    });
    expect(disk.file).toEqual({});
    failures.set("create", { status: 0, message: "Twitch ne répond pas." });
    expect(await library.create({ title: "Rire", cost: 100, pace: 30, sound: null })).toMatchObject({
      ok: false,
      status: 502,
    });
  });

  it("retire le reward de Twitch quand le disque n'a pas pu garder son enregistrement", async () => {
    const { library, disk, events } = setup();
    disk.failure = new Error("disque plein");
    expect(await library.create({ title: "Rire", cost: 100, pace: 30, sound: null })).toEqual({
      ok: false,
      status: 422,
      issues: [{ path: "", message: "rien n'est enregistré : disque plein" }],
    });
    expect(events.map((line) => line.split(":").slice(0, 2).join(":"))).toEqual([
      "twitch:create",
      "twitch:delete",
    ]);
    expect(events.at(-1)).toBe("twitch:delete:reward-1");
  });
});

describe("createRewardLibrary : modifier un reward", () => {
  it("change le titre, le coût et la pace d'un reward géré sur Twitch, et garde son sound", async () => {
    const { library, events, disk } = setup({ mien: { title: "Rire", sound: "rire0001", isManaged: true } });
    const result = await library.update("mien", { title: "Fou rire", cost: 500, pace: 0 });
    expect(result).toEqual({
      ok: true,
      value: {
        id: "mien",
        title: "Fou rire",
        cost: 500,
        pace: 0,
        isManaged: true,
        isMissing: false,
        sound: "rire0001",
      },
    });
    expect(events).toEqual(['twitch:update:mien:{"title":"Fou rire","cost":500,"pace":0}']);
    expect(disk.file.mien).toEqual({ title: "Fou rire", sound: "rire0001", isManaged: true });
  });

  it("refuse un reward fait sur Twitch, ou inconnu de l'app, sans rien demander à Twitch", async () => {
    const { library, events } = setup({ clash: { title: "Clash", sound: "rire0001", isManaged: false } });
    const refusal = {
      ok: false,
      status: 422,
      issues: [{ path: "", message: "cette récompense a été faite sur Twitch : elle se modifie là-bas." }],
    };
    expect(await library.update("clash", { title: "Autre", cost: 1, pace: 0 })).toEqual(refusal);
    expect(await library.update("inconnu", { title: "Autre", cost: 1, pace: 0 })).toEqual(refusal);
    expect(events).toEqual([]);
  });

  it("ne change rien ici quand Twitch refuse le nouveau titre", async () => {
    const { library, failures, disk } = setup({ mien: { title: "Rire", sound: null, isManaged: true } });
    failures.set("update", {
      status: 400,
      message: "Twitch refuse ce titre : une récompense le porte déjà.",
    });
    expect(await library.update("mien", { title: "Pris", cost: 100, pace: 30 })).toEqual({
      ok: false,
      status: 422,
      issues: [{ path: "", message: "Twitch refuse ce titre : une récompense le porte déjà." }],
    });
    expect(disk.file.mien?.title).toBe("Rire");
  });

  it("réussit quand seul le disque échoue pour le titre, et le dit : Twitch est à jour, le titre se relira", async () => {
    const { library, disk, logs } = setup({ mien: { title: "Rire", sound: null, isManaged: true } });
    disk.failure = new Error("disque plein");
    expect(await library.update("mien", { title: "Fou rire", cost: 100, pace: 30 })).toMatchObject({
      ok: true,
      value: { title: "Fou rire" },
    });
    expect(logs).toContain("Récompense « Fou rire » : titre non gardé (disque plein).");
  });
});

describe("createRewardLibrary : supprimer un reward", () => {
  it("rend les points en attente, supprime le reward de Twitch, puis son enregistrement et ses phrases, dans cet ordre", async () => {
    const { library, events, disk, logs } = setup({
      mien: { title: "Rire", sound: "rire0001", isManaged: true },
      autre: { title: "Autre", sound: "rire0001", isManaged: false },
    });
    expect(await library.delete("mien")).toEqual({ ok: true, value: undefined });
    expect(events).toEqual(["queue:forget:mien", "twitch:delete:mien", "phrases:clear:mien"]);
    expect(disk.file).toEqual({ autre: { title: "Autre", sound: "rire0001", isManaged: false } });
    expect(logs).toContain("Récompense « Rire » supprimée (mien).");
  });

  it("refuse un reward fait sur Twitch, ou inconnu : rien n'est rendu, rien n'est supprimé", async () => {
    const { library, events, disk } = setup({
      clash: { title: "Clash", sound: "rire0001", isManaged: false },
    });
    const refusal = {
      ok: false,
      status: 422,
      issues: [{ path: "", message: "cette récompense a été faite sur Twitch : elle se supprime là-bas." }],
    };
    expect(await library.delete("clash")).toEqual(refusal);
    expect(await library.delete("inconnu")).toEqual(refusal);
    expect(events).toEqual([]);
    expect(disk.file.clash).toBeDefined();
  });

  it("garde l'enregistrement et les phrases quand Twitch refuse de supprimer", async () => {
    const { library, failures, disk, events } = setup({
      mien: { title: "Rire", sound: null, isManaged: true },
    });
    failures.set("delete", { status: 403, message: "Twitch refuse : pas la bonne application." });
    expect(await library.delete("mien")).toMatchObject({ ok: false, status: 422 });
    expect(disk.file.mien).toBeDefined();
    expect(events).not.toContain("phrases:clear:mien");
  });

  it("nettoie quand même un reward que Twitch ne connaît plus (supprimé à la main)", async () => {
    const { library, failures, disk, events } = setup({
      mien: { title: "Rire", sound: null, isManaged: true },
    });
    failures.set("delete", { status: 404, message: "inconnu" });
    expect((await library.delete("mien")).ok).toBe(true);
    expect(disk.file).toEqual({});
    expect(events).toContain("phrases:clear:mien");
  });

  it("dit qu'une panne du disque a supprimé le reward de Twitch mais pas de l'app, et garde les phrases", async () => {
    const { library, disk, events } = setup({ mien: { title: "Rire", sound: null, isManaged: true } });
    disk.failure = new Error("disque plein");
    expect(await library.delete("mien")).toEqual({
      ok: false,
      status: 422,
      issues: [
        { path: "", message: "la récompense est supprimée de Twitch, mais pas de l'app : disque plein" },
      ],
    });
    expect(events).toEqual(["queue:forget:mien", "twitch:delete:mien"]);
  });

  it("laisse son sound où il est : seuls l'enregistrement du reward et ses phrases partent", async () => {
    const { library, disk } = setup({ mien: { title: "Rire", sound: "rire0001", isManaged: true } });
    await library.delete("mien");
    expect(Object.keys(disk.file)).toEqual([]);
    expect(Object.values(disk.file).some(({ sound }) => sound === "rire0001")).toBe(false);
  });
});

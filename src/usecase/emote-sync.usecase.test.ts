import { describe, expect, it } from "vitest";
import {
  type EmoteProvider,
  type EmoteScope,
  type StoredEmotes,
  toEmptyLists,
} from "../domain/emote-sync.rules";
import {
  createEmoteSync,
  EMOTE_SYNC_PERIOD_MS,
  type EmoteAnswer,
  type EmotePort,
  type EmoteStorePort,
} from "./emote-sync.usecase";

// Les réponses des six listes, dans la forme de chaque service ; un faux réseau, jamais le vrai.
const answers = (): Record<string, EmoteAnswer | Error> => ({
  "7tv:global": { kind: "found", json: { emotes: [{ name: "EZ" }, { name: "Clap" }] } },
  "7tv:channel": { kind: "missing" },
  "bttv:global": { kind: "found", json: [{ code: "monkaS" }, { code: "Clap" }] },
  "bttv:channel": { kind: "missing" },
  "ffz:global": {
    kind: "found",
    json: JSON.parse('{ "default_sets": [3], "sets": { "3": { "emoticons": [{ "name": "ZreknarF" }] } } }'),
  },
  "ffz:channel": { kind: "missing" },
});

const setup = (options: { stored?: StoredEmotes; table?: Record<string, EmoteAnswer | Error> } = {}) => {
  const table = options.table ?? answers();
  const calls: string[] = [];
  const logs: string[] = [];
  const saved: StoredEmotes[] = [];
  const timers: { ms: number; callback: () => void; isCancelled: boolean }[] = [];
  const state = { now: 1_000, stored: options.stored };
  const port: EmotePort = {
    async get(provider: EmoteProvider, scope: EmoteScope) {
      calls.push(`${provider}:${scope}`);
      const answer = table[`${provider}:${scope}`];
      if (answer === undefined) throw new Error("aucune réponse prévue");
      if (answer instanceof Error) throw answer;
      return answer;
    },
  };
  const store: EmoteStorePort = {
    get: () => state.stored,
    update(stored) {
      saved.push(stored);
      state.stored = stored;
    },
  };
  const sync = createEmoteSync({
    port,
    store,
    clock: () => state.now,
    schedule: (callback, ms) => {
      const timer = { ms, callback, isCancelled: false };
      timers.push(timer);
      return () => {
        timer.isCancelled = true;
      };
    },
    log: (line) => logs.push(line),
  });
  const pending = () => timers.filter(({ isCancelled }) => !isCancelled);
  // L'heure suivante arrive : le minuteur le plus ancien se déclenche, et la synchro qu'il lance se finit.
  const runNextHour = async () => {
    const timer = pending()[0];
    if (!timer) throw new Error("aucune synchro programmée");
    timer.isCancelled = true;
    state.now += timer.ms;
    timer.callback();
    for (let turn = 0; turn < 20; turn += 1) await Promise.resolve();
  };
  return { sync, table, calls, logs, saved, timers, pending, runNextHour, state };
};

describe("createEmoteSync : au démarrage", () => {
  it("demande les six listes : globales et chaîne de 7TV, BTTV et FFZ", async () => {
    const { sync, calls } = setup();
    await sync.start();
    expect(calls.sort()).toEqual([
      "7tv:channel",
      "7tv:global",
      "bttv:channel",
      "bttv:global",
      "ffz:channel",
      "ffz:global",
    ]);
  });

  it("rend les noms synchronisés, chacun une seule fois", async () => {
    const { sync } = setup();
    await sync.start();
    expect(sync.getNames()).toEqual(["EZ", "Clap", "monkaS", "ZreknarF"]);
  });

  it("écrit une ligne avec le nombre d'emotes de chaque service", async () => {
    const { sync, logs } = setup();
    await sync.start();
    expect(logs).toEqual(["Emotes : 7TV 2, BTTV 2, FFZ 1 (globales et de la chaîne)."]);
  });

  it("garde les listes reçues dans data/ pour la prochaine fois", async () => {
    const { sync, saved } = setup();
    await sync.start();
    expect(saved).toHaveLength(1);
    expect(saved[0]?.savedAt).toBe(1_000);
    expect(saved[0]?.lists["7tv"].global).toEqual(["EZ", "Clap"]);
    expect(saved[0]?.lists.ffz.global).toEqual(["ZreknarF"]);
  });

  it("ne tient pas un 404 pour une erreur : la chaîne n'a pas d'emotes, rien n'est signalé", async () => {
    const { sync, logs } = setup();
    await sync.start();
    expect(logs.some((line) => line.includes("incomplète"))).toBe(false);
    expect(sync.getNames()).not.toContain("undefined");
  });

  it("prend les emotes de la chaîne quand elle en a", async () => {
    const table = answers();
    table["7tv:channel"] = {
      kind: "found",
      json: JSON.parse('{ "emote_set": { "emotes": [{ "name": "FenyHype" }] } }'),
    };
    table["bttv:channel"] = {
      kind: "found",
      json: { channelEmotes: [{ code: "FenyWave" }], sharedEmotes: [] },
    };
    table["ffz:channel"] = { kind: "found", json: { sets: { "9": { emoticons: [{ name: "FenyFFZ" }] } } } };
    const { sync, logs } = setup({ table });
    await sync.start();
    expect(sync.getNames()).toEqual(["EZ", "Clap", "FenyHype", "monkaS", "FenyWave", "ZreknarF", "FenyFFZ"]);
    expect(logs).toEqual(["Emotes : 7TV 3, BTTV 3, FFZ 2 (globales et de la chaîne)."]);
  });
});

describe("createEmoteSync : toutes les heures", () => {
  it("programme la prochaine synchro dans 1 h, et recommence à chaque fois", async () => {
    const { sync, pending, calls, runNextHour } = setup();
    await sync.start();
    expect(pending()).toHaveLength(1);
    expect(pending()[0]?.ms).toBe(EMOTE_SYNC_PERIOD_MS);
    expect(EMOTE_SYNC_PERIOD_MS).toBe(3_600_000);
    await runNextHour();
    expect(calls).toHaveLength(12);
    expect(pending()).toHaveLength(1);
    await runNextHour();
    expect(calls).toHaveLength(18);
  });

  it("prend en compte une emote ajoutée entre deux synchros, et écrit la nouvelle ligne de comptes", async () => {
    const { sync, table, logs, saved, runNextHour } = setup();
    await sync.start();
    table["7tv:global"] = {
      kind: "found",
      json: { emotes: [{ name: "EZ" }, { name: "Clap" }, { name: "Nouvelle" }] },
    };
    await runNextHour();
    expect(sync.getNames()).toContain("Nouvelle");
    expect(logs.at(-1)).toBe("Emotes : 7TV 3, BTTV 2, FFZ 1 (globales et de la chaîne).");
    expect(saved).toHaveLength(2);
  });

  it("n'écrit ni ligne ni fichier quand rien n'a changé", async () => {
    const { sync, logs, saved, runNextHour } = setup();
    await sync.start();
    await runNextHour();
    expect(logs).toHaveLength(1);
    expect(saved).toHaveLength(1);
  });

  it("s'arrête avec le serveur : plus de minuteur, plus de synchro", async () => {
    const { sync, pending, calls } = setup();
    await sync.start();
    sync.stop();
    expect(pending()).toHaveLength(0);
    expect(calls).toHaveLength(6);
  });
});

describe("createEmoteSync : hors ligne ou service en panne", () => {
  const stored: StoredEmotes = {
    savedAt: 500,
    lists: {
      ...toEmptyLists(),
      "7tv": { global: ["EZ", "Gardée7tv"], channel: [] },
      bttv: { global: ["monkaS"], channel: ["GardéeBttv"] },
    },
  };

  it("reprend les dernières listes gardées avant même la première synchro", async () => {
    const table = Object.fromEntries(Object.keys(answers()).map((key) => [key, new Error("fetch failed")]));
    const { sync } = setup({ stored, table });
    expect(sync.getNames()).toEqual(["EZ", "Gardée7tv", "monkaS", "GardéeBttv"]);
  });

  it("garde les dernières listes quand tout le réseau tombe, et le dit en une ligne", async () => {
    const table = Object.fromEntries(Object.keys(answers()).map((key) => [key, new Error("fetch failed")]));
    const { sync, logs, saved } = setup({ stored, table });
    await sync.start();
    expect(sync.getNames()).toEqual(["EZ", "Gardée7tv", "monkaS", "GardéeBttv"]);
    expect(logs[0]).toContain("Emotes : synchronisation incomplète");
    expect(logs[0]).toContain("7TV globales : fetch failed");
    expect(logs[0]).toContain("FFZ de la chaîne : fetch failed");
    expect(logs[0]).toContain("les dernières listes reçues sont gardées");
    expect(saved).toEqual([]);
  });

  it("ne remplace que la liste du service en panne : les autres se mettent à jour", async () => {
    const table = answers();
    table["7tv:global"] = new Error("HTTP 503");
    const { sync, logs } = setup({ stored, table });
    await sync.start();
    expect(sync.getNames()).toEqual(["EZ", "Gardée7tv", "monkaS", "Clap", "ZreknarF"]);
    expect(logs[0]).toContain("7TV globales : HTTP 503");
    expect(logs[0]).not.toContain("BTTV");
  });

  it("ne garde que les emotes à la main quand il n'y a rien de gardé et que le réseau est tombé", async () => {
    const table = Object.fromEntries(Object.keys(answers()).map((key) => [key, new Error("délai dépassé")]));
    const { sync, logs } = setup({ table });
    await sync.start();
    expect(sync.getNames()).toEqual([]);
    expect(logs[0]).toContain("délai dépassé");
    expect(logs.at(-1)).toBe("Emotes : 7TV 0, BTTV 0, FFZ 0 (globales et de la chaîne).");
  });

  it("se rattrape à la synchro suivante, une fois le réseau revenu", async () => {
    const down = Object.fromEntries(Object.keys(answers()).map((key) => [key, new Error("hors ligne")]));
    const { sync, table, runNextHour } = setup({ table: down });
    await sync.start();
    expect(sync.getNames()).toEqual([]);
    Object.assign(table, answers());
    await runNextHour();
    expect(sync.getNames()).toEqual(["EZ", "Clap", "monkaS", "ZreknarF"]);
  });

  it("tient une réponse qui n'a pas la bonne forme pour une panne du service, et garde l'ancienne liste", async () => {
    const table = answers();
    table["bttv:global"] = { kind: "found", json: { message: "maintenance" } };
    const { sync, logs } = setup({ stored, table });
    await sync.start();
    expect(logs[0]).toContain("BTTV globales : réponse illisible");
    expect(sync.getNames()).toContain("monkaS");
  });

  it("ne s'arrête jamais sur une erreur d'écriture du fichier : la synchro continue", async () => {
    const harness = setup();
    const failing: EmoteStorePort = {
      get: () => undefined,
      update() {
        throw new Error("disque plein");
      },
    };
    const sync = createEmoteSync({
      port: { get: async (provider, scope) => harness.table[`${provider}:${scope}`] as EmoteAnswer },
      store: failing,
      clock: () => 0,
      schedule: (callback, ms) => {
        harness.timers.push({ ms, callback, isCancelled: false });
        return () => undefined;
      },
      log: (line) => harness.logs.push(line),
    });
    await sync.start();
    expect(sync.getNames()).toContain("EZ");
    expect(harness.logs.some((line) => line.includes("disque plein"))).toBe(true);
    expect(harness.timers).toHaveLength(1);
  });
});

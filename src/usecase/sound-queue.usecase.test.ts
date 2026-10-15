import { describe, expect, it } from "vitest";
import type { RewardEvent } from "../domain/reward.types";
import type { SoundEvent, SoundSummary } from "../domain/sound.schema";
import { createSoundQueue, MAX_PLAY_MS } from "./sound-queue.usecase";

const sounds = new Map<string, SoundSummary>([
  [
    "rire0001",
    {
      id: "rire0001",
      title: "Rire",
      cost: 100,
      pace: 30,
      fader: 80,
      version: "1.10",
      hasReward: true,
      isManaged: true,
    },
  ],
  [
    "bravo002",
    {
      id: "bravo002",
      title: "Bravo",
      cost: 200,
      pace: 0,
      fader: 35,
      version: "2.20",
      hasReward: true,
      isManaged: true,
    },
  ],
  [
    // Une récompense qu'Alexis a faite sur Twitch : l'app ne la gère pas.
    "clash0004",
    {
      id: "clash0004",
      title: "Clash",
      cost: 300,
      pace: 0,
      fader: 60,
      version: "4.40",
      hasReward: true,
      isManaged: false,
    },
  ],
  [
    "zut00003",
    {
      id: "zut00003",
      title: "Zut",
      cost: 50,
      pace: 10,
      fader: 100,
      version: "3.30",
      hasReward: true,
      isManaged: true,
    },
  ],
]);

// Le reward de chaque son : « reward-rire », « reward-bravo », « reward-zut ».
const rewardOf: Record<string, string> = {
  clash0004: "reward-clash",
  rire0001: "reward-rire",
  bravo002: "reward-bravo",
  zut00003: "reward-zut",
};

const spend = (id: string, soundId = "rire0001"): RewardEvent => ({
  kind: "reward",
  id: id,
  rewardId: rewardOf[soundId] ?? "reward-inconnu",
  title: sounds.get(soundId)?.title ?? "?",
  user: "Alice",
});

const flush = async () => {
  for (let turn = 0; turn < 8; turn += 1) await Promise.resolve();
};

const setup = () => {
  const logs: string[] = [];
  const timers: { ms: number; callback: () => void; isCancelled: boolean }[] = [];
  const settled: string[] = [];
  let ids = 0;
  const library = new Map(sounds);
  // Les sons dont le fichier a disparu du disque.
  const missingFiles = new Set<string>();
  const queue = createSoundQueue({
    library: {
      get: (id) => library.get(id),
      getByReward: (rewardId) => [...library.values()].find(({ id }) => rewardOf[id] === rewardId),
      getAudio: (id) => (missingFiles.has(id) ? undefined : new Uint8Array(1)),
    },
    rewards: {
      async settle(target, status) {
        settled.push(`${target.id}@${target.rewardId}:${status}`);
        return { ok: true, value: null };
      },
    },
    createId: () => {
      ids += 1;
      return `play${ids}`;
    },
    schedule: (callback, ms) => {
      const timer = { ms, callback, isCancelled: false };
      timers.push(timer);
      return () => {
        timer.isCancelled = true;
      };
    },
    log: (line) => logs.push(line),
  });
  // Une page /sounds : tout ce que le serveur lui envoie s'empile dans `events`.
  const connect = () => {
    const events: SoundEvent[] = [];
    const disconnect = queue.subscribe((event) => events.push(event));
    return { events, disconnect };
  };
  const runTimers = (ms: number) => {
    for (const timer of timers.filter((candidate) => !candidate.isCancelled && candidate.ms === ms)) {
      timer.isCancelled = true;
      timer.callback();
    }
  };
  return { queue, logs, library, connect, runTimers, settled, missingFiles };
};

describe("createSoundQueue : demander un son", () => {
  it("refuse quand aucune page /sounds n'est connectée : rien n'est mis en attente", () => {
    const { queue, connect } = setup();
    expect(queue.play("rire0001")).toEqual({
      ok: false,
      status: 409,
      message: "aucune page /sounds n'est connectée : ajoute la source navigateur dans OBS",
    });
    const page = connect();
    expect(page.events).toEqual([]);
  });

  it("refuse un son inconnu", () => {
    const { queue, connect } = setup();
    connect();
    expect(queue.play("inconnu")).toEqual({ ok: false, status: 404, message: "son introuvable" });
  });

  it("envoie le son à la page, avec son fader et sa version", () => {
    const { queue, connect, logs } = setup();
    const page = connect();
    expect(queue.play("bravo002")).toEqual({ ok: true });
    expect(page.events).toEqual([
      { kind: "play", playId: "play1", soundId: "bravo002", version: "2.20", fader: 35 },
    ]);
    expect(logs).toContain("Son « Bravo » : envoyé à la page /sounds.");
  });
});

describe("createSoundQueue : un son après l'autre", () => {
  it("n'envoie le deuxième son qu'une fois le premier fini, jamais en même temps", () => {
    const { queue, connect, logs } = setup();
    const page = connect();
    queue.play("rire0001");
    queue.play("bravo002");
    queue.play("zut00003");
    expect(page.events.map((event) => event.kind)).toEqual(["play"]);
    queue.finish("play1", "ended");
    expect(page.events).toHaveLength(2);
    expect(page.events[1]).toMatchObject({ kind: "play", soundId: "bravo002", playId: "play2" });
    queue.finish("play2", "ended");
    expect(page.events[2]).toMatchObject({ kind: "play", soundId: "zut00003", playId: "play3" });
    queue.finish("play3", "ended");
    expect(page.events).toHaveLength(3);
    expect(logs).toContain("Son « Rire » : fini.");
  });

  it("passe au suivant quand un son rate, et écrit la raison", () => {
    const { queue, connect, logs } = setup();
    const page = connect();
    queue.play("rire0001");
    queue.play("bravo002");
    queue.finish("play1", "failed", "fichier illisible");
    expect(logs).toContain("Son « Rire » : raté (fichier illisible).");
    expect(page.events[1]).toMatchObject({ kind: "play", soundId: "bravo002" });
  });

  it("ignore la réponse d'un son qui n'est pas celui en cours", () => {
    const { queue, connect } = setup();
    const page = connect();
    queue.play("rire0001");
    queue.play("bravo002");
    queue.finish("play2", "ended");
    queue.finish("inconnu", "ended");
    expect(page.events).toHaveLength(1);
    queue.finish("play1", "ended");
    queue.finish("play1", "ended");
    expect(page.events).toHaveLength(2);
  });

  it("saute un son supprimé pendant qu'il attendait", () => {
    const { queue, connect, library } = setup();
    const page = connect();
    queue.play("rire0001");
    queue.play("bravo002");
    queue.play("zut00003");
    library.delete("bravo002");
    queue.finish("play1", "ended");
    expect(page.events[1]).toMatchObject({ kind: "play", soundId: "zut00003" });
  });

  it("rate un son dont la page n'a rien répondu en 10 min, lui dit de se taire, et passe au suivant", () => {
    const { queue, connect, runTimers, logs } = setup();
    const page = connect();
    queue.play("rire0001");
    queue.play("bravo002");
    runTimers(MAX_PLAY_MS);
    expect(page.events[1]).toEqual({ kind: "stop" });
    expect(page.events[2]).toMatchObject({ kind: "play", soundId: "bravo002" });
    expect(logs).toContain("Son « Rire » : raté (la page n'a pas répondu en 10 min).");
  });

  it("n'attend plus la minuterie d'un son fini", () => {
    const { queue, connect, runTimers } = setup();
    const page = connect();
    queue.play("rire0001");
    queue.finish("play1", "ended");
    runTimers(MAX_PLAY_MS);
    expect(page.events).toHaveLength(1);
  });
});

describe("createSoundQueue : couper le son", () => {
  it("dit à la page de se taire, vide la file, et ne joue pas la suite", () => {
    const { queue, connect, logs } = setup();
    const page = connect();
    queue.play("rire0001");
    queue.play("bravo002");
    queue.stop();
    expect(page.events.at(-1)).toEqual({ kind: "stop" });
    queue.finish("play1", "ended");
    expect(page.events.filter((event) => event.kind === "play")).toHaveLength(1);
    expect(logs).toContain("Sons coupés : 1 en cours, 1 en attente.");
  });

  it("laisse jouer le son demandé après la coupure", () => {
    const { queue, connect } = setup();
    const page = connect();
    queue.play("rire0001");
    queue.stop();
    expect(queue.play("bravo002")).toEqual({ ok: true });
    expect(page.events.at(-1)).toMatchObject({ kind: "play", soundId: "bravo002" });
  });
});

describe("createSoundQueue : les pages /sounds", () => {
  it("ne donne le son qu'à la page connectée depuis le plus longtemps : jamais deux fois le même son", () => {
    const { queue, connect } = setup();
    const first = connect();
    const second = connect();
    queue.play("rire0001");
    expect(first.events).toHaveLength(1);
    expect(second.events).toEqual([]);
  });

  it("rate le son en cours quand sa page se ferme, et donne la suite à la page suivante", () => {
    const { queue, connect, logs } = setup();
    const first = connect();
    const second = connect();
    queue.play("rire0001");
    queue.play("bravo002");
    first.disconnect();
    expect(logs).toContain("Son « Rire » : raté (la page /sounds s'est fermée).");
    expect(second.events).toEqual([
      { kind: "play", playId: "play2", soundId: "bravo002", version: "2.20", fader: 35 },
    ]);
  });

  it("vide la file quand la dernière page se ferme : plus personne pour jouer", () => {
    const { queue, connect, logs } = setup();
    const page = connect();
    queue.play("rire0001");
    queue.play("bravo002");
    page.disconnect();
    expect(logs).toContain("Sons en attente retirés : 1 (plus aucune page /sounds).");
    const next = connect();
    expect(next.events).toEqual([]);
  });

  it("ne rate rien quand c'est une page qui n'a pas le son qui se ferme", () => {
    const { queue, connect } = setup();
    const first = connect();
    const second = connect();
    queue.play("rire0001");
    second.disconnect();
    queue.finish("play1", "ended");
    expect(first.events).toHaveLength(1);
  });

  it("se désabonne une seule fois : fermer deux fois ne retire pas une autre page", () => {
    const { queue, connect } = setup();
    const first = connect();
    const second = connect();
    first.disconnect();
    first.disconnect();
    queue.play("rire0001");
    expect(second.events).toHaveLength(1);
  });
});

describe("createSoundQueue : une redemption joue le son de son reward", () => {
  it("met le son en attente, et garde les points (FULFILLED) quand il a joué jusqu'au bout", async () => {
    const { queue, connect, settled, logs } = setup();
    const page = connect();
    queue.redeem(spend("red-1", "bravo002"));
    expect(page.events).toEqual([
      { kind: "play", playId: "play1", soundId: "bravo002", version: "2.20", fader: 35 },
    ]);
    expect(settled).toEqual([]);
    queue.finish("play1", "ended");
    await flush();
    expect(settled).toEqual(["red-1@reward-bravo:FULFILLED"]);
    expect(logs).toContain("Rachat « Bravo » de Alice : points gardés.");
  });

  it("ignore un reward qui n'a pas de son : ce n'est pas le sien", async () => {
    const { queue, connect, settled } = setup();
    const page = connect();
    queue.redeem({ ...spend("red-1"), rewardId: "reward-du-renard" });
    await flush();
    expect(page.events).toEqual([]);
    expect(settled).toEqual([]);
  });

  it("rend les points (CANCELED) quand aucune page /sounds n'est connectée, sans rien mettre en attente", async () => {
    const { queue, connect, settled, logs } = setup();
    queue.redeem(spend("red-1"));
    await flush();
    expect(settled).toEqual(["red-1@reward-rire:CANCELED"]);
    expect(logs).toContain("Rachat « Rire » de Alice : aucune page /sounds n'est connectée.");
    const page = connect();
    expect(page.events).toEqual([]);
  });

  it("rend les points tout de suite quand le fichier du son a disparu du disque, sans rien envoyer à la page", async () => {
    const { queue, connect, settled, logs, missingFiles } = setup();
    const page = connect();
    missingFiles.add("rire0001");
    queue.redeem(spend("red-1"));
    await flush();
    expect(page.events).toEqual([]);
    expect(settled).toEqual(["red-1@reward-rire:CANCELED"]);
    expect(logs).toContain("Rachat « Rire » de Alice : le fichier du son « Rire » manque.");
  });

  it("rend les points quand la page n'a pas pu jouer le son (fichier illisible)", async () => {
    const { queue, connect, settled } = setup();
    connect();
    queue.redeem(spend("red-1"));
    queue.finish("play1", "failed", "fichier illisible");
    await flush();
    expect(settled).toEqual(["red-1@reward-rire:CANCELED"]);
  });

  it("rend les points du son en cours et de ceux qui attendent quand on coupe le son", async () => {
    const { queue, connect, settled } = setup();
    connect();
    queue.redeem(spend("red-1", "rire0001"));
    queue.redeem(spend("red-2", "bravo002"));
    queue.redeem(spend("red-3", "zut00003"));
    queue.stop();
    await flush();
    expect(settled.sort()).toEqual([
      "red-1@reward-rire:CANCELED",
      "red-2@reward-bravo:CANCELED",
      "red-3@reward-zut:CANCELED",
    ]);
  });

  it("rend les points quand la page se ferme en plein son, et de ceux qui attendaient", async () => {
    const { queue, connect, settled } = setup();
    const page = connect();
    queue.redeem(spend("red-1", "rire0001"));
    queue.redeem(spend("red-2", "bravo002"));
    page.disconnect();
    await flush();
    expect(settled.sort()).toEqual(["red-1@reward-rire:CANCELED", "red-2@reward-bravo:CANCELED"]);
  });

  it("rend les points d'un son supprimé pendant son attente, et passe au suivant", async () => {
    const { queue, connect, settled, library } = setup();
    const page = connect();
    queue.redeem(spend("red-1", "rire0001"));
    queue.redeem(spend("red-2", "bravo002"));
    queue.redeem(spend("red-3", "zut00003"));
    library.delete("bravo002");
    queue.finish("play1", "ended");
    await flush();
    expect(settled.sort()).toEqual(["red-1@reward-rire:FULFILLED", "red-2@reward-bravo:CANCELED"]);
    expect(page.events.at(-1)).toMatchObject({ kind: "play", soundId: "zut00003" });
  });

  it("rend les points d'un son resté sans réponse 10 min", async () => {
    const { queue, connect, settled, runTimers } = setup();
    connect();
    queue.redeem(spend("red-1"));
    runTimers(MAX_PLAY_MS);
    await flush();
    expect(settled).toEqual(["red-1@reward-rire:CANCELED"]);
  });

  it("ne marque rien pour « Jouer dans OBS » : aucune redemption derrière", async () => {
    const { queue, connect, settled } = setup();
    connect();
    queue.play("rire0001");
    queue.finish("play1", "ended");
    await flush();
    expect(settled).toEqual([]);
  });

  it("écrit dans le journal des points qu'on n'a pas pu rendre, avec la raison de Twitch", async () => {
    const logs: string[] = [];
    const queue = createSoundQueue({
      library: {
        get: (id) => sounds.get(id),
        getByReward: () => sounds.get("rire0001"),
        getAudio: () => new Uint8Array(1),
      },
      rewards: {
        settle: async () => ({ ok: false, status: 404, message: "Twitch ne connaît plus ce rachat." }),
      },
      createId: () => "play1",
      schedule: () => () => undefined,
      log: (line) => logs.push(line),
    });
    queue.redeem(spend("red-1"));
    await flush();
    expect(logs).toContain(
      "Rachat « Rire » de Alice : points non rendus (Twitch ne connaît plus ce rachat.).",
    );
  });
});

describe("createSoundQueue : supprimer un son", () => {
  it("rembourse ses redemptions en attente, coupe son en cours, et laisse les autres sons", async () => {
    const { queue, connect, settled } = setup();
    const page = connect();
    queue.redeem(spend("red-1", "rire0001"));
    queue.redeem(spend("red-2", "bravo002"));
    queue.redeem(spend("red-3", "rire0001"));
    await queue.forget("rire0001");
    expect(settled.sort()).toEqual(["red-1@reward-rire:CANCELED", "red-3@reward-rire:CANCELED"]);
    expect(page.events.at(-1)).toMatchObject({ kind: "play", soundId: "bravo002" });
    expect(page.events).toContainEqual({ kind: "stop" });
  });

  it("n'attend que ce qui est fini : la réponse arrive une fois les points rendus", async () => {
    const { queue, connect, settled } = setup();
    connect();
    queue.redeem(spend("red-1", "bravo002"));
    queue.redeem(spend("red-2", "bravo002"));
    const done = queue.forget("bravo002");
    await done;
    expect(settled).toHaveLength(2);
  });
});

describe("createSoundQueue : une récompense que l'app ne gère pas", () => {
  it("joue le son au rachat et n'envoie aucun statut à Twitch, même quand il a joué jusqu'au bout", async () => {
    const { queue, connect, settled, logs } = setup();
    const page = connect();
    queue.redeem(spend("red-1", "clash0004"));
    expect(page.events).toEqual([
      { kind: "play", playId: "play1", soundId: "clash0004", version: "4.40", fader: 60 },
    ]);
    queue.finish("play1", "ended");
    await flush();
    expect(settled).toEqual([]);
    expect(logs.some((line) => line.includes("points gardés") || line.includes("points rendus"))).toBe(false);
  });

  it("n'écrit que dans le journal un son qui n'a pas pu jouer : points non rendus, aucun statut", async () => {
    const { queue, connect, settled, logs } = setup();
    connect();
    queue.redeem(spend("red-1", "clash0004"));
    queue.finish("play1", "failed", "fichier illisible");
    await flush();
    expect(settled).toEqual([]);
    expect(logs).toContain(
      "Rachat « Clash » de Alice : le son n'a pas joué, les points ne sont pas rendus (récompense faite sur Twitch : l'app ne peut pas).",
    );
  });

  it("n'envoie aucun statut quand aucune page /sounds n'est connectée, quand le fichier manque ou quand on coupe le son", async () => {
    const { queue, connect, settled, missingFiles, logs } = setup();
    queue.redeem(spend("red-1", "clash0004"));
    const page = connect();
    missingFiles.add("clash0004");
    queue.redeem(spend("red-2", "clash0004"));
    missingFiles.clear();
    queue.redeem(spend("red-3", "clash0004"));
    queue.redeem(spend("red-4", "clash0004"));
    queue.stop();
    await flush();
    expect(settled).toEqual([]);
    expect(page.events.at(-1)).toEqual({ kind: "stop" });
    expect(logs.filter((line) => line.includes("les points ne sont pas rendus"))).toHaveLength(4);
  });

  it("garde le statut des récompenses de l'app à côté : le même son se joue, l'autre est marqué", async () => {
    const { queue, connect, settled } = setup();
    connect();
    queue.redeem(spend("red-1", "clash0004"));
    queue.redeem(spend("red-2", "rire0001"));
    queue.finish("play1", "ended");
    queue.finish("play2", "ended");
    await flush();
    expect(settled).toEqual(["red-2@reward-rire:FULFILLED"]);
  });

  it("ne marque rien en supprimant le son : ses rachats en attente restent comme Twitch les a", async () => {
    const { queue, connect, settled } = setup();
    connect();
    queue.redeem(spend("red-1", "clash0004"));
    queue.redeem(spend("red-2", "clash0004"));
    await queue.forget("clash0004");
    expect(settled).toEqual([]);
  });
});

// La phrase du renard qui suit le son : `afterSound` rend vrai quand elle a été dite. On la finit à la main.
const createPhrase = () => {
  const calls = { count: 0 };
  let finish: (isSaid: boolean) => void = () => undefined;
  const afterSound = () =>
    new Promise<boolean>((resolve) => {
      calls.count += 1;
      finish = resolve;
    });
  return { calls, afterSound, say: (isSaid: boolean) => finish(isSaid) };
};

describe("createSoundQueue : la phrase du renard suit le son", () => {
  it("dit si la récompense a un son : vrai quand c'est le sien, faux sinon", () => {
    const { queue, connect } = setup();
    connect();
    expect(queue.redeem(spend("red-1", "rire0001"))).toBe(true);
    expect(queue.redeem({ ...spend("red-2"), rewardId: "reward-du-renard" })).toBe(false);
  });

  it("garde les points dès que le son a fini, puis lance la phrase sans l'attendre", async () => {
    const { queue, connect, settled } = setup();
    const phrase = createPhrase();
    connect();
    queue.redeem(spend("red-1", "rire0001"), phrase.afterSound);
    expect(phrase.calls.count).toBe(0);
    queue.finish("play1", "ended");
    await flush();
    expect(phrase.calls.count).toBe(1);
    expect(settled).toEqual(["red-1@reward-rire:FULFILLED"]);
  });

  it("garde les points si le son a raté mais que la phrase est dite : ils attendent la phrase", async () => {
    const { queue, connect, settled } = setup();
    const phrase = createPhrase();
    connect();
    queue.redeem(spend("red-1", "rire0001"), phrase.afterSound);
    queue.finish("play1", "failed", "fichier illisible");
    await flush();
    expect(phrase.calls.count).toBe(1);
    expect(settled).toEqual([]);
    phrase.say(true);
    await flush();
    expect(settled).toEqual(["red-1@reward-rire:FULFILLED"]);
  });

  it("rend les points seulement si le son a raté et que la phrase n'a pas pu être dite non plus", async () => {
    const { queue, connect, settled } = setup();
    const phrase = createPhrase();
    connect();
    queue.redeem(spend("red-1", "rire0001"), phrase.afterSound);
    queue.finish("play1", "failed", "fichier illisible");
    await flush();
    phrase.say(false);
    await flush();
    expect(settled).toEqual(["red-1@reward-rire:CANCELED"]);
  });

  it("lance la phrase quand aucune page /sounds n'est connectée, ou que le fichier manque", async () => {
    const { queue, connect, settled, missingFiles } = setup();
    const noPage = createPhrase();
    queue.redeem(spend("red-1", "rire0001"), noPage.afterSound);
    await flush();
    expect(noPage.calls.count).toBe(1);
    noPage.say(true);
    connect();
    const noFile = createPhrase();
    missingFiles.add("bravo002");
    queue.redeem(spend("red-2", "bravo002"), noFile.afterSound);
    await flush();
    expect(noFile.calls.count).toBe(1);
    noFile.say(false);
    await flush();
    expect(settled.sort()).toEqual(["red-1@reward-rire:FULFILLED", "red-2@reward-bravo:CANCELED"]);
  });

  it("lance la phrase d'un son raté parce que la page se ferme, ou resté sans réponse 10 min", async () => {
    const { queue, connect, runTimers } = setup();
    const closed = createPhrase();
    const page = connect();
    queue.redeem(spend("red-1", "rire0001"), closed.afterSound);
    page.disconnect();
    await flush();
    expect(closed.calls.count).toBe(1);
    const silent = createPhrase();
    connect();
    queue.redeem(spend("red-2", "bravo002"), silent.afterSound);
    runTimers(MAX_PLAY_MS);
    await flush();
    expect(silent.calls.count).toBe(1);
  });

  it("ne dit aucune phrase quand on coupe le son ou qu'on supprime le son : couper demande le silence", async () => {
    const { queue, connect, settled } = setup();
    const cut = createPhrase();
    connect();
    queue.redeem(spend("red-1", "rire0001"), cut.afterSound);
    queue.redeem(spend("red-2", "bravo002"), cut.afterSound);
    queue.stop();
    await flush();
    queue.redeem(spend("red-3", "zut00003"), cut.afterSound);
    await queue.forget("zut00003");
    expect(cut.calls.count).toBe(0);
    expect(settled.sort()).toEqual([
      "red-1@reward-rire:CANCELED",
      "red-2@reward-bravo:CANCELED",
      "red-3@reward-zut:CANCELED",
    ]);
  });

  it("n'envoie aucun statut pour une récompense que l'app ne gère pas, la phrase dite ou non", async () => {
    const { queue, connect, settled } = setup();
    const said = createPhrase();
    connect();
    queue.redeem(spend("red-1", "clash0004"), said.afterSound);
    queue.finish("play1", "failed", "fichier illisible");
    await flush();
    said.say(true);
    const unsaid = createPhrase();
    queue.redeem(spend("red-2", "clash0004"), unsaid.afterSound);
    queue.finish("play2", "failed", "fichier illisible");
    await flush();
    unsaid.say(false);
    await flush();
    expect(said.calls.count).toBe(1);
    expect(unsaid.calls.count).toBe(1);
    expect(settled).toEqual([]);
  });

  it("ne change rien sans phrase : le son raté rend les points comme avant", async () => {
    const { queue, connect, settled } = setup();
    connect();
    queue.redeem(spend("red-1", "rire0001"));
    queue.finish("play1", "failed", "fichier illisible");
    await flush();
    expect(settled).toEqual(["red-1@reward-rire:CANCELED"]);
  });
});

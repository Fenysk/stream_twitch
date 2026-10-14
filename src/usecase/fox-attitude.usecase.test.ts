import { describe, expect, it } from "vitest";
import type { Attitude, PresenceView } from "../domain/fox.schema";
import type { Settings } from "../domain/settings.schema";
import { createFoxAttitude } from "./fox-attitude.usecase";

const MINUTE = 60_000;

const settings: Settings = {
  obsAddress: "ws://127.0.0.1:4455",
  micName: "Mic/Aux",
  threshold: -40,
  delay: 250,
  foxCheerfulCount: 15,
  foxCheerfulPeriod: 5 * MINUTE,
  foxSulkAfter: 90_000,
  foxResumeAfter: 5 * MINUTE,
  foxResumePhrases: ["Ah, maintenant vous parlez ?"],
};

// Un serveur à la main : l'heure, le pas de 100 ms, la présence, et les humeurs que le renard reçoit.
const setup = (custom: Settings = settings) => {
  const state = {
    now: 1_000_000,
    presence: "visible" as PresenceView,
    tick: (): void => undefined,
    subscribers: 0,
  };
  const attitudes: Attitude[] = [];
  const logs: string[] = [];
  const attitude = createFoxAttitude({
    mode: {
      subscribe(listener) {
        state.tick = listener;
        state.subscribers += 1;
        return () => {
          state.tick = () => undefined;
          state.subscribers -= 1;
        };
      },
    },
    fox: {
      getPresence: () => ({ kind: state.presence, elapsed: 0 }),
      updateAttitude: (next) => attitudes.push(next),
    },
    settings: custom,
    clock: () => state.now,
    random: () => 0,
    log: (line) => logs.push(line),
  });
  attitude.start();
  // Le temps passe de `ms`, par pas de 100 ms comme le contrôleur.
  const wait = (ms: number) => {
    for (let spent = 0; spent < ms; spent += 100) {
      state.now += Math.min(100, ms - spent);
      state.tick();
    }
  };
  const accept = () => attitude.noteMessage({ isAccepted: true });
  const ignore = () => attitude.noteMessage({ isAccepted: false });
  return { attitude, state, attitudes, logs, wait, accept, ignore };
};

describe("createFoxAttitude : boudeur", () => {
  it("boude quand le tchat se tait depuis 90 s, visible, et le dit au journal", () => {
    const { wait, attitudes, logs } = setup();
    wait(89_900);
    expect(attitudes).toEqual([]);
    wait(100);
    expect(attitudes).toEqual(["sulking"]);
    expect(logs).toEqual(["Renard : le tchat se tait, il boude."]);
  });

  it("ne le répète pas à chaque pas", () => {
    const { wait, attitudes } = setup();
    wait(5 * MINUTE);
    expect(attitudes).toEqual(["sulking"]);
  });

  it("redevient ordinaire dès qu'un message arrive, accepté ou non", () => {
    const { wait, accept, ignore, attitudes, logs } = setup();
    wait(2 * MINUTE);
    accept();
    expect(attitudes).toEqual(["sulking", "plain"]);
    wait(2 * MINUTE);
    ignore();
    expect(attitudes).toEqual(["sulking", "plain", "sulking", "plain"]);
    expect(logs.at(-1)).toBe("Renard : il retrouve son humeur ordinaire.");
  });

  it("repart du dernier message : 90 s après lui, pas avant", () => {
    const { wait, accept, attitudes } = setup();
    wait(60_000);
    accept();
    wait(89_900);
    expect(attitudes).toEqual([]);
    wait(100);
    expect(attitudes).toEqual(["sulking"]);
  });

  it("ne boude pas hors de la vue, et ne le fait pas revenir : parti, en train de partir ou de revenir", () => {
    const { wait, state, attitudes } = setup();
    for (const kind of ["away", "leaving", "returning"] as const) {
      state.presence = kind;
      wait(3 * MINUTE);
    }
    expect(attitudes).toEqual([]);
  });

  it("boude dès qu'il redevient visible si le tchat se tait toujours", () => {
    const { wait, state, attitudes } = setup();
    state.presence = "away";
    wait(3 * MINUTE);
    state.presence = "visible";
    wait(100);
    expect(attitudes).toEqual(["sulking"]);
  });

  it("suit le silence réglé en direct", () => {
    const { wait, attitude, attitudes } = setup();
    attitude.update({ ...settings, foxSulkAfter: 30_000 });
    wait(30_000);
    expect(attitudes).toEqual(["sulking"]);
  });
});

describe("createFoxAttitude : joyeux", () => {
  const talk = (count: number, accept: () => void, wait: (ms: number) => void, gap = 10_000) => {
    for (let index = 0; index < count; index += 1) {
      accept();
      wait(gap);
    }
  };

  it("est joyeux à 15 messages acceptés en 5 min, et le dit au journal", () => {
    const { accept, wait, attitudes, logs } = setup();
    talk(14, accept, wait);
    expect(attitudes).toEqual([]);
    accept();
    expect(attitudes).toEqual(["cheerful"]);
    expect(logs).toEqual(["Renard : le tchat s'anime, il est joyeux."]);
  });

  it("ne compte pas les messages que le filtre ignore", () => {
    const { accept, ignore, wait, attitudes } = setup();
    talk(10, accept, wait);
    talk(10, ignore, wait);
    expect(attitudes).toEqual([]);
  });

  it("redevient ordinaire quand les messages sortent de la période, le tchat continuant de parler", () => {
    const { accept, ignore, wait, attitudes } = setup();
    talk(15, accept, wait, 5000);
    expect(attitudes).toEqual(["cheerful"]);
    // Les 15 messages acceptés datent de 0 à 70 s ; des messages ignorés gardent le tchat éveillé. Le premier sort à 5 min.
    for (let index = 0; index < 7; index += 1) {
      ignore();
      wait(30_000);
    }
    expect(attitudes).toEqual(["cheerful"]);
    ignore();
    wait(30_000);
    expect(attitudes).toEqual(["cheerful", "plain"]);
  });

  it("suit le seuil réglé", () => {
    const { accept, wait, attitude, attitudes } = setup();
    attitude.update({ ...settings, foxCheerfulCount: 3 });
    talk(2, accept, wait, 1000);
    expect(attitudes).toEqual([]);
    accept();
    expect(attitudes).toEqual(["cheerful"]);
  });

  it("boude plutôt que de rester joyeux quand le tchat se tait", () => {
    const { accept, wait, attitudes } = setup();
    talk(15, accept, wait, 1000);
    expect(attitudes).toEqual(["cheerful"]);
    wait(90_000);
    expect(attitudes).toEqual(["cheerful", "sulking"]);
  });
});

describe("createFoxAttitude : la reprise", () => {
  it("rend la phrase au premier message accepté après 5 min sans message du tchat", () => {
    const { wait, accept } = setup();
    wait(5 * MINUTE);
    expect(accept()).toBe("Ah, maintenant vous parlez ?");
  });

  it("ne la rend pas avant 5 min de silence", () => {
    const { wait, accept } = setup();
    wait(5 * MINUTE - 100);
    expect(accept()).toBeNull();
  });

  it("l'écrit au journal", () => {
    const { wait, accept, logs } = setup();
    wait(5 * MINUTE);
    accept();
    expect(logs).toContain("Renard : le tchat reprend la parole : « Ah, maintenant vous parlez ? »");
  });

  it("ne la rend pas pour un message ignoré, qui rompt pourtant le silence", () => {
    const { wait, accept, ignore } = setup();
    wait(10 * MINUTE);
    expect(ignore()).toBeNull();
    expect(accept()).toBeNull();
  });

  it("compte le silence depuis le dernier message, accepté ou non", () => {
    const { wait, accept, ignore } = setup();
    wait(10 * MINUTE);
    ignore();
    wait(4 * MINUTE);
    expect(accept()).toBeNull();
    wait(5 * MINUTE);
    expect(accept()).not.toBeNull();
  });

  it("la rend au plus toutes les 30 min", () => {
    const { wait, accept } = setup();
    wait(5 * MINUTE);
    expect(accept()).not.toBeNull();
    wait(6 * MINUTE);
    expect(accept()).toBeNull();
    wait(24 * MINUTE - 100);
    expect(accept()).toBeNull();
    wait(30 * MINUTE);
    expect(accept()).not.toBeNull();
  });

  it("ne la rend pas à un second silence trop proche de la précédente reprise", () => {
    const { wait, accept } = setup();
    wait(5 * MINUTE);
    accept();
    wait(10 * MINUTE);
    expect(accept()).toBeNull();
  });

  it("tire les phrases sans répéter avant d'avoir tout dit, et suit la liste changée en direct", () => {
    const { wait, accept, attitude } = setup({ ...settings, foxResumePhrases: ["A", "B"] });
    wait(40 * MINUTE);
    expect(accept()).toBe("A");
    wait(40 * MINUTE);
    expect(accept()).toBe("B");
    attitude.update({ ...settings, foxResumePhrases: ["Z"] });
    wait(40 * MINUTE);
    expect(accept()).toBe("Z");
  });

  it("ne la rend pas, et ne compte pas pour les 30 min, quand la liste est vide", () => {
    const { wait, accept, attitude } = setup({ ...settings, foxResumePhrases: [] });
    wait(10 * MINUTE);
    expect(accept()).toBeNull();
    attitude.update(settings);
    wait(10 * MINUTE);
    expect(accept()).toBe("Ah, maintenant vous parlez ?");
  });

  it("suit le silence réglé en direct", () => {
    const { wait, accept, attitude } = setup();
    attitude.update({ ...settings, foxResumeAfter: 60_000 });
    wait(60_000);
    expect(accept()).not.toBeNull();
  });
});

describe("createFoxAttitude : démarrage, arrêt et sans réglages", () => {
  it("écoute le pas du contrôleur une seule fois, et plus après l'arrêt", () => {
    const { attitude, state, wait, attitudes } = setup();
    attitude.start();
    expect(state.subscribers).toBe(1);
    attitude.stop();
    expect(state.subscribers).toBe(0);
    wait(5 * MINUTE);
    expect(attitudes).toEqual([]);
  });

  it("ne fait rien sans les réglages du renard : ni humeur, ni reprise", () => {
    const { wait, accept, ignore, attitudes } = setup({
      obsAddress: settings.obsAddress,
      micName: "x",
      threshold: -40,
      delay: 250,
    });
    wait(10 * MINUTE);
    expect(accept()).toBeNull();
    expect(ignore()).toBeNull();
    expect(attitudes).toEqual([]);
  });
});

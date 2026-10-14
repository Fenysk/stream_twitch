import { describe, expect, it } from "vitest";
import type { RawMessage } from "../domain/chat.types";
import { toInsultList } from "../domain/chat-insults.rules";
import type { Regular, RegularsFile } from "../domain/regulars.schema";
import type { Settings } from "../domain/settings.schema";
import { createFoxRegulars } from "./fox-regulars.usecase";

const HOUR = 3_600_000;
const DAY = 86_400_000;
// Le 14 octobre 2026, 17 h à Paris.
const NOW = Date.UTC(2026, 9, 14, 15, 0);

const settings: Settings = {
  obsAddress: "ws://127.0.0.1:4455",
  micName: "Mic/Aux",
  threshold: -40,
  delay: 250,
  foxShouldWelcome: true,
  foxWelcomeLiveGap: 6 * HOUR,
  foxWelcomeLiveCounts: ["10", "25"],
  foxWelcomeReturnAfter: 14 * DAY,
  foxWelcomeMilestone: ["{user} ! {lives}e live."],
  foxWelcomeReturn: ["{user} ! {absence} sans nouvelles.", "Tiens, {user}. Ça faisait {absence}."],
  foxWelcomeYesterday: ["Oh, {user}, tu étais là hier !"],
  foxWelcomeFirst: ["Un nouveau ! Bienvenue, {user}.", "Bienvenue, {user} !"],
};

const insults = toInsultList("connard");

const raw = (nickname: string, login = nickname.toLowerCase()): RawMessage => ({
  id: `${login}-${nickname}`,
  viewerId: `id-${login}`,
  viewerLogin: login,
  nickname,
  color: null,
  text: "Salut, ceci ne doit jamais être gardé",
  emotes: [],
  isCommand: false,
});

const regular = (daysAgo: number, lives: number): Regular => ({
  firstSeen: NOW - 100 * DAY,
  lastSeen: NOW - daysAgo * DAY,
  lives,
});

type SetupInput = {
  file?: RegularsFile | null;
  custom?: Settings;
  random?: () => number;
  failures?: number;
};

// Le fichier, le temps et le programmateur à la main : le temps n'avance que quand le test le dit.
const setup = ({ file, custom = settings, random = () => 0, failures = 0 }: SetupInput = {}) => {
  const stored: RegularsFile | undefined =
    file === null ? undefined : (file ?? { createdAt: NOW - 60 * DAY, viewers: {} });
  const state = { now: NOW, failures };
  const saves: RegularsFile[] = [];
  const logs: string[] = [];
  const timers: { at: number; callback: () => void; isCancelled: boolean }[] = [];
  const regulars = createFoxRegulars({
    port: {
      get: () => stored,
      update(next) {
        if (state.failures > 0) {
          state.failures -= 1;
          throw new Error("disque plein");
        }
        saves.push(structuredClone(next));
      },
    },
    settings: custom,
    insults,
    clock: () => state.now,
    schedule(callback, ms) {
      const timer = { at: state.now + ms, callback, isCancelled: false };
      timers.push(timer);
      return () => {
        timer.isCancelled = true;
      };
    },
    random,
    log: (line) => logs.push(line),
  });
  const advance = (ms: number) => {
    state.now += ms;
    for (const timer of timers.filter(({ at, isCancelled }) => at <= state.now && !isCancelled)) {
      timer.isCancelled = true;
      timer.callback();
    }
  };
  const note = (nickname: string, options: { canWelcome?: boolean; login?: string } = {}) =>
    regulars.noteMessage(raw(nickname, options.login), { canWelcome: options.canWelcome ?? true });
  return { regulars, state, saves, logs, advance, note };
};

describe("createFoxRegulars : la phrase d'accueil", () => {
  it("accueille le tout premier message d'un viewer inconnu du fichier", () => {
    const { note } = setup();
    expect(note("Alice")).toBe("Un nouveau ! Bienvenue, Alice.");
  });

  it("l'écrit au journal, avec le cas", () => {
    const { note, logs } = setup();
    note("Alice");
    expect(logs).toEqual([
      "Renard : accueil (premier message sur la chaîne) : « Un nouveau ! Bienvenue, Alice. »",
    ]);
  });

  it("n'accueille pas deux fois le même live : un second message 2 h après ne dit rien", () => {
    const { note, state } = setup();
    note("Alice");
    state.now += 2 * HOUR;
    expect(note("Alice")).toBeNull();
    // Le silence se compte depuis le dernier message, pas depuis le premier.
    state.now += 5 * HOUR;
    expect(note("Alice")).toBeNull();
  });

  it("accueille la venue de la veille : un nouveau live, la dernière venue le jour calendaire d'avant à Paris", () => {
    const file = {
      createdAt: NOW - 60 * DAY,
      viewers: { alice: { firstSeen: NOW - 30 * DAY, lastSeen: NOW - 19 * HOUR, lives: 3 } },
    };
    expect(setup({ file }).note("Alice")).toBe("Oh, Alice, tu étais là hier !");
  });

  it("ne dit pas « hier » à un viewer de ce matin, ni de l'avant-veille", () => {
    const sameDay = {
      createdAt: NOW - 60 * DAY,
      viewers: { alice: { firstSeen: 0, lastSeen: NOW - 7 * HOUR, lives: 3 } },
    };
    expect(setup({ file: sameDay }).note("Alice")).toBeNull();
    const twoDays = { createdAt: NOW - 60 * DAY, viewers: { alice: regular(2, 3) } };
    expect(setup({ file: twoDays }).note("Alice", { login: "alice" })).toBeNull();
  });

  it("accueille le retour après 14 jours ou plus, avec la durée de l'absence", () => {
    const file = { createdAt: NOW - 90 * DAY, viewers: { alice: regular(20, 3), bob: regular(65, 3) } };
    expect(setup({ file }).note("Alice")).toBe("Alice ! 2 semaines sans nouvelles.");
    expect(setup({ file }).note("Bob")).toBe("Bob ! 2 mois sans nouvelles.");
  });

  it("ne dit pas « sans nouvelles » à qui est venu il y a moins de 14 jours, et suit l'absence réglée", () => {
    const file = { createdAt: NOW - 90 * DAY, viewers: { alice: regular(10, 3) } };
    expect(setup({ file }).note("Alice")).toBeNull();
    const custom = { ...settings, foxWelcomeReturnAfter: 7 * DAY };
    expect(setup({ file, custom }).note("Alice")).toBe("Alice ! 1 semaine sans nouvelles.");
  });

  it("fête un palier de lives, et le palier passe devant un retour", () => {
    const file = { createdAt: NOW - 60 * DAY, viewers: { alice: regular(20, 9), bob: regular(20, 24) } };
    const { note, advance } = setup({ file });
    expect(note("Alice")).toBe("Alice ! 10e live.");
    advance(31_000);
    expect(note("Bob")).toBe("Bob ! 25e live.");
  });

  it("n'accueille personne comme nouveau ni comme revenu pendant les 14 premiers jours du fichier, mais enregistre", () => {
    const file = {
      createdAt: NOW - 13 * DAY,
      viewers: { alice: { firstSeen: NOW - 13 * DAY, lastSeen: NOW - 12 * DAY, lives: 2 } },
    };
    // Alice a 12 jours d'absence : de quoi « revenir » à 10 jours, si le fichier avait 14 jours.
    const { note, advance, saves } = setup({
      file,
      custom: { ...settings, foxWelcomeReturnAfter: 10 * DAY },
    });
    expect(note("Bob")).toBeNull();
    advance(31_000);
    expect(note("Alice")).toBeNull();
    advance(5000);
    expect(Object.keys(saves.at(-1)?.viewers ?? {})).toEqual(["alice", "bob"]);
  });

  it("dit au plus une phrase d'accueil toutes les 30 s, et enregistre quand même les autres", () => {
    const { note, advance, saves } = setup();
    expect(note("Alice")).not.toBeNull();
    advance(29_999);
    expect(note("Bob")).toBeNull();
    advance(1);
    expect(note("Carole")).not.toBeNull();
    advance(5000);
    expect(Object.keys(saves.at(-1)?.viewers ?? {})).toEqual(["alice", "bob", "carole"]);
  });

  it("ne consomme pas le droit de parler quand une autre phrase passe devant (canWelcome faux), mais enregistre", () => {
    const { note, saves, advance } = setup();
    expect(note("Alice", { canWelcome: false })).toBeNull();
    expect(note("Bob")).toBe("Un nouveau ! Bienvenue, Bob.");
    advance(5000);
    expect(saves.at(-1)?.viewers.alice?.lives).toBe(1);
  });

  it("ne dit pas un pseudo refusé par le filtre d'insultes, le dit au journal, et enregistre le viewer", () => {
    const { note, logs, advance, saves } = setup();
    expect(note("connard")).toBeNull();
    expect(logs).toEqual([
      "Renard : pseudo refusé par le filtre d'insultes (accueil), pas de phrase d'accueil.",
    ]);
    advance(5000);
    expect(saves.at(-1)?.viewers.connard?.lives).toBe(1);
    expect(note("Alice")).toBe("Un nouveau ! Bienvenue, Alice.");
  });

  it("ne dit rien case décochée, mais retient la venue : un retour reste vérifiable", () => {
    const { note, regulars, advance, saves } = setup({ custom: { ...settings, foxShouldWelcome: false } });
    expect(note("Alice")).toBeNull();
    advance(5000);
    expect(saves.at(-1)?.viewers.alice?.lives).toBe(1);
    regulars.update(settings);
    advance(7 * HOUR);
    // Alice est connue : ce n'est pas son tout premier message, c'est sa venue de la veille (il est minuit passé à Paris).
    expect(note("Alice")).toBe("Oh, Alice, tu étais là hier !");
    advance(5000);
    expect(saves.at(-1)?.viewers.alice?.lives).toBe(2);
  });

  it("ne dit rien pour un cas dont la liste est vide, et retient la venue", () => {
    const { note } = setup({ custom: { ...settings, foxWelcomeFirst: [] } });
    expect(note("Alice")).toBeNull();
  });

  it("ne tire pas une phrase dont une variable n'a pas de valeur", () => {
    const { note } = setup({
      custom: { ...settings, foxWelcomeFirst: ["Salut {user}, {inconnue}.", "Bienvenue, {user} !"] },
    });
    expect(note("Alice")).toBe("Bienvenue, Alice !");
  });

  it("ne répète pas une phrase avant d'avoir tout dit", () => {
    const { note, advance } = setup();
    const first = note("Alice");
    advance(31_000);
    const second = note("Bob");
    expect([first, second]).toEqual(["Un nouveau ! Bienvenue, Alice.", "Bienvenue, Bob !"]);
  });

  it("suit un réglage changé en direct", () => {
    const { note, regulars } = setup({ custom: { ...settings, foxShouldWelcome: false } });
    expect(note("Alice")).toBeNull();
    regulars.update(settings);
    expect(note("Bob")).toBe("Un nouveau ! Bienvenue, Bob.");
  });

  it("ne fait rien sans les réglages de l'accueil : ni phrase, ni enregistrement", () => {
    const { note, advance, saves } = setup({
      custom: { obsAddress: "ws://x", micName: "m", threshold: -40, delay: 250 },
    });
    expect(note("Alice")).toBeNull();
    advance(10_000);
    expect(saves).toEqual([]);
  });
});

describe("createFoxRegulars : le fichier data/viewers.json", () => {
  it("retient la première venue, la dernière venue et le nombre de lives, par login en minuscules", () => {
    const { note, advance, saves, state } = setup();
    note("Alice", { login: "Alice" });
    const firstAt = state.now;
    state.now += 7 * HOUR;
    note("Alice", { login: "ALICE" });
    advance(5000);
    expect(saves.at(-1)).toEqual({
      createdAt: NOW - 60 * DAY,
      viewers: { alice: { firstSeen: firstAt, lastSeen: firstAt + 7 * HOUR, lives: 2 } },
    });
  });

  it("ne garde jamais le contenu des messages", () => {
    const { note, advance, saves } = setup();
    note("Alice");
    advance(5000);
    expect(JSON.stringify(saves)).not.toContain("ne doit jamais");
    expect(Object.keys(saves[0]?.viewers.alice ?? {}).sort()).toEqual(["firstSeen", "lastSeen", "lives"]);
  });

  it("compte un live de plus après plus de 6 h, pas avant", () => {
    const { note, advance, saves, state } = setup();
    note("Alice");
    state.now += 6 * HOUR;
    note("Alice");
    advance(5000);
    expect(saves.at(-1)?.viewers.alice?.lives).toBe(1);
    state.now += 6 * HOUR + 1;
    note("Alice");
    advance(5000);
    expect(saves.at(-1)?.viewers.alice?.lives).toBe(2);
  });

  it("n'écrit pas à chaque message : une écriture 5 s après le premier, avec tout ce qui est arrivé entre-temps", () => {
    const { note, advance, saves } = setup();
    note("Alice");
    advance(2000);
    note("Bob");
    advance(2999);
    expect(saves).toEqual([]);
    advance(1);
    expect(saves).toHaveLength(1);
    expect(Object.keys(saves[0]?.viewers ?? {})).toEqual(["alice", "bob"]);
    advance(60_000);
    expect(saves).toHaveLength(1);
  });

  it("écrit à l'arrêt ce qui ne l'est pas encore, une seule fois", () => {
    const { note, regulars, saves, advance } = setup();
    note("Alice");
    regulars.stop();
    expect(saves).toHaveLength(1);
    advance(60_000);
    expect(saves).toHaveLength(1);
    regulars.stop();
    expect(saves).toHaveLength(1);
  });

  it("crée le fichier au démarrage quand il n'existe pas : sa date de création compte", () => {
    const { regulars, saves } = setup({ file: null });
    regulars.start();
    expect(saves).toEqual([{ createdAt: NOW, viewers: {} }]);
  });

  it("n'écrit rien au démarrage quand le fichier existe", () => {
    const { regulars, saves } = setup();
    regulars.start();
    expect(saves).toEqual([]);
  });

  it("garde la date de création du fichier relu : les 14 jours ne repartent pas à chaque démarrage", () => {
    const { note } = setup({ file: { createdAt: NOW - 3 * DAY, viewers: {} } });
    expect(note("Alice")).toBeNull();
  });

  it("dit quand l'écriture échoue, sans casser le tchat, et réessaie à la venue suivante", () => {
    const { note, advance, saves, logs } = setup({ failures: 1 });
    note("Alice");
    advance(5000);
    expect(saves).toEqual([]);
    expect(logs.at(-1)).toBe(
      "Renard : habitués non enregistrés (disque plein), nouvel essai à la prochaine venue.",
    );
    note("Bob");
    advance(5000);
    expect(Object.keys(saves.at(-1)?.viewers ?? {})).toEqual(["alice", "bob"]);
  });
});

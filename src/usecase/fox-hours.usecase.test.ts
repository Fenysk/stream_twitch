import { describe, expect, it } from "vitest";
import { ADDRESS_MODE, type Show, YAWN_MODE } from "../domain/fox-mode.rules";
import type { Settings } from "../domain/settings.schema";
import { type Broadcast, createFoxHours } from "./fox-hours.usecase";
import type { QueueItem } from "./fox-queue.usecase";

const at = (day: number, hours: number, minutes = 0, seconds = 0): number =>
  new Date(2026, 9, day, hours, minutes, seconds).getTime();

const HOUR = 3_600_000;
const MINUTE = 60_000;

const settings: Settings = {
  obsAddress: "ws://127.0.0.1:4455",
  micName: "Mic/Aux",
  threshold: -40,
  delay: 250,
  foxHourPhrases: ["Ding ! {heures} de live."],
  foxEndTime: "00:00",
  foxEndWarning: 30 * MINUTE,
  foxEndWarningPhrases: ["Plus que {minutes} minutes."],
  foxEndPhrases: ["{fin}. Le live est fini."],
  foxOvertimeGap: 10 * MINUTE,
  foxOvertimePhrases: ["On avait dit {fin}. Il est {maintenant}. {retard} de rab."],
  foxBedtimePhrases: ["Je vais me coucher."],
  foxLateAfter: "23:30",
  foxLateYawnMin: 5 * MINUTE,
  foxLateYawnMax: 10 * MINUTE,
};

// Un serveur à la main : l'heure du PC, la diffusion d'OBS, les pas de 100 ms, la file et le contrôleur du renard.
const setup = (custom: Settings = settings, live: Broadcast | null = { isLive: true, duration: 0 }) => {
  const state = {
    now: at(14, 21),
    broadcast: (_broadcast: Broadcast): void => undefined,
    tick: (): void => undefined,
    subscribers: 0,
    flashMs: 2000,
  };
  const pushed: QueueItem[] = [];
  const flashes: Show[] = [];
  const logs: string[] = [];
  const leaves = { count: 0 };
  const hours = createFoxHours({
    broadcast: {
      subscribe(listener) {
        state.broadcast = listener;
        state.subscribers += 1;
        return () => {
          state.broadcast = () => undefined;
          state.subscribers -= 1;
        };
      },
    },
    queue: { push: (item) => pushed.push(item) },
    mode: {
      subscribe(listener) {
        state.tick = listener;
        state.subscribers += 1;
        return () => {
          state.tick = () => undefined;
          state.subscribers -= 1;
        };
      },
      flash(show) {
        flashes.push(show);
        return state.flashMs;
      },
      leave() {
        leaves.count += 1;
      },
    },
    settings: custom,
    clock: () => state.now,
    random: () => 0,
    log: (line) => logs.push(line),
  });
  hours.start();
  if (live) state.broadcast(live);
  // Le temps passe jusqu'à `when` : un pas de 100 ms à cet instant.
  const goTo = (when: number) => {
    state.now = when;
    state.tick();
  };
  const texts = () => pushed.map(({ text }) => text);
  return { hours, state, pushed, flashes, logs, leaves, goTo, texts };
};

describe("createFoxHours : les heures pleines", () => {
  it("n'annonce rien hors diffusion, même des heures plus tard", () => {
    const { goTo, pushed } = setup(settings, null);
    goTo(at(14, 21) + 5 * HOUR);
    expect(pushed).toEqual([]);
  });

  it("annonce « 1 heure de live » à la première heure pleine, pas avant", () => {
    const { goTo, texts } = setup({ ...settings, foxEndTime: "" });
    goTo(at(14, 21) + HOUR - 1);
    expect(texts()).toEqual([]);
    goTo(at(14, 21) + HOUR);
    expect(texts()).toEqual(["Ding ! 1 heure de live."]);
  });

  it("annonce « 2 heures » à la suivante, une annonce par heure même si les pas sont espacés", () => {
    const { goTo, texts } = setup({ ...settings, foxEndTime: "" });
    goTo(at(14, 21) + HOUR);
    goTo(at(14, 21) + HOUR + 100);
    goTo(at(14, 21) + 2 * HOUR);
    expect(texts()).toEqual(["Ding ! 1 heure de live.", "Ding ! 2 heures de live."]);
  });

  it("met l'annonce en file comme un remerciement : urgente, jamais coupée par la voix, tournée vers le tchat", () => {
    const { goTo, pushed } = setup({ ...settings, foxEndTime: "" });
    goTo(at(14, 21) + HOUR);
    expect(pushed[0]).toMatchObject({ kind: "hours", isCuttable: false, isUrgent: true });
    expect(pushed[0]?.toShow()).toBeNull();
  });

  it("écrit l'annonce au journal", () => {
    const { goTo, logs } = setup({ ...settings, foxEndTime: "" });
    goTo(at(14, 21) + HOUR);
    expect(logs.at(-1)).toBe("Renard : heure pleine de live : « Ding ! 1 heure de live. »");
  });

  it("compte depuis le début de la diffusion, pas depuis le démarrage du serveur : il démarre en plein live", () => {
    const { goTo, texts } = setup({ ...settings, foxEndTime: "" }, { isLive: true, duration: 2.5 * HOUR });
    goTo(at(14, 21) + 100);
    expect(texts()).toEqual([]);
    goTo(at(14, 21) + 0.5 * HOUR - 1);
    expect(texts()).toEqual([]);
    goTo(at(14, 21) + 0.5 * HOUR);
    expect(texts()).toEqual(["Ding ! 3 heures de live."]);
  });

  it("s'arrête avec la diffusion, et repart de zéro à la suivante", () => {
    const { state, goTo, texts } = setup({ ...settings, foxEndTime: "" });
    goTo(at(14, 21) + 30 * MINUTE);
    state.broadcast({ isLive: false, duration: 0 });
    goTo(at(14, 21) + 3 * HOUR);
    expect(texts()).toEqual([]);
    state.broadcast({ isLive: true, duration: 0 });
    goTo(at(14, 21) + 4 * HOUR - 1);
    expect(texts()).toEqual([]);
    goTo(at(14, 21) + 4 * HOUR);
    expect(texts()).toEqual(["Ding ! 1 heure de live."]);
  });

  it("tire les phrases sans répéter avant d'avoir tout dit", () => {
    const { goTo, texts } = setup({
      ...settings,
      foxEndTime: "",
      foxHourPhrases: ["A {heures}", "B {heures}"],
    });
    for (const hour of [1, 2, 3]) goTo(at(14, 21) + hour * HOUR);
    expect(texts()).toEqual(["A 1 heure", "B 2 heures", "A 3 heures"]);
  });

  it("ne dit rien, et le journal le dit, quand la liste est vide", () => {
    const { goTo, pushed, logs } = setup({ ...settings, foxEndTime: "", foxHourPhrases: [] });
    goTo(at(14, 21) + HOUR);
    expect(pushed).toEqual([]);
    expect(logs.at(-1)).toBe("Renard : aucune phrase possible pour heure pleine de live, rien n'est dit.");
  });
});

// Sans phrase d'heure pleine, les tests de la fin ne voient que ses étapes.
const withoutHours: Settings = { ...settings, foxHourPhrases: [] };

describe("createFoxHours : la fin prévue", () => {
  it("prévient 30 min avant, avec le nombre de minutes, tourné vers Fenysk", () => {
    const { goTo, texts, pushed } = setup(withoutHours);
    goTo(at(14, 23, 29, 59));
    expect(texts().filter((text) => text.startsWith("Plus que"))).toEqual([]);
    goTo(at(14, 23, 30));
    expect(texts()).toContain("Plus que 30 minutes.");
    expect(pushed.find(({ text }) => text.startsWith("Plus que"))?.toShow()).toEqual(ADDRESS_MODE);
  });

  it("annonce la fin à l'heure prévue : minuit, la première occurrence après le début, en majuscule", () => {
    const { goTo, texts, pushed } = setup();
    goTo(at(15, 0));
    expect(texts()).toContain("Minuit. Le live est fini.");
    const end = pushed.find(({ text }) => text.startsWith("Minuit"));
    expect(end?.toShow()).toEqual(ADDRESS_MODE);
    expect(end).toMatchObject({ kind: "hours", isCuttable: false, isUrgent: true });
  });

  it("rappelle toutes les 10 min avec l'heure dite et le retard", () => {
    const { goTo, texts } = setup();
    goTo(at(15, 0, 10));
    goTo(at(15, 0, 20));
    expect(texts().filter((text) => text.startsWith("On avait dit"))).toEqual([
      "On avait dit minuit. Il est minuit 10. 10 minutes de rab.",
      "On avait dit minuit. Il est minuit 20. 20 minutes de rab.",
    ]);
  });

  it("se couche au troisième rappel : sa phrase, puis il part, sans plus aucun rappel", () => {
    const { goTo, texts, pushed, leaves } = setup(withoutHours);
    goTo(at(15, 0, 30));
    expect(texts().at(-1)).toBe("Je vais me coucher.");
    expect(pushed.at(-1)?.toShow()).toEqual(ADDRESS_MODE);
    expect(leaves.count).toBe(0);
    pushed.at(-1)?.onDone?.();
    expect(leaves.count).toBe(1);
    const before = pushed.length;
    goTo(at(15, 0, 40));
    goTo(at(15, 1));
    expect(pushed).toHaveLength(before);
  });

  it("dit les étapes dans l'ordre, et chacune une seule fois", () => {
    const { goTo, texts } = setup(withoutHours);
    for (const [hours, minutes] of [
      [23, 30],
      [23, 31],
      [0, 0],
      [0, 1],
      [0, 10],
      [0, 20],
      [0, 30],
      [0, 31],
    ] as const) {
      goTo(at(hours === 0 ? 15 : 14, hours, minutes));
    }
    expect(texts()).toEqual([
      "Plus que 30 minutes.",
      "Minuit. Le live est fini.",
      "On avait dit minuit. Il est minuit 10. 10 minutes de rab.",
      "On avait dit minuit. Il est minuit 20. 20 minutes de rab.",
      "Je vais me coucher.",
    ]);
  });

  it("ne dit pas ce qui est passé quand il découvre la diffusion en plein dépassement", () => {
    const { state, goTo, texts } = setup(settings, null);
    state.now = at(15, 0, 15);
    state.broadcast({ isLive: true, duration: 3 * HOUR + 15 * MINUTE });
    goTo(at(15, 0, 15, 1));
    expect(texts()).toEqual([]);
    goTo(at(15, 0, 20));
    expect(texts()).toEqual(["On avait dit minuit. Il est minuit 20. 20 minutes de rab."]);
  });

  it("n'a aucune étape sans fin prévue", () => {
    const { goTo, pushed } = setup({ ...settings, foxEndTime: "" });
    goTo(at(15, 0, 30));
    expect(pushed.filter(({ text }) => !text.startsWith("Ding"))).toEqual([]);
  });

  it("suit une fin prévue réglée en direct : les étapes déjà passées ne sont pas redites", () => {
    const { hours, goTo, texts } = setup({ ...settings, foxEndTime: "" });
    goTo(at(14, 22));
    hours.update({ ...settings, foxEndTime: "22:30" });
    goTo(at(14, 22, 1));
    expect(texts().filter((text) => !text.startsWith("Ding"))).toEqual([]);
    goTo(at(14, 22, 30));
    expect(texts().at(-1)).toBe("22 heures 30. Le live est fini.");
  });

  it("couche le renard même sans phrase de coucher : il part tout de suite", () => {
    const { goTo, leaves, pushed } = setup({ ...settings, foxBedtimePhrases: [] });
    goTo(at(15, 0, 30));
    expect(pushed.some(({ text }) => text.includes("coucher"))).toBe(false);
    expect(leaves.count).toBe(1);
  });

  it("se couche de nouveau à la diffusion suivante : le coucher d'un live ne vaut pas pour le suivant", () => {
    const { state, goTo, leaves, pushed } = setup(withoutHours);
    goTo(at(15, 0, 30));
    pushed.at(-1)?.onDone?.();
    expect(leaves.count).toBe(1);
    state.broadcast({ isLive: false, duration: 0 });
    state.now = at(15, 21);
    state.broadcast({ isLive: true, duration: 0 });
    goTo(at(16, 0, 30));
    pushed.at(-1)?.onDone?.();
    expect(leaves.count).toBe(2);
    expect(pushed.filter(({ text }) => text === "Je vais me coucher.")).toHaveLength(2);
  });

  it("dit un pas très en retard par sa dernière étape seulement", () => {
    const { goTo, texts } = setup(withoutHours);
    goTo(at(15, 0, 21));
    expect(texts().filter((text) => !text.startsWith("Ding"))).toEqual([
      "On avait dit minuit. Il est minuit 21. 21 minutes de rab.",
    ]);
  });
});

describe("createFoxHours : les bâillements tardifs", () => {
  const withoutEnd: Settings = { ...settings, foxEndTime: "" };

  it("ne bâille pas avant 23 h 30 sans fin prévue", () => {
    const { goTo, flashes } = setup(withoutEnd);
    for (let minutes = 0; minutes < 150; minutes += 1) goTo(at(14, 21) + minutes * MINUTE);
    expect(flashes).toEqual([]);
  });

  it("bâille 5 à 10 min après 23 h 30, au repos, puis toutes les 5 à 10 min", () => {
    const { goTo, flashes, logs } = setup(withoutEnd);
    goTo(at(14, 23, 30));
    expect(flashes).toEqual([]);
    goTo(at(14, 23, 34, 59));
    expect(flashes).toEqual([]);
    goTo(at(14, 23, 35));
    expect(flashes).toEqual([YAWN_MODE]);
    goTo(at(14, 23, 39, 59));
    expect(flashes).toHaveLength(1);
    goTo(at(14, 23, 40));
    expect(flashes).toHaveLength(2);
    expect(logs.filter((line) => line === "Renard : il est tard, il bâille.")).toHaveLength(2);
  });

  it("tire le délai au hasard entre le minimum et le maximum", () => {
    const { hours, goTo, flashes } = setup(withoutEnd);
    hours.update({ ...withoutEnd, foxLateYawnMin: 60_000, foxLateYawnMax: 60_000 });
    goTo(at(14, 23, 30));
    goTo(at(14, 23, 31));
    expect(flashes).toHaveLength(1);
  });

  it("bâille après la fin prévue quand il y en a une, pas à 23 h 30", () => {
    const { goTo, flashes } = setup({ ...settings, foxEndTime: "01:00" });
    goTo(at(14, 23, 40));
    expect(flashes).toEqual([]);
    goTo(at(15, 1));
    goTo(at(15, 1, 5));
    expect(flashes).toEqual([YAWN_MODE]);
  });

  it("n'écrit rien au journal quand il ne bâille pas (caché, ou déjà occupé), et ne revient pas pour un bâillement", () => {
    const { state, goTo, flashes, logs } = setup(withoutEnd);
    state.flashMs = 0;
    goTo(at(14, 23, 30));
    goTo(at(14, 23, 36));
    expect(flashes).toHaveLength(1);
    expect(logs.filter((line) => line.includes("bâille"))).toEqual([]);
  });

  it("s'arrête avec la diffusion", () => {
    const { state, goTo, flashes } = setup(withoutEnd);
    goTo(at(14, 23, 30));
    state.broadcast({ isLive: false, duration: 0 });
    goTo(at(14, 23, 50));
    goTo(at(15, 1));
    expect(flashes).toEqual([]);
  });
});

describe("createFoxHours : le cycle de vie et les réglages", () => {
  it("se désabonne des deux flux à l'arrêt, et ne s'abonne pas deux fois au démarrage", () => {
    const { hours, state } = setup();
    hours.start();
    expect(state.subscribers).toBe(2);
    hours.stop();
    expect(state.subscribers).toBe(0);
  });

  it("ne fait rien sans les réglages du renard", () => {
    const { goTo, pushed, flashes } = setup({
      obsAddress: settings.obsAddress,
      micName: "x",
      threshold: -40,
      delay: 250,
    });
    goTo(at(14, 21) + 5 * HOUR);
    expect(pushed).toEqual([]);
    expect(flashes).toEqual([]);
  });

  it("suit les phrases changées en direct", () => {
    const { hours, goTo, texts } = setup({ ...settings, foxEndTime: "" });
    hours.update({ ...settings, foxEndTime: "", foxHourPhrases: ["Autre {heures}"] });
    goTo(at(14, 21) + HOUR);
    expect(texts()).toEqual(["Autre 1 heure"]);
  });

  it("écarte une phrase dont une variable n'existe pas", () => {
    const { goTo, texts } = setup({
      ...settings,
      foxEndTime: "",
      foxHourPhrases: ["{inconnue} !", "Bon {heures}"],
    });
    goTo(at(14, 21) + HOUR);
    expect(texts()).toEqual(["Bon 1 heure"]);
  });
});

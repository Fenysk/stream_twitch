import { describe, expect, it } from "vitest";
import { ADDRESS_MODE, type Show, YAWN_MODE } from "../domain/fox-mode.rules";
import type { Settings } from "../domain/settings.schema";
import { type Broadcast, createFoxHours } from "./fox-hours.usecase";
import type { QueueItem } from "./fox-queue.usecase";

const at = (day: number, hours: number, minutes = 0, seconds = 0): number =>
  new Date(2026, 9, day, hours, minutes, seconds).getTime();

const HOUR = 3_600_000;
const MINUTE = 60_000;

// Une fin prévue telle que le réglage la garde : le texte ISO de l'instant.
const iso = (when: number): string => new Date(when).toISOString();

const settings: Settings = {
  obsAddress: "ws://127.0.0.1:4455",
  micName: "Mic/Aux",
  threshold: -40,
  delay: 250,
  foxHourPhrases: ["Ding ! {heures} de live."],
  foxEndAt: iso(at(15, 0)),
  foxEndWarningMarks: ["30"],
  foxEndWarningPhrases: ["Plus que {minutes} minutes."],
  foxEndSoonPhrases: ["Pressant : {reste}."],
  foxEndPanicPhrases: ["Panique : {reste} !"],
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
  const reviews = { count: 0 };
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
    review: {
      sayAtEnd() {
        reviews.count += 1;
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
  return { hours, state, pushed, flashes, logs, leaves, reviews, goTo, texts };
};

describe("createFoxHours : les heures pleines", () => {
  it("n'annonce rien hors diffusion, même des heures plus tard", () => {
    const { goTo, pushed } = setup(settings, null);
    goTo(at(14, 21) + 5 * HOUR);
    expect(pushed).toEqual([]);
  });

  it("annonce « 1 heure de live » à la première heure pleine, pas avant", () => {
    const { goTo, texts } = setup({ ...settings, foxEndAt: "" });
    goTo(at(14, 21) + HOUR - 1);
    expect(texts()).toEqual([]);
    goTo(at(14, 21) + HOUR);
    expect(texts()).toEqual(["Ding ! 1 heure de live."]);
  });

  it("annonce « 2 heures » à la suivante, une annonce par heure même si les pas sont espacés", () => {
    const { goTo, texts } = setup({ ...settings, foxEndAt: "" });
    goTo(at(14, 21) + HOUR);
    goTo(at(14, 21) + HOUR + 100);
    goTo(at(14, 21) + 2 * HOUR);
    expect(texts()).toEqual(["Ding ! 1 heure de live.", "Ding ! 2 heures de live."]);
  });

  it("met l'annonce en file comme un remerciement : urgente, jamais coupée par la voix, tournée vers le tchat", () => {
    const { goTo, pushed } = setup({ ...settings, foxEndAt: "" });
    goTo(at(14, 21) + HOUR);
    expect(pushed[0]).toMatchObject({ kind: "hours", isCuttable: false, isUrgent: true });
    expect(pushed[0]?.toShow()).toBeNull();
  });

  it("écrit l'annonce au journal", () => {
    const { goTo, logs } = setup({ ...settings, foxEndAt: "" });
    goTo(at(14, 21) + HOUR);
    expect(logs.at(-1)).toBe("Renard : heure pleine de live : « Ding ! 1 heure de live. »");
  });

  it("compte depuis le début de la diffusion, pas depuis le démarrage du serveur : il démarre en plein live", () => {
    const { goTo, texts } = setup({ ...settings, foxEndAt: "" }, { isLive: true, duration: 2.5 * HOUR });
    goTo(at(14, 21) + 100);
    expect(texts()).toEqual([]);
    goTo(at(14, 21) + 0.5 * HOUR - 1);
    expect(texts()).toEqual([]);
    goTo(at(14, 21) + 0.5 * HOUR);
    expect(texts()).toEqual(["Ding ! 3 heures de live."]);
  });

  it("s'arrête avec la diffusion, et repart de zéro à la suivante", () => {
    const { state, goTo, texts } = setup({ ...settings, foxEndAt: "" });
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
      foxEndAt: "",
      foxHourPhrases: ["A {heures}", "B {heures}"],
    });
    for (const hour of [1, 2, 3]) goTo(at(14, 21) + hour * HOUR);
    expect(texts()).toEqual(["A 1 heure", "B 2 heures", "A 3 heures"]);
  });

  it("ne dit rien, et le journal le dit, quand la liste est vide", () => {
    const { goTo, pushed, logs } = setup({ ...settings, foxEndAt: "", foxHourPhrases: [] });
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
    pushed.at(-1)?.onDone?.(true);
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
    const { goTo, pushed } = setup({ ...settings, foxEndAt: "" });
    goTo(at(15, 0, 30));
    expect(pushed.filter(({ text }) => !text.startsWith("Ding"))).toEqual([]);
  });

  it("tient la fin à l'instant enregistré : une fin d'avant le début du live ne repart pas sur le soir suivant", () => {
    const { goTo, texts } = setup({ ...withoutHours, foxEndAt: iso(at(14, 20)) });
    goTo(at(15, 20, 30));
    expect(texts()).toEqual([]);
  });

  it("annonce une fin posée pour le lendemain à son heure, avec son avertissement", () => {
    const { goTo, texts } = setup({ ...withoutHours, foxEndAt: iso(at(15, 15)) });
    goTo(at(14, 23, 59));
    goTo(at(15, 14, 30));
    expect(texts()).toEqual(["Plus que 30 minutes."]);
    goTo(at(15, 15));
    expect(texts().at(-1)).toBe("15 heures. Le live est fini.");
  });

  it("continue les rappels d'un serveur relancé à 15 h 10 dans un live commencé à 11 h 43, sans redire ce qui est passé", () => {
    const { state, goTo, texts } = setup({ ...withoutHours, foxEndAt: iso(at(14, 15)) }, null);
    state.now = at(14, 15, 10);
    state.broadcast({ isLive: true, duration: 3 * HOUR + 27 * MINUTE });
    goTo(at(14, 15, 19));
    expect(texts()).toEqual([]);
    goTo(at(14, 15, 20));
    expect(texts()).toEqual(["On avait dit 15 heures. Il est 15 heures 20. 20 minutes de rab."]);
    goTo(at(14, 15, 30));
    expect(texts().at(-1)).toBe("Je vais me coucher.");
  });

  it("suit une fin prévue réglée en direct : les étapes déjà passées ne sont pas redites", () => {
    const { hours, goTo, texts } = setup({ ...settings, foxEndAt: "" });
    goTo(at(14, 22));
    hours.update({ ...settings, foxEndAt: iso(at(14, 22, 30)) });
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
    const { hours, state, goTo, leaves, pushed } = setup(withoutHours);
    goTo(at(15, 0, 30));
    pushed.at(-1)?.onDone?.(true);
    expect(leaves.count).toBe(1);
    state.broadcast({ isLive: false, duration: 0 });
    state.now = at(15, 21);
    state.broadcast({ isLive: true, duration: 0 });
    // La fin est un instant : pour ce second live, Alexis en pose une nouvelle.
    hours.update({ ...withoutHours, foxEndAt: iso(at(16, 0)) });
    goTo(at(16, 0, 30));
    pushed.at(-1)?.onDone?.(true);
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

describe("createFoxHours : les paliers d'avertissement de la fin", () => {
  const MARKS = ["60", "30", "15", "10", "5", "2", "1"];
  // Une fin à 23 h, un ton par liste : le texte dit quelle liste a parlé.
  const escalating: Settings = {
    ...withoutHours,
    foxEndAt: iso(at(14, 23)),
    foxEndWarningMarks: MARKS,
    foxEndWarningPhrases: ["Calme {reste}."],
    foxEndSoonPhrases: ["Pressant {reste}."],
    foxEndPanicPhrases: ["Panique {reste} !"],
  };
  const clockOf = (when: number): string => new Date(when).toTimeString().slice(0, 5);

  // Le temps passe minute par minute de `from` à `to` : chaque annonce avec l'heure à laquelle elle est tombée.
  const run = (
    { goTo, state, texts }: ReturnType<typeof setup>,
    from: number,
    to: number,
  ): [string, string][] => {
    const said: [string, string][] = [];
    for (let when = from; when <= to; when += MINUTE) {
      const before = texts().length;
      goTo(when);
      for (const text of texts().slice(before)) said.push([clockOf(state.now), text]);
    }
    return said;
  };

  it("dit chaque palier à sa minute, dans la liste de son ton, puis la fin : un live commencé à 21 h pour une fin à 23 h", () => {
    expect(run(setup(escalating), at(14, 21, 1), at(14, 23))).toEqual([
      ["22:00", "Calme 1 heure."],
      ["22:30", "Calme 30 minutes."],
      ["22:45", "Pressant 15 minutes."],
      ["22:50", "Pressant 10 minutes."],
      ["22:55", "Pressant 5 minutes."],
      ["22:58", "Panique 2 minutes !"],
      ["22:59", "Panique 1 minute !"],
      ["23:00", "23 heures. Le live est fini."],
    ]);
  });

  it("ne dit pas un palier antérieur au début du live : commencé à 22 h 40, seuls 15, 10, 5, 2 et 1 sonnent", () => {
    const live = setup(escalating, null);
    live.state.now = at(14, 22, 40);
    live.state.broadcast({ isLive: true, duration: 0 });
    expect(run(live, at(14, 22, 41), at(14, 22, 59)).map(([, text]) => text)).toEqual([
      "Pressant 15 minutes.",
      "Pressant 10 minutes.",
      "Pressant 5 minutes.",
      "Panique 2 minutes !",
      "Panique 1 minute !",
    ]);
  });

  it("ne dit pas un palier déjà passé à la découverte d'un live en cours", () => {
    const live = setup(escalating, null);
    live.state.now = at(14, 22, 52);
    live.state.broadcast({ isLive: true, duration: 2 * HOUR });
    live.goTo(at(14, 22, 53));
    expect(live.texts()).toEqual([]);
    expect(run(live, at(14, 22, 54), at(14, 22, 59)).map(([, text]) => text)).toEqual([
      "Pressant 5 minutes.",
      "Panique 2 minutes !",
      "Panique 1 minute !",
    ]);
  });

  it("ne redit rien de passé quand les paliers changent en plein live, et dit les nouveaux à venir", () => {
    const live = setup(escalating);
    const first = run(live, at(14, 21, 1), at(14, 22, 35));
    expect(first.map(([, text]) => text)).toEqual(["Calme 1 heure.", "Calme 30 minutes."]);
    live.hours.update({ ...escalating, foxEndWarningMarks: ["60", "45", "30", "20", "10"] });
    live.goTo(at(14, 22, 36));
    expect(live.texts()).toHaveLength(2);
    expect(run(live, at(14, 22, 37), at(14, 22, 59)).map(([clock, text]) => `${clock} ${text}`)).toEqual([
      "22:40 Calme 20 minutes.",
      "22:50 Pressant 10 minutes.",
    ]);
  });

  it("ne dit que le dernier quand plusieurs paliers sont dus d'un coup", () => {
    const { goTo, texts } = setup(escalating);
    goTo(at(14, 22, 47));
    expect(texts()).toEqual(["Pressant 15 minutes."]);
  });

  it("lit les paliers sans doublon ni ordre : « 1 », « 5 », « 5 », « 60 » disent trois avertissements", () => {
    const live = setup({ ...escalating, foxEndWarningMarks: ["1", "5", "5", "60"] });
    expect(run(live, at(14, 21, 1), at(14, 22, 59)).map(([clock, text]) => `${clock} ${text}`)).toEqual([
      "22:00 Calme 1 heure.",
      "22:55 Pressant 5 minutes.",
      "22:59 Panique 1 minute !",
    ]);
  });

  it("n'avertit pas sans palier, mais annonce la fin", () => {
    const live = setup({ ...escalating, foxEndWarningMarks: [] });
    expect(run(live, at(14, 21, 1), at(14, 23)).map(([, text]) => text)).toEqual([
      "23 heures. Le live est fini.",
    ]);
  });

  it("tourne chaque avertissement vers Fenysk, urgent et jamais coupé par sa voix", () => {
    const { goTo, pushed } = setup(escalating);
    for (const [hours, minutes] of [
      [22, 0],
      [22, 45],
      [22, 58],
    ] as const)
      goTo(at(14, hours, minutes));
    expect(pushed).toHaveLength(3);
    for (const item of pushed) {
      expect(item).toMatchObject({ kind: "hours", isCuttable: false, isUrgent: true });
      expect(item.toShow()).toEqual(ADDRESS_MODE);
    }
  });

  it("garde le nombre dans {minutes} et l'heure de la fin dans {fin} pour les trois tons", () => {
    const { goTo, texts } = setup({
      ...escalating,
      foxEndWarningPhrases: ["{minutes} min avant {fin}."],
      foxEndSoonPhrases: ["{minutes} min avant {fin} !"],
      foxEndPanicPhrases: ["{minutes} min avant {fin} !!"],
    });
    for (const [hours, minutes] of [
      [22, 30],
      [22, 50],
      [22, 59],
    ] as const)
      goTo(at(14, hours, minutes));
    expect(texts()).toEqual([
      "30 min avant 23 heures.",
      "10 min avant 23 heures !",
      "1 min avant 23 heures !!",
    ]);
  });

  it("nomme chaque ton dans le journal, et le dit quand une liste est vide", () => {
    const { goTo, logs } = setup({ ...escalating, foxEndSoonPhrases: [] });
    goTo(at(14, 22, 30));
    expect(logs.at(-1)).toBe("Renard : avertissement calme de la fin prévue : « Calme 30 minutes. »");
    goTo(at(14, 22, 45));
    expect(logs.at(-1)).toBe(
      "Renard : aucune phrase possible pour avertissement pressant de la fin prévue, rien n'est dit.",
    );
    goTo(at(14, 22, 58));
    expect(logs.at(-1)).toBe("Renard : avertissement paniqué de la fin prévue : « Panique 2 minutes ! »");
  });

  it("tire les phrases de chaque ton sans répéter avant d'avoir tout dit", () => {
    const { goTo, texts } = setup({ ...escalating, foxEndSoonPhrases: ["A {reste}", "B {reste}"] });
    for (const minutes of [45, 50, 55]) goTo(at(14, 22, minutes));
    expect(texts()).toEqual(["A 15 minutes", "B 10 minutes", "A 5 minutes"]);
  });
});

describe("createFoxHours : les bâillements tardifs", () => {
  const withoutEnd: Settings = { ...settings, foxEndAt: "" };

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
    const { goTo, flashes } = setup({ ...settings, foxEndAt: iso(at(15, 1)) });
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
    const { hours, goTo, texts } = setup({ ...settings, foxEndAt: "" });
    hours.update({ ...settings, foxEndAt: "", foxHourPhrases: ["Autre {heures}"] });
    goTo(at(14, 21) + HOUR);
    expect(texts()).toEqual(["Autre 1 heure"]);
  });

  it("écarte une phrase dont une variable n'existe pas", () => {
    const { goTo, texts } = setup({
      ...settings,
      foxEndAt: "",
      foxHourPhrases: ["{inconnue} !", "Bon {heures}"],
    });
    goTo(at(14, 21) + HOUR);
    expect(texts()).toEqual(["Bon 1 heure"]);
  });
});

describe("createFoxHours : le bilan du live suit l'annonce de la fin prévue", () => {
  const endItem = (pushed: { text: string }[]) =>
    pushed.find(({ text }) => text.startsWith("Minuit")) as (typeof pushed)[number] & {
      onDone?: () => void;
    };

  it("le lance quand l'annonce de la fin est finie, pas avant", () => {
    const { goTo, pushed, reviews } = setup(withoutHours);
    goTo(at(15, 0));
    expect(reviews.count).toBe(0);
    endItem(pushed).onDone?.();
    expect(reviews.count).toBe(1);
  });

  it("ne le lance ni pour l'avertissement, ni pour les rappels, ni pour le coucher", () => {
    const { goTo, pushed, reviews } = setup(withoutHours);
    for (const [day, hours, minutes] of [
      [14, 23, 30],
      [15, 0, 10],
      [15, 0, 20],
      [15, 0, 30],
    ] as const) {
      goTo(at(day, hours, minutes));
      for (const item of pushed.filter(({ text }) => !text.startsWith("Minuit"))) {
        (item as { onDone?: (isSaid: boolean) => void }).onDone?.(true);
      }
    }
    expect(reviews.count).toBe(0);
  });

  it("le lance tout de suite quand il n'y a aucune phrase de fin à dire", () => {
    const { goTo, reviews } = setup({ ...withoutHours, foxEndPhrases: [] });
    goTo(at(15, 0));
    expect(reviews.count).toBe(1);
  });

  it("ne le lance qu'une fois par diffusion, même si la fin prévue change et sonne de nouveau", () => {
    const { hours, goTo, pushed, reviews } = setup(withoutHours);
    goTo(at(15, 0));
    endItem(pushed).onDone?.();
    hours.update({ ...withoutHours, foxEndAt: iso(at(15, 1)) });
    goTo(at(15, 1));
    const second = pushed.filter(({ text }) => text.endsWith("Le live est fini."));
    expect(second).toHaveLength(2);
    (second[1] as { onDone?: (isSaid: boolean) => void }).onDone?.(true);
    expect(reviews.count).toBe(1);
  });

  it("le relance à la diffusion suivante", () => {
    const { hours, state, goTo, pushed, reviews } = setup(withoutHours);
    goTo(at(15, 0));
    endItem(pushed).onDone?.();
    state.broadcast({ isLive: false, duration: 0 });
    state.now = at(15, 21);
    state.broadcast({ isLive: true, duration: 0 });
    // La fin est un instant : pour ce second live, Alexis en pose une nouvelle.
    hours.update({ ...withoutHours, foxEndAt: iso(at(16, 0)) });
    goTo(at(16, 0));
    endItem(pushed.slice(1)).onDone?.();
    expect(reviews.count).toBe(2);
  });

  it("n'en lance aucun sans fin prévue", () => {
    const { goTo, pushed, reviews } = setup({ ...withoutHours, foxEndAt: "" });
    goTo(at(15, 0, 30));
    for (const item of pushed) (item as { onDone?: (isSaid: boolean) => void }).onDone?.(true);
    expect(reviews.count).toBe(0);
  });
});

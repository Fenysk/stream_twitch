import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { type EndStepKey, EndTimeKeys, toEndKeyTitle, toHoldGap } from "./end-time-keys";
import { type FetchFn, SERVER_DOWN_TITLE, SERVER_TO_RESTART_TITLE } from "./server-request";
import { SettingsFeed } from "./settings-feed";

const BASE = "http://127.0.0.1:4747";
const json = (body: unknown, status = 200): Response => new Response(JSON.stringify(body), { status });
const viewOf = (foxEndAt: string) => ({
  defaults: { threshold: -40 },
  local: {},
  effective: { threshold: -40, foxEndAt },
});

// La fin prévue telle que le serveur la garde : le texte ISO de l'instant, à l'heure locale de ces tests (le 14 octobre par défaut).
const end = (hours: number, minutes = 0, day = 14): string =>
  new Date(2026, 9, day, hours, minutes).toISOString();

// Un serveur d'essai : sa fin prévue, ce que les PUT ont reçu, et de quoi le rendre injoignable, le faire refuser ou le ralentir.
const serverOf = (initial: string) => {
  const state = {
    endAt: initial,
    isDown: false,
    puts: [] as string[],
    gets: 0,
    putStatus: 200,
    gate: undefined as Promise<void> | undefined,
  };
  const fetchFn: FetchFn = async (url, init) => {
    if (state.isDown) throw new TypeError("fetch failed");
    const route = `${init.method ?? "GET"} ${url.slice(BASE.length)}`;
    if (route === "GET /api/settings") {
      state.gets += 1;
      await state.gate;
      return json(viewOf(state.endAt));
    }
    if (route === "PUT /api/settings") {
      const { changes } = JSON.parse(init.body ?? "{}") as { changes: { foxEndAt: string } };
      state.puts.push(changes.foxEndAt);
      if (state.putStatus !== 200) return json({ issues: [{ path: "foxEndAt", message: "refusé" }] }, 422);
      state.endAt = changes.foxEndAt;
      return json(viewOf(state.endAt));
    }
    throw new TypeError(`route inconnue : ${route}`);
  };
  return { state, fetchFn };
};

// Une touche d'essai : tous les titres posés, dans l'ordre, et le nombre d'alertes.
const keyOf = () => {
  const shown = { titles: [] as string[], alerts: 0 };
  const key: EndStepKey = {
    setTitle: async (title) => {
      shown.titles.push(title);
    },
    showAlert: async () => {
      shown.alerts += 1;
    },
  };
  return { key, shown, last: () => shown.titles.at(-1) };
};

const logOf = () => ({ warn: vi.fn(), error: vi.fn() });

// Il est 21:47 ; la fin du serveur est celle du test.
const setup = (initial: string) => {
  const server = serverOf(initial);
  const feed = new SettingsFeed(BASE, server.fetchFn);
  const log = logOf();
  const keys = new EndTimeKeys(feed, Date.now, log);
  const laterKey = keyOf();
  const soonerKey = keyOf();
  keys.appear("later-1", "later", laterKey.key);
  keys.appear("sooner-1", "sooner", soonerKey.key);
  return { server, feed, log, keys, laterKey, soonerKey };
};

const flush = () => vi.advanceTimersByTimeAsync(0);

describe("toEndKeyTitle", () => {
  it("écrit le sens sur la première ligne et l'heure de fin sur la seconde", () => {
    expect(toEndKeyTitle("later", "23:00")).toBe("+10 min\n23:00");
    expect(toEndKeyTitle("sooner", "23:00")).toBe("−10 min\n23:00");
  });

  it("écrit --:-- quand il n'y a pas de fin", () => {
    expect(toEndKeyTitle("later", "")).toBe("+10 min\n--:--");
    expect(toEndKeyTitle("sooner", "")).toBe("−10 min\n--:--");
  });
});

describe("EndTimeKeys : les touches de la fin du live", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 9, 14, 21, 47));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("montre la fin réglée sur le serveur dans les deux sens, ou --:-- sans fin", async () => {
    const { laterKey, soonerKey } = setup(end(23, 0));
    await flush();
    expect(laterKey.last()).toBe("+10 min\n23:00");
    expect(soonerKey.last()).toBe("−10 min\n23:00");
    const empty = setup("");
    await flush();
    expect(empty.laterKey.last()).toBe("+10 min\n--:--");
  });

  it("montre le sens seul tant que le serveur n'a pas répondu", () => {
    const { laterKey, soonerKey } = setup(end(23, 0));
    expect(laterKey.last()).toBe("+10 min");
    expect(soonerKey.last()).toBe("−10 min");
  });

  it("fait un cran et une seule écriture pour un appui bref : 21:47 sans fin donne 21:50", async () => {
    const { keys, server, laterKey, soonerKey } = setup("");
    await flush();
    await keys.press("later-1");
    expect(laterKey.last()).toBe("+10 min\n21:50");
    expect(server.state.puts).toEqual([]);
    await keys.release("later-1");
    expect(server.state.puts).toEqual([end(21, 50)]);
    expect(laterKey.last()).toBe("+10 min\n21:50");
    expect(laterKey.shown.alerts).toBe(0);
    expect(soonerKey.last()).toBe("−10 min\n21:50");
  });

  it("relit le serveur à l'appui : il part de la fin du moment, pas de celle d'il y a 10 s", async () => {
    const { keys, server, laterKey } = setup(end(23, 0));
    await flush();
    server.state.endAt = end(23, 30);
    await keys.press("later-1");
    await keys.release("later-1");
    expect(server.state.puts).toEqual([end(23, 40)]);
    expect(laterKey.last()).toBe("+10 min\n23:40");
  });

  it("maintenu 1,4 s, fait un cran à l'appui, un à 500 ms puis de plus en plus vite, et n'envoie qu'au relâché", async () => {
    const { keys, server, laterKey } = setup("");
    await flush();
    await keys.press("later-1");
    const afterPress = laterKey.shown.titles.length;
    expect(laterKey.last()).toBe("+10 min\n21:50");
    await vi.advanceTimersByTimeAsync(499);
    expect(laterKey.last()).toBe("+10 min\n21:50");
    await vi.advanceTimersByTimeAsync(1);
    expect(laterKey.last()).toBe("+10 min\n22:00");
    await vi.advanceTimersByTimeAsync(299);
    expect(laterKey.last()).toBe("+10 min\n22:00");
    await vi.advanceTimersByTimeAsync(1);
    expect(laterKey.last()).toBe("+10 min\n22:10");
    await vi.advanceTimersByTimeAsync(254);
    expect(laterKey.last()).toBe("+10 min\n22:10");
    await vi.advanceTimersByTimeAsync(1);
    expect(laterKey.last()).toBe("+10 min\n22:20");
    await vi.advanceTimersByTimeAsync(345);
    expect(laterKey.shown.titles.slice(afterPress)).toEqual([
      "+10 min\n22:00",
      "+10 min\n22:10",
      "+10 min\n22:20",
      "+10 min\n22:30",
    ]);
    expect(server.state.puts).toEqual([]);
    await keys.release("later-1");
    expect(server.state.puts).toEqual([end(22, 30)]);
    expect(laterKey.last()).toBe("+10 min\n22:30");
  });

  it("ne change plus rien après le relâché : plus de cran, plus d'écriture", async () => {
    const { keys, server, laterKey } = setup("");
    await flush();
    await keys.press("later-1");
    await keys.release("later-1");
    const titles = laterKey.shown.titles.length;
    await vi.advanceTimersByTimeAsync(3000);
    expect(server.state.puts).toEqual([end(21, 50)]);
    expect(laterKey.shown.titles.length).toBe(titles);
  });

  it("montre à l'autre touche la valeur qui défile pendant le maintien, avec son libellé, puis celle du serveur après l'écriture", async () => {
    const { keys, server, soonerKey } = setup("");
    await flush();
    await keys.press("later-1");
    await vi.advanceTimersByTimeAsync(1400);
    expect(soonerKey.last()).toBe("−10 min\n22:30");
    expect(server.state.puts).toEqual([]);
    await keys.release("later-1");
    expect(soonerKey.last()).toBe("−10 min\n22:30");
    expect(server.state.puts).toEqual([end(22, 30)]);
  });

  it("garde le titre local malgré une relecture du serveur pendant le maintien", async () => {
    const { keys, server, laterKey } = setup("");
    await flush();
    await keys.press("later-1");
    await vi.advanceTimersByTimeAsync(10_000);
    expect(server.state.gets).toBeGreaterThanOrEqual(3);
    expect(laterKey.last()).not.toBe("+10 min\n--:--");
    expect(laterKey.last()).toMatch(/^\+10 min\n\d\d:\d0$/);
    await keys.release("later-1");
  });

  it("montre --:-- à la relecture suivante quand le serveur a effacé la fin", async () => {
    const { server, laterKey, soonerKey } = setup(end(23, 0));
    await flush();
    expect(laterKey.last()).toBe("+10 min\n23:00");
    server.state.endAt = "";
    await vi.advanceTimersByTimeAsync(10_000);
    expect(laterKey.last()).toBe("+10 min\n--:--");
    expect(soonerKey.last()).toBe("−10 min\n--:--");
  });

  it("repart de la dizaine qui suit maintenant quand la fin du serveur est dépassée : 21:00 à 21:47 donne 21:50 avec +10", async () => {
    const { keys, server, laterKey } = setup(end(21, 0));
    await flush();
    await keys.press("later-1");
    await keys.release("later-1");
    expect(server.state.puts).toEqual([end(21, 50)]);
    expect(laterKey.last()).toBe("+10 min\n21:50");
  });

  it("efface une fin dépassée avec −10 : 21:00 à 21:47", async () => {
    const { keys, server, soonerKey } = setup(end(21, 0));
    await flush();
    await keys.press("sooner-1");
    await keys.release("sooner-1");
    expect(server.state.puts).toEqual([""]);
    expect(soonerKey.last()).toBe("−10 min\n--:--");
  });

  it("recule d'un cran à l'appui sur −10 : 23:00 donne 22:50", async () => {
    const { keys, server, soonerKey } = setup(end(23, 0));
    await flush();
    await keys.press("sooner-1");
    expect(soonerKey.last()).toBe("−10 min\n22:50");
    await keys.release("sooner-1");
    expect(server.state.puts).toEqual([end(22, 50)]);
  });

  it("efface la fin en maintenant −10 sous l'heure actuelle, puis s'arrête là", async () => {
    const { keys, server, soonerKey } = setup(end(22, 10));
    await flush();
    await keys.press("sooner-1");
    await vi.advanceTimersByTimeAsync(800);
    expect(soonerKey.last()).toBe("−10 min\n--:--");
    const titles = soonerKey.shown.titles.length;
    await vi.advanceTimersByTimeAsync(3000);
    expect(soonerKey.shown.titles.length).toBe(titles);
    await keys.release("sooner-1");
    expect(server.state.puts).toEqual([""]);
    expect(soonerKey.last()).toBe("−10 min\n--:--");
  });

  it("n'envoie rien quand le cran ne change rien : −10 sans fin", async () => {
    const { keys, server, soonerKey } = setup("");
    await flush();
    await keys.press("sooner-1");
    await vi.advanceTimersByTimeAsync(2000);
    await keys.release("sooner-1");
    expect(server.state.puts).toEqual([]);
    expect(soonerKey.shown.alerts).toBe(0);
    expect(soonerKey.last()).toBe("−10 min\n--:--");
  });

  it("s'arrête au plafond de 24 h sans rien envoyer de plus : 21:30 demain donne 21:40 et pas plus", async () => {
    const { keys, server, laterKey } = setup(end(21, 30, 15));
    await flush();
    await keys.press("later-1");
    await vi.advanceTimersByTimeAsync(3000);
    expect(laterKey.last()).toBe("+10 min\n21:40");
    await keys.release("later-1");
    expect(server.state.puts).toEqual([end(21, 40, 15)]);
  });

  it("maintenu longtemps à 02:56, passe 14:50 et ne s'arrête qu'à 02:50 le lendemain, 24 h devant", async () => {
    vi.setSystemTime(new Date(2026, 9, 15, 2, 56));
    const { keys, server, laterKey } = setup("");
    await flush();
    await keys.press("later-1");
    await vi.advanceTimersByTimeAsync(60_000);
    expect(laterKey.shown.titles).toContain("+10 min\n14:50");
    expect(laterKey.last()).toBe("+10 min\n02:50");
    await keys.release("later-1");
    expect(server.state.puts).toEqual([end(2, 50, 16)]);
  });

  it("fait un cran et une écriture quand le relâché arrive avant la réponse du serveur", async () => {
    const { keys, server, laterKey } = setup("");
    await flush();
    let open: () => void = () => undefined;
    server.state.gate = new Promise<void>((resolve) => {
      open = resolve;
    });
    const pressing = keys.press("later-1");
    await keys.release("later-1");
    expect(server.state.puts).toEqual([]);
    open();
    await pressing;
    expect(server.state.puts).toEqual([end(21, 50)]);
    expect(laterKey.last()).toBe("+10 min\n21:50");
  });

  it("dit que le serveur est éteint à l'appui, avec l'alerte, sans rien envoyer", async () => {
    const { keys, server, laterKey } = setup(end(23, 0));
    await flush();
    server.state.isDown = true;
    await keys.press("later-1");
    expect(laterKey.last()).toBe(SERVER_DOWN_TITLE);
    expect(laterKey.shown.alerts).toBe(1);
    await keys.release("later-1");
    expect(server.state.puts).toEqual([]);
  });

  it("dit que le serveur est à relancer quand il répond autre chose que les réglages", async () => {
    const feed = new SettingsFeed(BASE, async () => json({ nope: true }));
    const keys = new EndTimeKeys(feed, Date.now, logOf());
    const odd = keyOf();
    keys.appear("odd", "later", odd.key);
    await flush();
    expect(odd.last()).toBe(SERVER_TO_RESTART_TITLE);
    await keys.press("odd");
    expect(odd.last()).toBe(SERVER_TO_RESTART_TITLE);
    expect(odd.shown.alerts).toBe(1);
  });

  it("alerte et dit que le serveur est éteint quand il s'éteint pendant le maintien", async () => {
    const { keys, server, laterKey } = setup("");
    await flush();
    await keys.press("later-1");
    server.state.isDown = true;
    await keys.release("later-1");
    expect(server.state.puts).toEqual([]);
    expect(laterKey.shown.alerts).toBe(1);
    expect(laterKey.last()).toBe(SERVER_DOWN_TITLE);
  });

  it("alerte quand le serveur refuse l'heure, journalise le refus et reprend la fin du serveur", async () => {
    const { keys, server, log, laterKey } = setup(end(23, 0));
    await flush();
    server.state.putStatus = 422;
    await keys.press("later-1");
    await keys.release("later-1");
    expect(server.state.puts).toEqual([end(23, 10)]);
    expect(laterKey.shown.alerts).toBe(1);
    expect(laterKey.last()).toBe("+10 min\n23:00");
    expect(log.warn).toHaveBeenCalledWith("Le serveur refuse la fin du live.", [
      { path: "foxEndAt", message: "refusé" },
    ]);
  });

  it("ne garde rien d'un appui abandonné quand la touche disparaît en plein maintien", async () => {
    const { keys, server, laterKey } = setup("");
    await flush();
    await keys.press("later-1");
    keys.disappear("later-1");
    const titles = laterKey.shown.titles.length;
    await vi.advanceTimersByTimeAsync(3000);
    await keys.release("later-1");
    expect(laterKey.shown.titles.length).toBe(titles);
    expect(server.state.puts).toEqual([]);
  });

  it("enchaîne deux appuis brefs : le second part de la fin écrite par le premier", async () => {
    const { keys, server } = setup("");
    await flush();
    await keys.press("later-1");
    await keys.release("later-1");
    await keys.press("later-1");
    await keys.release("later-1");
    expect(server.state.puts).toEqual([end(21, 50), end(22, 0)]);
  });

  it("ignore un appui sur une touche inconnue", async () => {
    const { keys, server } = setup("");
    await flush();
    await keys.press("autre");
    await keys.release("autre");
    expect(server.state.gets).toBe(1);
    expect(server.state.puts).toEqual([]);
  });
});

describe("toHoldGap : l'écart entre deux crans d'un maintien", () => {
  it("part de 300 ms et se multiplie par 0,85 à chaque cran : 300, 255, 217, 184…", () => {
    expect([0, 1, 2, 3, 4, 5, 6, 7, 8, 9].map(toHoldGap)).toEqual([
      300, 255, 217, 184, 157, 133, 113, 96, 82, 69,
    ]);
  });

  it("ne descend jamais sous 60 ms, aussi longtemps que dure le maintien", () => {
    expect([10, 11, 12, 50, 1000].map(toHoldGap)).toEqual([60, 60, 60, 60, 60]);
  });

  it("ne remonte jamais : chaque écart est au plus celui d'avant", () => {
    const gaps = Array.from({ length: 40 }, (_, index) => toHoldGap(index));
    for (const [index, gap] of gaps.entries()) expect(gap).toBeLessThanOrEqual(gaps[index - 1] ?? 300);
  });
});

describe("EndTimeKeys : la vitesse du maintien", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 9, 14, 21, 47));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  // Maintient +10 `ms` depuis rien à 21:47 : le titre de la touche à cet instant, puis ce que le serveur reçoit au relâché.
  const holdFor = async (ms: number) => {
    const { keys, server, laterKey } = setup("");
    await flush();
    await keys.press("later-1");
    await vi.advanceTimersByTimeAsync(ms);
    const held = { title: laterKey.last(), puts: [...server.state.puts] };
    await keys.release("later-1");
    return { held, puts: server.state.puts };
  };

  it("a fait 3 crans après 1 s : 21:50 à l'appui, 22:00 à 0,5 s, 22:10 à 0,8 s", async () => {
    const { held, puts } = await holdFor(1000);
    expect(held).toEqual({ title: "+10 min\n22:10", puts: [] });
    expect(puts).toEqual([end(22, 10)]);
  });

  it("a fait 26 crans après 3 s : l'écart est tombé à 60 ms, 02:00", async () => {
    const { held, puts } = await holdFor(3000);
    expect(held).toEqual({ title: "+10 min\n02:00", puts: [] });
    expect(puts).toEqual([end(2, 0, 15)]);
  });

  it("a fait 110 crans après 8 s, 21:50 + 18 h 10 donne 16:00, sans rien envoyer avant le relâché", async () => {
    const { held, puts } = await holdFor(8000);
    expect(held).toEqual({ title: "+10 min\n16:00", puts: [] });
    expect(puts).toEqual([end(16, 0, 15)]);
  });

  it("arrive au plafond de 24 h en 10 s, soit 144 crans, et s'y arrête avec une seule écriture", async () => {
    const { keys, server, laterKey } = setup("");
    await flush();
    await keys.press("later-1");
    await vi.advanceTimersByTimeAsync(9990);
    expect(laterKey.last()).toBe("+10 min\n21:30");
    await vi.advanceTimersByTimeAsync(36);
    expect(laterKey.last()).toBe("+10 min\n21:40");
    const titles = laterKey.shown.titles.length;
    await vi.advanceTimersByTimeAsync(5000);
    // Seule la relecture des 10 s repose encore un titre, et c'est le même.
    expect(new Set(laterKey.shown.titles.slice(titles - 1))).toEqual(new Set(["+10 min\n21:40"]));
    expect(server.state.puts).toEqual([]);
    await keys.release("later-1");
    expect(server.state.puts).toEqual([end(21, 40, 15)]);
  });

  it("va aussi vite en arrière : −10 efface en 1,3 s une fin à 22:30, une seule écriture", async () => {
    const { keys, server, soonerKey } = setup(end(22, 30));
    await flush();
    await keys.press("sooner-1");
    expect(soonerKey.last()).toBe("−10 min\n22:20");
    await vi.advanceTimersByTimeAsync(1271);
    expect(soonerKey.last()).toBe("−10 min\n21:50");
    await vi.advanceTimersByTimeAsync(1);
    expect(soonerKey.last()).toBe("−10 min\n--:--");
    expect(server.state.puts).toEqual([]);
    await keys.release("sooner-1");
    expect(server.state.puts).toEqual([""]);
  });

  it("repart du premier écart à chaque appui : un second maintien recommence à 500 ms puis 300 ms", async () => {
    const { keys, laterKey } = setup("");
    await flush();
    await keys.press("later-1");
    await vi.advanceTimersByTimeAsync(3000);
    await keys.release("later-1");
    await keys.press("later-1");
    const from = laterKey.last();
    await vi.advanceTimersByTimeAsync(499);
    expect(laterKey.last()).toBe(from);
    await vi.advanceTimersByTimeAsync(1);
    expect(laterKey.last()).not.toBe(from);
    const afterFirstRepeat = laterKey.last();
    await vi.advanceTimersByTimeAsync(299);
    expect(laterKey.last()).toBe(afterFirstRepeat);
    await vi.advanceTimersByTimeAsync(1);
    expect(laterKey.last()).not.toBe(afterFirstRepeat);
    await keys.release("later-1");
  });
});

describe("EndTimeKeys : toutes les touches de fin suivent la touche tenue", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 9, 14, 21, 47));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  const hourOf = (titles: readonly string[]): string[] => titles.map((title) => title.split("\n")[1] ?? "");
  const SCROLL = ["21:50", "22:00", "22:10", "22:20", "22:30"];

  it("envoie à la touche −10 chaque cran de +10 avec son libellé, comme à la touche tenue", async () => {
    const { keys, laterKey, soonerKey } = setup("");
    await flush();
    await keys.press("later-1");
    // Le premier cran est déjà posé (la lecture du serveur à l'appui a reposé la fin du serveur juste avant).
    expect(laterKey.last()).toBe("+10 min\n21:50");
    expect(soonerKey.last()).toBe("−10 min\n21:50");
    const fromLater = laterKey.shown.titles.length;
    const fromSooner = soonerKey.shown.titles.length;
    await vi.advanceTimersByTimeAsync(1400);
    const held = laterKey.shown.titles.slice(fromLater);
    const neighbour = soonerKey.shown.titles.slice(fromSooner);
    expect(hourOf(held)).toEqual(SCROLL.slice(1));
    expect(hourOf(neighbour)).toEqual(SCROLL.slice(1));
    expect(held.every((title) => title.startsWith("+10 min\n"))).toBe(true);
    expect(neighbour.every((title) => title.startsWith("−10 min\n"))).toBe(true);
    await keys.release("later-1");
  });

  it("montre le défilement à toutes les touches de fin, du même sens comme de l'autre", async () => {
    const { keys, soonerKey } = setup("");
    const twin = keyOf();
    keys.appear("later-2", "later", twin.key);
    await flush();
    await keys.press("sooner-1");
    await keys.release("sooner-1");
    expect(twin.last()).toBe("+10 min\n--:--");
    await keys.press("later-1");
    await vi.advanceTimersByTimeAsync(800);
    expect(twin.last()).toBe("+10 min\n22:10");
    expect(soonerKey.last()).toBe("−10 min\n22:10");
    await keys.release("later-1");
  });

  it("ramène toutes les touches à la fin du serveur quand il refuse l'heure, l'alerte restant sur la touche tenue", async () => {
    const { keys, server, laterKey, soonerKey } = setup(end(23, 0));
    await flush();
    server.state.putStatus = 422;
    await keys.press("later-1");
    await vi.advanceTimersByTimeAsync(1400);
    expect(soonerKey.last()).not.toBe("−10 min\n23:00");
    await keys.release("later-1");
    expect(laterKey.last()).toBe("+10 min\n23:00");
    expect(soonerKey.last()).toBe("−10 min\n23:00");
    expect(laterKey.shown.alerts).toBe(1);
    expect(soonerKey.shown.alerts).toBe(0);
  });

  it("ignore un appui sur −10 pendant le maintien de +10 : rien ne se lit, ne défile ni ne s'envoie", async () => {
    const { keys, server, laterKey, soonerKey } = setup("");
    await flush();
    await keys.press("later-1");
    const gets = server.state.gets;
    await keys.press("sooner-1");
    await vi.advanceTimersByTimeAsync(1400);
    await keys.release("sooner-1");
    expect(server.state.gets).toBe(gets);
    expect(server.state.puts).toEqual([]);
    expect(soonerKey.shown.alerts).toBe(0);
    expect(laterKey.last()).toBe("+10 min\n22:30");
    await keys.release("later-1");
    expect(server.state.puts).toEqual([end(22, 30)]);
  });

  it("ignore aussi l'appui sur une autre touche du même sens", async () => {
    const { keys, server } = setup("");
    const twin = keyOf();
    keys.appear("later-2", "later", twin.key);
    await flush();
    await keys.press("later-1");
    await keys.press("later-2");
    await keys.release("later-2");
    await vi.advanceTimersByTimeAsync(800);
    await keys.release("later-1");
    expect(server.state.puts).toEqual([end(22, 10)]);
  });

  it("reprend la main à une autre touche une fois la première relâchée et écrite", async () => {
    const { keys, server, soonerKey } = setup("");
    await flush();
    await keys.press("later-1");
    await keys.release("later-1");
    await keys.press("sooner-1");
    expect(soonerKey.last()).toBe("−10 min\n--:--");
    await keys.release("sooner-1");
    expect(server.state.puts).toEqual([end(21, 50), ""]);
  });

  it("vide le brouillon quand la touche tenue disparaît : les autres reviennent au serveur, rien n'est envoyé", async () => {
    const { keys, server, soonerKey } = setup("");
    const twin = keyOf();
    keys.appear("later-2", "later", twin.key);
    await flush();
    await keys.press("later-1");
    await vi.advanceTimersByTimeAsync(1400);
    expect(soonerKey.last()).toBe("−10 min\n22:30");
    keys.disappear("later-1");
    await flush();
    expect(soonerKey.last()).toBe("−10 min\n--:--");
    expect(twin.last()).toBe("+10 min\n--:--");
    const titles = soonerKey.shown.titles.length;
    await vi.advanceTimersByTimeAsync(3000);
    await keys.release("later-1");
    expect(soonerKey.shown.titles.length).toBe(titles);
    expect(server.state.puts).toEqual([]);
    await keys.press("later-2");
    await keys.release("later-2");
    expect(server.state.puts).toEqual([end(21, 50)]);
  });

  it("garde le brouillon quand c'est une autre touche qui disparaît", async () => {
    const { keys, server, soonerKey } = setup("");
    await flush();
    await keys.press("later-1");
    keys.disappear("sooner-1");
    await vi.advanceTimersByTimeAsync(800);
    const titles = soonerKey.shown.titles.length;
    await keys.release("later-1");
    expect(server.state.puts).toEqual([end(22, 10)]);
    expect(soonerKey.shown.titles.length).toBe(titles);
  });
});

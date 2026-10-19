import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MONITOR_SHEET_GAP_MS, MONITOR_THUMBNAIL_GAP_MS, watchMonitor } from "./monitor-feed";

const GAP_MS = 1000;

// Une fausse <img> : elle charge ou échoue quand le test le dit.
class FakeImage {
  onload: (() => void) | null = null;
  onerror: (() => void) | null = null;
  src = "";

  decode(): Promise<void> {
    return Promise.resolve();
  }
}

// Un faux serveur, de fausses images et une fausse page : chaque demande attend qu'on la termine, de quoi voir ce qui est demandé et quand.
const setup = () => {
  const requests: { signal: AbortSignal; respond: (response: Response) => void }[] = [];
  const signals: AbortSignal[] = [];
  const images: FakeImage[] = [];
  const shown: string[] = [];
  const visibilityListeners = new Set<() => void>();
  const page = { visibilityState: "visible" };
  const serverStub = vi.fn(
    (_path: string, init?: RequestInit) =>
      new Promise<Response>((resolve, reject) => {
        const signal = init?.signal ?? new AbortController().signal;
        signals.push(signal);
        requests.push({ signal, respond: resolve });
        signal.addEventListener("abort", () => reject(new DOMException("abandonnée", "AbortError")));
      }),
  );
  vi.stubGlobal("fetch", serverStub);
  vi.stubGlobal(
    "Image",
    class extends FakeImage {
      constructor() {
        super();
        images.push(this);
      }
    },
  );
  vi.stubGlobal("document", {
    get visibilityState() {
      return page.visibilityState;
    },
    addEventListener: (_type: string, listener: () => void) => visibilityListeners.add(listener),
    removeEventListener: (_type: string, listener: () => void) => visibilityListeners.delete(listener),
  });
  return {
    serverStub,
    signals,
    shown,
    listenerCount: () => visibilityListeners.size,
    watch: (gapMs = GAP_MS) => watchMonitor(gapMs, (url) => shown.push(url)),
    // Le serveur répond à la plus ancienne demande en attente.
    answer: async (status = 200) => {
      requests.shift()?.respond(new Response(new Blob(["jpeg"]), { status }));
      await vi.advanceTimersByTimeAsync(0);
    },
    // Le navigateur finit de charger la dernière image (ou n'y arrive pas).
    loadImage: async (isDecoded = true) => {
      const image = images.at(-1);
      if (isDecoded) image?.onload?.();
      else image?.onerror?.();
      await vi.advanceTimersByTimeAsync(0);
    },
    setVisibility: async (visibilityState: "visible" | "hidden") => {
      page.visibilityState = visibilityState;
      for (const listener of visibilityListeners) listener();
      await vi.advanceTimersByTimeAsync(0);
    },
  };
};

beforeEach(() => {
  vi.useFakeTimers();
  vi.spyOn(URL, "createObjectURL");
  vi.spyOn(URL, "revokeObjectURL");
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("les délais du retour antenne", () => {
  it("redemande plus vite l'image quand la feuille est ouverte que pour la vignette", () => {
    expect(MONITOR_THUMBNAIL_GAP_MS).toBe(1000);
    expect(MONITOR_SHEET_GAP_MS).toBe(250);
  });
});

describe("watchMonitor", () => {
  it("Quand une image arrive, le système doit la montrer par une adresse blob: puis demander la suivante seulement après le délai", async () => {
    const world = setup();
    const stop = world.watch();
    expect(world.serverStub).toHaveBeenCalledWith(
      "/api/obs/monitor",
      expect.objectContaining({ cache: "no-store" }),
    );
    await world.answer();
    await world.loadImage();
    expect(world.shown).toHaveLength(1);
    expect(world.shown[0]).toMatch(/^blob:/);
    await vi.advanceTimersByTimeAsync(GAP_MS - 1);
    expect(world.serverStub).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1);
    expect(world.serverStub).toHaveBeenCalledTimes(2);
    stop();
  });

  it("compte le délai depuis l'image montrée, pas depuis la demande", async () => {
    const world = setup();
    const stop = world.watch();
    await vi.advanceTimersByTimeAsync(700);
    await world.answer();
    await world.loadImage();
    await vi.advanceTimersByTimeAsync(GAP_MS - 1);
    expect(world.serverStub).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1);
    expect(world.serverStub).toHaveBeenCalledTimes(2);
    stop();
  });

  it("ne fait pas de deuxième demande pendant qu'une attend, tant qu'elle n'a pas atteint sa limite de 5 s", async () => {
    const world = setup();
    const stop = world.watch();
    await vi.advanceTimersByTimeAsync(4999);
    expect(world.serverStub).toHaveBeenCalledTimes(1);
    expect(world.shown).toEqual([]);
    stop();
  });

  it("Quand le serveur ne répond pas, le système doit abandonner la requête au bout de 5 s et en relancer une après le délai", async () => {
    const world = setup();
    const stop = world.watch();
    await vi.advanceTimersByTimeAsync(4999);
    expect(world.signals[0]?.aborted).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    expect(world.signals[0]?.aborted).toBe(true);
    expect(world.shown).toEqual([]);
    await vi.advanceTimersByTimeAsync(GAP_MS - 1);
    expect(world.serverStub).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1);
    expect(world.serverStub).toHaveBeenCalledTimes(2);
    expect(world.signals[1]?.aborted).toBe(false);
    stop();
  });

  it("compte la limite de 5 s depuis le départ de chaque requête, sans abandonner la suivante avec la première", async () => {
    const world = setup();
    const stop = world.watch();
    await vi.advanceTimersByTimeAsync(5000 + GAP_MS);
    expect(world.serverStub).toHaveBeenCalledTimes(2);
    await vi.advanceTimersByTimeAsync(4999);
    expect(world.signals[1]?.aborted).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    expect(world.signals[1]?.aborted).toBe(true);
    stop();
  });

  it("n'abandonne pas une requête qui a répondu à temps", async () => {
    const world = setup();
    const stop = world.watch();
    await vi.advanceTimersByTimeAsync(100);
    await world.answer();
    await world.loadImage();
    await vi.advanceTimersByTimeAsync(5000);
    expect(world.signals[0]?.aborted).toBe(false);
    expect(world.shown).toHaveLength(1);
    stop();
  });

  it("ne fait pas de deuxième demande pendant que le navigateur charge l'image", async () => {
    const world = setup();
    const stop = world.watch();
    await world.answer();
    await vi.advanceTimersByTimeAsync(10_000);
    expect(world.serverStub).toHaveBeenCalledTimes(1);
    expect(world.shown).toEqual([]);
    stop();
  });

  it("ne montre rien quand le serveur refuse (502, OBS non joint) et retente après le délai", async () => {
    const world = setup();
    const stop = world.watch();
    await world.answer(502);
    expect(world.shown).toEqual([]);
    expect(URL.createObjectURL).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(GAP_MS);
    expect(world.serverStub).toHaveBeenCalledTimes(2);
    stop();
  });

  it("ne montre pas une image que le navigateur ne décode pas, révoque son adresse et retente après le délai", async () => {
    const world = setup();
    const stop = world.watch();
    await world.answer();
    const created = vi.mocked(URL.createObjectURL).mock.results[0]?.value;
    expect(created).toMatch(/^blob:/);
    await world.loadImage(false);
    expect(world.shown).toEqual([]);
    expect(URL.revokeObjectURL).toHaveBeenCalledWith(created);
    await vi.advanceTimersByTimeAsync(GAP_MS);
    expect(world.serverStub).toHaveBeenCalledTimes(2);
    stop();
  });

  it("ne demande rien page cachée, et demande tout de suite à son retour", async () => {
    const world = setup();
    await world.setVisibility("hidden");
    const stop = world.watch();
    await vi.advanceTimersByTimeAsync(10_000);
    expect(world.serverStub).not.toHaveBeenCalled();
    await world.setVisibility("visible");
    expect(world.serverStub).toHaveBeenCalledTimes(1);
    stop();
  });

  it("s'arrête de demander quand la page se cache entre deux images, et reprend à son retour", async () => {
    const world = setup();
    const stop = world.watch();
    await world.answer();
    await world.loadImage();
    await world.setVisibility("hidden");
    await vi.advanceTimersByTimeAsync(10_000);
    expect(world.serverStub).toHaveBeenCalledTimes(1);
    await world.setVisibility("visible");
    expect(world.serverStub).toHaveBeenCalledTimes(2);
    stop();
  });

  it("ne double pas la demande quand la page revient pendant qu'une attend", async () => {
    const world = setup();
    const stop = world.watch();
    await world.setVisibility("hidden");
    await world.setVisibility("visible");
    expect(world.serverStub).toHaveBeenCalledTimes(1);
    stop();
  });

  it("à l'arrêt, abandonne la demande en cours, ne montre rien ensuite et ne demande plus rien", async () => {
    const world = setup();
    const stop = world.watch();
    stop();
    expect(world.signals[0]?.aborted).toBe(true);
    await vi.advanceTimersByTimeAsync(10_000);
    expect(world.shown).toEqual([]);
    expect(world.serverStub).toHaveBeenCalledTimes(1);
    expect(world.listenerCount()).toBe(0);
    await world.setVisibility("hidden");
    await world.setVisibility("visible");
    expect(world.serverStub).toHaveBeenCalledTimes(1);
  });

  it("à l'arrêt pendant le chargement de l'image, ne la montre pas et révoque son adresse", async () => {
    const world = setup();
    const stop = world.watch();
    await world.answer();
    const created = vi.mocked(URL.createObjectURL).mock.results[0]?.value;
    stop();
    await world.loadImage();
    expect(world.shown).toEqual([]);
    expect(URL.revokeObjectURL).toHaveBeenCalledWith(created);
    await vi.advanceTimersByTimeAsync(10_000);
    expect(world.serverStub).toHaveBeenCalledTimes(1);
  });
});

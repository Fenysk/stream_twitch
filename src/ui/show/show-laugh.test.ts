import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ShowLaugh } from "../../domain/show.schema";
import { createLaughFiles } from "./show-laugh";

// Un faux <audio> : il note son adresse et son volume, et les évènements se déclenchent à la main.
class FakeAudio {
  static instances: FakeAudio[] = [];
  static isPlayRefused = false;
  volume = 1;
  isReleased = false;
  private readonly listeners = new Map<string, () => void>();

  constructor(readonly src: string) {
    FakeAudio.instances.push(this);
  }

  addEventListener(type: string, listener: () => void): void {
    this.listeners.set(type, listener);
  }

  async play(): Promise<void> {
    if (FakeAudio.isPlayRefused) throw new Error("lecture refusée");
  }

  pause(): void {
    this.isReleased = true;
  }

  removeAttribute(): void {
    // Sans effet : l'adresse reste lisible par le test.
  }

  load(): void {
    // Sans effet : rien à recharger.
  }

  emit(type: string): void {
    this.listeners.get(type)?.();
  }
}

const laugh = (id: string, version = "1", at = 1000): ShowLaugh => ({ id, version, fader: 60, at });

// Un faux serveur de fichiers : chaque demande attend qu'on la termine, de quoi voir ce qui est demandé et quand.
const setupServer = () => {
  const requested: string[] = [];
  const pending: ((response: Response) => void)[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn((url: string) => {
      requested.push(url);
      return new Promise<Response>((resolve) => pending.push(resolve));
    }),
  );
  return {
    requested,
    answer: async () => {
      pending.shift()?.(new Response(new Blob(["son"])));
      await vi.advanceTimersByTimeAsync(0);
    },
    fail: async () => {
      pending.shift()?.(new Response("introuvable", { status: 404 }));
      await vi.advanceTimersByTimeAsync(0);
    },
  };
};

beforeEach(() => {
  vi.useFakeTimers();
  FakeAudio.instances = [];
  FakeAudio.isPlayRefused = false;
  vi.stubGlobal("Audio", FakeAudio);
  vi.spyOn(console, "error").mockImplementation(() => undefined);
  vi.spyOn(URL, "createObjectURL");
  vi.spyOn(URL, "revokeObjectURL");
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

const NEVER = new Promise<void>(() => undefined);

describe("les fichiers de rire d'une émission", () => {
  it("télécharge chaque fichier une seule fois, par sound et par version, l'un après l'autre", async () => {
    const server = setupServer();
    const files = createLaughFiles(NEVER);
    const preparing = files.prepare([
      laugh("aaaa0001"),
      laugh("aaaa0001", "1", 5000),
      laugh("bbbb0002"),
      laugh("aaaa0001", "2"),
    ]);
    await vi.advanceTimersByTimeAsync(0);
    expect(server.requested).toEqual(["/api/sounds/aaaa0001/file?v=1"]);
    await server.answer();
    expect(server.requested).toEqual(["/api/sounds/aaaa0001/file?v=1", "/api/sounds/bbbb0002/file?v=1"]);
    await server.answer();
    await server.answer();
    await preparing;
    expect(server.requested).toEqual([
      "/api/sounds/aaaa0001/file?v=1",
      "/api/sounds/bbbb0002/file?v=1",
      "/api/sounds/aaaa0001/file?v=2",
    ]);
  });

  it("ne retélécharge rien pour un clip suivant qui a les mêmes rires", async () => {
    const server = setupServer();
    const files = createLaughFiles(NEVER);
    const first = files.prepare([laugh("aaaa0001")]);
    await vi.advanceTimersByTimeAsync(0);
    await server.answer();
    await first;
    await files.prepare([laugh("aaaa0001", "1", 9000)]);
    expect(server.requested).toHaveLength(1);
  });

  it("joue un rire depuis son fichier téléchargé, au fader du sound, jusqu'au bout", async () => {
    const server = setupServer();
    const files = createLaughFiles(NEVER);
    const preparing = files.prepare([laugh("aaaa0001")]);
    await vi.advanceTimersByTimeAsync(0);
    await server.answer();
    await preparing;
    const playing = files.play(laugh("aaaa0001"));
    const [audio] = FakeAudio.instances;
    expect(audio?.src).toMatch(/^blob:/);
    expect(audio?.volume).toBe(0.6);
    audio?.emit("ended");
    expect(await playing).toBe(true);
  });

  it("se rabat sur l'adresse réseau du fichier quand il n'a pas pu se télécharger, sans lever", async () => {
    const server = setupServer();
    const files = createLaughFiles(NEVER);
    const preparing = files.prepare([laugh("aaaa0001"), laugh("bbbb0002")]);
    await vi.advanceTimersByTimeAsync(0);
    await server.fail();
    await server.answer();
    await preparing;
    void files.play(laugh("aaaa0001"));
    void files.play(laugh("bbbb0002"));
    expect(FakeAudio.instances[0]?.src).toBe("/api/sounds/aaaa0001/file?v=1");
    expect(FakeAudio.instances[1]?.src).toMatch(/^blob:/);
  });

  it("joue depuis le réseau un rire qui n'a jamais été préparé", () => {
    const files = createLaughFiles(NEVER);
    void files.play(laugh("cccc0003", "7"));
    expect(FakeAudio.instances[0]?.src).toBe("/api/sounds/cccc0003/file?v=7");
  });

  it("laisse plusieurs rires jouer en même temps, chacun fini à son tour", async () => {
    const files = createLaughFiles(NEVER);
    const first = files.play(laugh("aaaa0001"));
    const second = files.play(laugh("bbbb0002"));
    expect(FakeAudio.instances).toHaveLength(2);
    FakeAudio.instances[1]?.emit("ended");
    expect(await second).toBe(true);
    FakeAudio.instances[0]?.emit("ended");
    expect(await first).toBe(true);
  });

  it("dit qu'un rire n'a pas joué quand son fichier est illisible ou que le navigateur refuse la lecture", async () => {
    const files = createLaughFiles(NEVER);
    const unreadable = files.play(laugh("aaaa0001"));
    FakeAudio.instances[0]?.emit("error");
    expect(await unreadable).toBe(false);
    FakeAudio.isPlayRefused = true;
    expect(await files.play(laugh("bbbb0002"))).toBe(false);
  });

  it("coupe tous les rires aussitôt quand l'émission s'arrête : ils n'ont pas joué jusqu'au bout", async () => {
    let stop: () => void = () => undefined;
    const aborted = new Promise<void>((resolve) => {
      stop = resolve;
    });
    const files = createLaughFiles(aborted);
    const first = files.play(laugh("aaaa0001"));
    const second = files.play(laugh("bbbb0002"));
    stop();
    expect(await first).toBe(false);
    expect(await second).toBe(false);
    expect(FakeAudio.instances.every(({ isReleased }) => isReleased)).toBe(true);
  });

  it("ne télécharge plus rien une fois libéré : l'émission est finie ou arrêtée", async () => {
    const server = setupServer();
    const files = createLaughFiles(NEVER);
    files.clear();
    await files.prepare([laugh("aaaa0001")]);
    expect(server.requested).toEqual([]);
  });

  it("libère les adresses d'objet des fichiers téléchargés", async () => {
    const server = setupServer();
    const files = createLaughFiles(NEVER);
    const preparing = files.prepare([laugh("aaaa0001"), laugh("bbbb0002")]);
    await vi.advanceTimersByTimeAsync(0);
    await server.answer();
    await server.answer();
    await preparing;
    expect(URL.createObjectURL).toHaveBeenCalledTimes(2);
    files.clear();
    expect(URL.revokeObjectURL).toHaveBeenCalledTimes(2);
  });
});

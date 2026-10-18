import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { getSoundOutput } from "./fox-audio";
import type { SoundPlayback } from "./fox-player";

// Un faux contexte Web Audio : il garde les nœuds créés pour chaque son, de quoi lire ce que le haut-parleur recevrait.
class FakeNode {
  readonly targets: FakeNode[] = [];

  connect(target: FakeNode): void {
    this.targets.push(target);
  }
}

class FakeFader extends FakeNode {
  readonly gain = { value: 1 };
}

class FakeAnalyser extends FakeNode {
  fftSize = 0;

  getFloatTimeDomainData(): void {
    // Rien à mesurer.
  }
}

class FakeSource extends FakeNode {
  buffer: object | undefined;
  onended: (() => void) | undefined;

  start(): void {
    // Rien à jouer.
  }

  stop(): void {
    // Rien à arrêter.
  }
}

class FakeContext {
  static faders: FakeFader[] = [];
  static analysers: FakeAnalyser[] = [];
  static sources: FakeSource[] = [];
  static readonly speaker = new FakeNode();
  state = "running";
  readonly destination = FakeContext.speaker;

  async decodeAudioData(): Promise<object> {
    return {};
  }

  async resume(): Promise<void> {
    // Déjà en marche.
  }

  createBufferSource(): FakeSource {
    const source = new FakeSource();
    FakeContext.sources.push(source);
    return source;
  }

  createAnalyser(): FakeAnalyser {
    const analyser = new FakeAnalyser();
    FakeContext.analysers.push(analyser);
    return analyser;
  }

  createGain(): FakeFader {
    const fader = new FakeFader();
    FakeContext.faders.push(fader);
    return fader;
  }
}

beforeAll(() => {
  vi.stubGlobal("AudioContext", FakeContext);
});

afterAll(() => {
  vi.unstubAllGlobals();
});

beforeEach(() => {
  FakeContext.faders = [];
  FakeContext.analysers = [];
  FakeContext.sources = [];
});

// Joue un son et rend ce qu'on peut en régler, avec le nœud de réglage que le haut-parleur reçoit.
const startSound = async (isMuted: boolean, fader: number) => {
  const output = getSoundOutput();
  if (!output) throw new Error("pas de sortie audio");
  const playback: SoundPlayback = await output.play(new ArrayBuffer(8), () => undefined, isMuted, fader);
  const node = FakeContext.faders[0];
  if (!node) throw new Error("pas de nœud de réglage");
  return { playback, node };
};

describe("la sortie audio du renard : le fader de la voix", () => {
  it("joue à pleine force quand le fader est à 100, et sans son quand elle est muette", async () => {
    expect((await startSound(false, 100)).node.gain.value).toBe(1);
    FakeContext.faders = [];
    expect((await startSound(true, 100)).node.gain.value).toBe(0);
  });

  it("joue dès le premier échantillon au fader reçu", async () => {
    const { node } = await startSound(false, 15);
    expect(node.gain.value).toBeCloseTo(0.15, 6);
  });

  it("Quand le fader passe à 15, la voix doit atteindre 0,15, et revenir à 1 quand il remonte à 100", async () => {
    const { playback, node } = await startSound(false, 100);
    playback.setFader(15);
    expect(node.gain.value).toBeCloseTo(0.15, 6);
    playback.setFader(100);
    expect(node.gain.value).toBe(1);
  });

  it("reste muette quand elle est muette, quel que soit le fader", async () => {
    const { playback, node } = await startSound(true, 100);
    playback.setFader(15);
    expect(node.gain.value).toBe(0);
    playback.setFader(100);
    expect(node.gain.value).toBe(0);
  });

  it("retrouve le fader en cours quand elle cesse d'être muette, et se coupe de nouveau muette", async () => {
    const { playback, node } = await startSound(false, 100);
    playback.setMuted(true);
    playback.setFader(15);
    expect(node.gain.value).toBe(0);
    playback.setMuted(false);
    expect(node.gain.value).toBeCloseTo(0.15, 6);
    playback.setMuted(true);
    expect(node.gain.value).toBe(0);
  });

  it("mesure la voix avant le fader : le level suit la voix entière, même baissée ou muette", async () => {
    const { node } = await startSound(false, 15);
    expect(FakeContext.sources[0]?.targets).toEqual([FakeContext.analysers[0]]);
    expect(FakeContext.analysers[0]?.targets).toEqual([node]);
    expect(node.targets).toEqual([FakeContext.speaker]);
  });
});

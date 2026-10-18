import { describe, expect, it } from "vitest";
import { ANALYSIS_SIZE, createFoxPlayer, type SoundOutput, type SoundPlayback } from "./fox-player";

// Un faux son : il remplit les échantillons d'une amplitude donnée (un signal carré), et note s'il est arrêté.
type FakeSound = {
  amplitude: number;
  isStopped: boolean;
  // Muet au départ, puis à chaque changement : le dernier état est celui que le haut-parleur entend.
  isMuted: boolean;
  // Le fader (0 à 100) de même : au départ, puis à chaque changement.
  fader: number;
  end: () => void;
  playback: SoundPlayback;
};

const setup = (options: { fetchFails?: boolean; decodeDelay?: Promise<void> } = {}) => {
  const sounds: FakeSound[] = [];
  const errors: unknown[] = [];
  const fetched: string[] = [];
  const output: SoundOutput = {
    async play(encoded, onEnd, isMuted, fader) {
      await options.decodeDelay;
      const sound: FakeSound = {
        amplitude: new Uint8Array(encoded)[0] ?? 0,
        isStopped: false,
        isMuted,
        fader,
        end: onEnd,
        playback: {
          setMuted(next) {
            sound.isMuted = next;
          },
          setFader(next) {
            sound.fader = next;
          },
          readSamples(into) {
            into.fill(sound.amplitude / 100);
            if (into.length !== ANALYSIS_SIZE) throw new Error("taille inattendue");
          },
          stop() {
            sound.isStopped = true;
            onEnd();
          },
        },
      };
      sounds.push(sound);
      return sound.playback;
    },
  };
  const player = createFoxPlayer({
    output,
    getSpeech: async (url) => {
      fetched.push(url);
      if (options.fetchFails) throw new Error("introuvable");
      // L'amplitude du faux son vient de l'adresse : /speech/10 joue à 0,10.
      return Uint8Array.from([Number(url.split("/").at(-1))]).buffer;
    },
    onError: (error) => errors.push(error),
  });
  return { player, sounds, errors, fetched };
};

describe("createFoxPlayer : muet ou non", () => {
  it("joue avec le son par défaut", async () => {
    const { player, sounds } = setup();
    await player.play("/s/10");
    expect(sounds[0]?.isMuted).toBe(false);
  });

  it("joue sans son quand il est muet, mais mesure le même level : la bouche bouge", async () => {
    const { player, sounds } = setup();
    player.setMuted(true);
    await player.play("/s/10");
    expect(sounds[0]?.isMuted).toBe(true);
    expect(player.getLevel()).toBeCloseTo(20 * Math.log10(0.1), 6);
  });

  it("coupe le son de la phrase en cours quand il devient muet, et le rend quand il ne l'est plus", async () => {
    const { player, sounds } = setup();
    await player.play("/s/10");
    player.setMuted(true);
    expect(sounds[0]?.isMuted).toBe(true);
    player.setMuted(false);
    expect(sounds[0]?.isMuted).toBe(false);
    expect(player.getLevel()).not.toBeNull();
  });

  it("garde son état muet d'une phrase à la suivante", async () => {
    const { player, sounds } = setup();
    player.setMuted(true);
    await player.play("/s/10");
    await player.play("/s/20");
    expect(sounds.map(({ isMuted }) => isMuted)).toEqual([true, true]);
  });

  it("donne l'état muet le plus récent à un son qui finissait de décoder quand il a changé", async () => {
    let release: () => void = () => undefined;
    const slow = new Promise<void>((resolve) => {
      release = resolve;
    });
    const { player, sounds } = setup({ decodeDelay: slow });
    const playing = player.play("/s/10");
    await new Promise((resolve) => setTimeout(resolve, 0));
    player.setMuted(true);
    release();
    await playing;
    expect(sounds[0]?.isMuted).toBe(true);
  });
});

describe("createFoxPlayer : le fader de la voix", () => {
  it("joue au fader entier par défaut", async () => {
    const { player, sounds } = setup();
    await player.play("/s/10");
    expect(sounds[0]?.fader).toBe(100);
  });

  it("Quand le fader passe à 15, la phrase en cours doit le suivre, et le retrouver quand il remonte à 100", async () => {
    const { player, sounds } = setup();
    await player.play("/s/10");
    player.setFader(15);
    expect(sounds[0]?.fader).toBe(15);
    player.setFader(100);
    expect(sounds[0]?.fader).toBe(100);
  });

  it("garde son fader d'une phrase à la suivante", async () => {
    const { player, sounds } = setup();
    player.setFader(15);
    await player.play("/s/10");
    await player.play("/s/20");
    expect(sounds.map(({ fader }) => fader)).toEqual([15, 15]);
  });

  it("donne le fader le plus récent à un son qui finissait de décoder quand il a changé", async () => {
    let release: () => void = () => undefined;
    const slow = new Promise<void>((resolve) => {
      release = resolve;
    });
    const { player, sounds } = setup({ decodeDelay: slow });
    const playing = player.play("/s/10");
    await new Promise((resolve) => setTimeout(resolve, 0));
    player.setFader(15);
    release();
    await playing;
    expect(sounds[0]?.fader).toBe(15);
  });

  it("ne touche pas au muet, ni au level mesuré : la bouche bouge comme avant", async () => {
    const { player, sounds } = setup();
    player.setMuted(true);
    await player.play("/s/10");
    player.setFader(15);
    expect(sounds[0]?.isMuted).toBe(true);
    player.setMuted(false);
    expect(sounds[0]?.fader).toBe(15);
    expect(player.getLevel()).toBeCloseTo(20 * Math.log10(0.1), 6);
  });
});

describe("createFoxPlayer", () => {
  it("n'a pas de level tant que rien ne joue", () => {
    expect(setup().player.getLevel()).toBeNull();
  });

  it("joue le WAV de l'adresse reçue, et mesure son level en dB à chaque lecture", async () => {
    const { player, fetched } = setup();
    await player.play("/api/fox/speech/10");
    expect(fetched).toEqual(["/api/fox/speech/10"]);
    expect(player.getLevel()).toBeCloseTo(20 * Math.log10(0.1), 6);
  });

  it("suit le son : un signal plus fort donne un level plus haut", async () => {
    const quiet = setup();
    await quiet.player.play("/s/1");
    const loud = setup();
    await loud.player.play("/s/50");
    expect(loud.player.getLevel() ?? -100).toBeGreaterThan(quiet.player.getLevel() ?? 0);
  });

  it("rend le silence à -100 dB, pas moins", async () => {
    const { player } = setup();
    await player.play("/s/0");
    expect(player.getLevel()).toBe(-100);
  });

  it("n'a plus de level quand le son finit", async () => {
    const { player, sounds } = setup();
    await player.play("/s/10");
    sounds[0]?.end();
    expect(player.getLevel()).toBeNull();
  });

  it("arrête le son qui parlait quand un nouveau arrive, et ne mesure que le nouveau", async () => {
    const { player, sounds } = setup();
    await player.play("/s/10");
    await player.play("/s/50");
    expect(sounds[0]?.isStopped).toBe(true);
    expect(sounds[1]?.isStopped).toBe(false);
    expect(player.getLevel()).toBeCloseTo(20 * Math.log10(0.5), 6);
  });

  it("garde le niveau du nouveau son quand l'ancien finit en retard", async () => {
    const { player, sounds } = setup();
    await player.play("/s/10");
    await player.play("/s/50");
    sounds[0]?.end();
    expect(player.getLevel()).not.toBeNull();
  });

  it("se tait quand on l'arrête", async () => {
    const { player, sounds } = setup();
    await player.play("/s/10");
    player.stop();
    expect(sounds[0]?.isStopped).toBe(true);
    expect(player.getLevel()).toBeNull();
  });

  it("annule une lecture encore en chargement quand on l'arrête : le WAV d'un message supprimé ne sonne pas", async () => {
    let release: () => void = () => undefined;
    const slow = new Promise<void>((resolve) => {
      release = resolve;
    });
    const { player, sounds } = setup({ decodeDelay: slow });
    const playing = player.play("/s/10");
    await new Promise((resolve) => setTimeout(resolve, 0));
    player.stop();
    release();
    await playing;
    expect(sounds.every(({ isStopped }) => isStopped)).toBe(true);
    expect(player.getLevel()).toBeNull();
  });

  it("annule une lecture dont le WAV n'est pas encore arrivé quand on l'arrête", async () => {
    const { player, sounds, fetched } = setup();
    const playing = player.play("/s/10");
    player.stop();
    await playing;
    expect(fetched).toEqual(["/s/10"]);
    expect(sounds).toEqual([]);
    expect(player.getLevel()).toBeNull();
  });

  it("joue la phrase suivante après un arrêt : l'arrêt ne coupe que ce qui était en cours", async () => {
    const { player } = setup();
    await player.play("/s/10");
    player.stop();
    await player.play("/s/50");
    expect(player.getLevel()).toBeCloseTo(20 * Math.log10(0.5), 6);
  });

  it("dit l'échec du chargement sans planter, et reste silencieux", async () => {
    const { player, errors } = setup({ fetchFails: true });
    await player.play("/s/10");
    expect(errors).toHaveLength(1);
    expect(player.getLevel()).toBeNull();
  });

  it("ne joue pas une demande dépassée par une plus récente pendant le décodage", async () => {
    let release: () => void = () => undefined;
    const slow = new Promise<void>((resolve) => {
      release = resolve;
    });
    const { player, sounds } = setup({ decodeDelay: slow });
    const first = player.play("/s/10");
    // Le premier a fini de charger et attend son décodage quand le second arrive.
    await new Promise((resolve) => setTimeout(resolve, 0));
    const second = player.play("/s/50");
    release();
    await Promise.all([first, second]);
    expect(sounds).toHaveLength(2);
    expect(sounds.filter(({ isStopped }) => !isStopped)).toHaveLength(1);
    expect(sounds.find(({ isStopped }) => !isStopped)?.amplitude).toBe(50);
    expect(player.getLevel()).toBeCloseTo(20 * Math.log10(0.5), 6);
  });
});

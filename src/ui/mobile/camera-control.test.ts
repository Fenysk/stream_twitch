import { describe, expect, it } from "vitest";
import { toFilmStart, toPhoneLayout } from "../../domain/phone-layout.rules";
import {
  type CameraControl,
  type CameraMedia,
  type CameraState,
  type CameraTrack,
  createCameraControl,
} from "./camera-control";
import {
  type TrackSize,
  toCameraConstraints,
  toReframeConstraints,
  toVideoConstraints,
} from "./camera-media";

const PORTRAIT_SIZE: TrackSize = { width: 1080, height: 1920 };
const LANDSCAPE_SIZE: TrackSize = { width: 1920, height: 1080 };

const toIdeal = (value: ConstrainULong | undefined): number | undefined =>
  typeof value === "object" ? value.ideal : value;

// Une piste : elle se dit arrêtée, et `end` la termine comme le fait Safari qui passe en arrière-plan. Sa taille (`settings`) est celle que le
// navigateur donne ; `applyConstraints` la change comme Safari l'entend (`hears`) : telle qu'elle est demandée, retournée, ou pas du tout.
// `gate` retient la réponse, `failure` la refuse.
class FakeTrack implements CameraTrack {
  isStopped = false;
  settings: TrackSize = {};
  applied: MediaTrackConstraints[] = [];
  hears: "as-asked" | "flipped" | "ignored" = "as-asked";
  failure: unknown = null;
  gate: Promise<void> | null = null;
  private readonly listeners: Array<() => void> = [];

  stop(): void {
    this.isStopped = true;
  }

  getSettings(): TrackSize {
    return this.settings;
  }

  async applyConstraints(constraints: MediaTrackConstraints): Promise<void> {
    this.applied.push(constraints);
    if (this.gate) await this.gate;
    if (this.failure !== null) throw this.failure;
    const width = toIdeal(constraints.width);
    const height = toIdeal(constraints.height);
    if (this.hears === "as-asked") this.settings = { width, height };
    if (this.hears === "flipped") this.settings = { width: height, height: width };
  }

  addEventListener(_type: "ended", listener: () => void): void {
    this.listeners.push(listener);
  }

  end(): void {
    for (const listener of this.listeners) listener();
  }
}

class FakeMedia implements CameraMedia {
  video = new FakeTrack();
  audio = new FakeTrack();
  getTracks = (): CameraTrack[] => [this.video, this.audio];
  getVideoTracks = (): CameraTrack[] => [this.video];
  getAudioTracks = (): CameraTrack[] => [this.audio];
}

type Pending = {
  constraints: MediaStreamConstraints;
  resolve: (media: FakeMedia) => void;
  reject: (error: unknown) => void;
};

const flush = async (): Promise<void> => {
  await Promise.resolve();
  await Promise.resolve();
};

const flushAll = async (): Promise<void> => {
  for (let turn = 0; turn < 20; turn += 1) await Promise.resolve();
};

// La caméra du téléphone à la main : chaque demande à `getUserMedia` attend que le test lui réponde.
const setup = () => {
  const requests: Pending[] = [];
  const states: CameraState<FakeMedia>[] = [];
  const logs: string[] = [];
  const timers: { at: number; callback: () => void }[] = [];
  let now = 0;
  const control: CameraControl = createCameraControl<FakeMedia>({
    getMedia: (constraints) =>
      new Promise<FakeMedia>((resolve, reject) => {
        requests.push({ constraints, resolve, reject });
      }),
    joinMedia: (video, audio) => {
      const joined = new FakeMedia();
      joined.video = video.video;
      joined.audio = audio.audio;
      return joined;
    },
    onChange: (state) => states.push(state),
    schedule(callback, ms) {
      const timer = { at: now + ms, callback };
      timers.push(timer);
      return () => {
        const index = timers.indexOf(timer);
        if (index >= 0) timers.splice(index, 1);
      };
    },
    log: (message) => logs.push(message),
  });
  // `size` : la taille que le navigateur donne à la piste qui arrive.
  const answer = async (index = requests.length - 1, size: TrackSize = {}): Promise<FakeMedia> => {
    const media = new FakeMedia();
    media.video.settings = size;
    requests[index]?.resolve(media);
    await flush();
    return media;
  };
  // Le temps passe : les vérifications échues partent, dans l'ordre.
  const elapse = async (ms: number): Promise<void> => {
    now += ms;
    for (const timer of timers.filter(({ at }) => at <= now)) {
      timers.splice(timers.indexOf(timer), 1);
      timer.callback();
      await flushAll();
    }
  };
  const refuse = async (name: string, index = requests.length - 1): Promise<void> => {
    requests[index]?.reject(new DOMException("non", name));
    await flush();
  };
  const last = (): CameraState<FakeMedia> | undefined => states.at(-1);
  return { control, requests, states, logs, timers, answer, refuse, elapse, last };
};

describe("Filmer : démarrer la caméra", () => {
  it("Quand Filmer est appuyé en portrait, le système doit demander une fois l'objectif avant en 9:16, avec le mic", async () => {
    const { control, requests, answer, last } = setup();
    control.start(toFilmStart("portrait"));
    expect(requests).toHaveLength(1);
    expect(requests[0]?.constraints).toEqual(toCameraConstraints("user", "portrait"));
    expect(last()).toEqual({ stream: null, status: "starting", facing: "user" });
    const media = await answer();
    expect(last()).toEqual({ stream: media, status: "live", facing: "user" });
  });

  it("Quand Filmer est appuyé en paysage, le système doit demander l'objectif arrière en 16:9", () => {
    const { control, requests } = setup();
    control.start(toFilmStart("landscape"));
    expect(requests[0]?.constraints).toEqual(toCameraConstraints("environment", "landscape"));
  });

  it("Quand le téléphone tourne, la caméra n'est pas redemandée : seule la disposition change, jamais l'objectif ni le cadrage", async () => {
    const { control, requests, answer, last } = setup();
    control.start(toFilmStart("portrait"));
    const media = await answer();
    const layouts = (["portrait", "landscape", "portrait"] as const).map((orientation) =>
      toPhoneLayout(true, orientation),
    );
    expect(layouts).toEqual(["film-portrait", "film-landscape", "film-portrait"]);
    expect(requests).toHaveLength(1);
    expect(last()).toEqual({ stream: media, status: "live", facing: "user" });
    expect(media.video.isStopped).toBe(false);
  });

  it("dit le refus du navigateur : refusée par l'utilisateur ou introuvable", async () => {
    const first = setup();
    first.control.start(toFilmStart("landscape"));
    await first.refuse("NotAllowedError");
    expect(first.last()).toMatchObject({ stream: null, status: "denied" });
    const second = setup();
    second.control.start(toFilmStart("landscape"));
    await second.refuse("NotFoundError");
    expect(second.last()).toMatchObject({ stream: null, status: "unavailable" });
    expect(second.logs).toHaveLength(1);
  });
});

describe("la caméra qui tourne", () => {
  it("relance avec le même objectif et le même cadrage que ceux pris à l'appui, quelle que soit l'orientation d'alors", async () => {
    const { control, requests, answer } = setup();
    control.start(toFilmStart("portrait"));
    const first = await answer();
    control.restart();
    expect(first.video.isStopped).toBe(true);
    expect(first.audio.isStopped).toBe(true);
    expect(requests).toHaveLength(2);
    expect(requests[1]?.constraints).toEqual(toCameraConstraints("user", "portrait"));
  });

  it("change d'objectif en gardant le cadrage et le mic : l'ancienne image s'arrête avant, le mic continue", async () => {
    const { control, requests, answer, last } = setup();
    control.start(toFilmStart("portrait"));
    const first = await answer();
    control.switchCamera();
    expect(first.video.isStopped).toBe(true);
    expect(first.audio.isStopped).toBe(false);
    expect(requests[1]?.constraints).toEqual({ video: toVideoConstraints("environment", "portrait") });
    const second = await answer();
    const state = last();
    expect(state?.facing).toBe("environment");
    expect(state?.status).toBe("live");
    expect(state?.stream?.video).toBe(second.video);
    expect(state?.stream?.audio).toBe(first.audio);
  });

  it("Si l'autre objectif ne démarre pas, le système doit relancer le premier avec son cadrage", async () => {
    const { control, requests, answer, refuse, last } = setup();
    control.start(toFilmStart("landscape"));
    await answer();
    control.switchCamera();
    await refuse("OverconstrainedError");
    expect(requests).toHaveLength(3);
    expect(requests[2]?.constraints).toEqual(toCameraConstraints("environment", "landscape"));
    await answer();
    expect(last()?.facing).toBe("environment");
    expect(last()?.status).toBe("live");
  });

  it("ne change pas d'objectif ni ne relance sans caméra en marche ou sans Filmer", () => {
    const { control, requests } = setup();
    control.switchCamera();
    control.restart();
    expect(requests).toHaveLength(0);
  });
});

describe("la caméra qui s'arrête", () => {
  it("Quand une piste se termine seule (Safari en arrière-plan, un appel), le système doit arrêter la caméra et la dire interrompue", async () => {
    const { control, answer, last } = setup();
    control.start(toFilmStart("landscape"));
    const media = await answer();
    media.video.end();
    expect(media.audio.isStopped).toBe(true);
    expect(last()).toMatchObject({ stream: null, status: "interrupted" });
  });

  it("n'interrompt que la caméra en marche, et se relance d'un toucher", async () => {
    const { control, requests, answer, last } = setup();
    control.interrupt();
    expect(requests).toHaveLength(0);
    control.start(toFilmStart("landscape"));
    const media = await answer();
    control.interrupt();
    expect(media.video.isStopped).toBe(true);
    expect(last()?.status).toBe("interrupted");
    control.restart();
    expect(requests).toHaveLength(2);
    await answer();
    expect(last()?.status).toBe("live");
  });

  it("Quand le téléphone arrête de filmer, le système doit arrêter les pistes et jeter la réponse d'une demande encore en attente", async () => {
    const { control, requests, answer, last } = setup();
    control.start(toFilmStart("landscape"));
    const media = await answer();
    control.stop();
    expect(media.video.isStopped).toBe(true);
    expect(last()).toMatchObject({ stream: null });
    control.start(toFilmStart("portrait"));
    control.stop();
    const late = await answer(1);
    expect(late.video.isStopped).toBe(true);
    expect(last()).toMatchObject({ stream: null });
    expect(requests).toHaveLength(2);
  });

  it("ne fait rien quand il n'y a rien à arrêter, et repart d'un Filmer neuf après un arrêt", async () => {
    const { control, states, requests, answer, last } = setup();
    control.stop();
    expect(states).toHaveLength(0);
    control.start(toFilmStart("landscape"));
    await answer();
    control.stop();
    control.start(toFilmStart("portrait"));
    expect(requests).toHaveLength(2);
    expect(requests[1]?.constraints).toEqual(toCameraConstraints("user", "portrait"));
    const media = await answer();
    expect(last()).toEqual({ stream: media, status: "live", facing: "user" });
  });
});

describe("la rotation du téléphone : le cadrage envoyé à OBS reste celui de Filmer", () => {
  it("Quand le téléphone tourne et que Safari retourne l'image 9:16, le système doit la remettre en 9:16 sur la piste en marche", async () => {
    const { control, requests, states, answer, elapse } = setup();
    control.start(toFilmStart("portrait"));
    const media = await answer(undefined, PORTRAIT_SIZE);
    const before = states.length;
    media.video.settings = LANDSCAPE_SIZE;
    control.reframe();
    await elapse(0);
    expect(media.video.applied).toEqual([toReframeConstraints("portrait", false)]);
    expect(media.video.settings).toEqual(PORTRAIT_SIZE);
    await elapse(5000);
    expect(media.video.applied).toHaveLength(1);
    expect(requests).toHaveLength(1);
    expect(states).toHaveLength(before);
    expect(media.video.isStopped).toBe(false);
    expect(media.audio.isStopped).toBe(false);
  });

  it("Quand le téléphone tourne et que Safari retourne l'image 16:9, le système doit la remettre en 16:9 sur la piste en marche", async () => {
    const { control, requests, states, answer, elapse } = setup();
    control.start(toFilmStart("landscape"));
    const media = await answer(undefined, LANDSCAPE_SIZE);
    const before = states.length;
    media.video.settings = PORTRAIT_SIZE;
    control.reframe();
    await elapse(0);
    expect(media.video.applied).toEqual([toReframeConstraints("landscape", false)]);
    expect(media.video.settings).toEqual(LANDSCAPE_SIZE);
    expect(requests).toHaveLength(1);
    expect(states).toHaveLength(before);
    expect(media.video.isStopped).toBe(false);
  });

  it("garde le cadrage que l'image avait au départ, même quand Safari ne l'a pas donné comme demandé", async () => {
    const { control, answer, elapse } = setup();
    control.start(toFilmStart("portrait"));
    const media = await answer(undefined, LANDSCAPE_SIZE);
    media.video.settings = PORTRAIT_SIZE;
    control.reframe();
    await elapse(0);
    expect(media.video.applied).toEqual([toReframeConstraints("landscape", false)]);
    expect(media.video.settings).toEqual(LANDSCAPE_SIZE);
  });

  it("ne demande rien quand l'image a gardé son cadrage après la rotation", async () => {
    const { control, answer, elapse } = setup();
    control.start(toFilmStart("landscape"));
    const media = await answer(undefined, LANDSCAPE_SIZE);
    control.reframe();
    await elapse(10_000);
    expect(media.video.applied).toEqual([]);
  });

  it("vérifie encore après la rotation, car Safari met la taille de la piste à jour un peu plus tard", async () => {
    const { control, answer, elapse } = setup();
    control.start(toFilmStart("portrait"));
    const media = await answer(undefined, PORTRAIT_SIZE);
    control.reframe();
    await elapse(0);
    expect(media.video.applied).toEqual([]);
    media.video.settings = LANDSCAPE_SIZE;
    await elapse(1500);
    expect(media.video.applied).toEqual([toReframeConstraints("portrait", false)]);
    expect(media.video.settings).toEqual(PORTRAIT_SIZE);
  });

  it("essaie la largeur et la hauteur retournées quand Safari les entend dans l'autre sens", async () => {
    const { control, answer, elapse } = setup();
    control.start(toFilmStart("portrait"));
    const media = await answer(undefined, PORTRAIT_SIZE);
    media.video.hears = "flipped";
    media.video.settings = LANDSCAPE_SIZE;
    control.reframe();
    await elapse(0);
    expect(media.video.applied).toEqual([
      toReframeConstraints("portrait", false),
      toReframeConstraints("portrait", true),
    ]);
    expect(media.video.settings).toEqual(PORTRAIT_SIZE);
  });

  it("n'insiste pas quand Safari ne rend pas le cadrage : au plus 4 demandes par rotation, la caméra reste en marche", async () => {
    const { control, requests, answer, elapse, last } = setup();
    control.start(toFilmStart("portrait"));
    const media = await answer(undefined, PORTRAIT_SIZE);
    media.video.hears = "ignored";
    media.video.settings = LANDSCAPE_SIZE;
    control.reframe();
    await elapse(10_000);
    expect(media.video.applied).toHaveLength(4);
    expect(requests).toHaveLength(1);
    expect(last()).toEqual({ stream: media, status: "live", facing: "user" });
  });

  it("reprend un budget de demandes à chaque rotation", async () => {
    const { control, answer, elapse } = setup();
    control.start(toFilmStart("portrait"));
    const media = await answer(undefined, PORTRAIT_SIZE);
    media.video.hears = "ignored";
    media.video.settings = LANDSCAPE_SIZE;
    control.reframe();
    await elapse(10_000);
    media.video.hears = "as-asked";
    control.reframe();
    await elapse(10_000);
    expect(media.video.settings).toEqual(PORTRAIT_SIZE);
    expect(media.video.applied).toHaveLength(5);
  });

  it("ne lance pas une seconde demande tant que la première n'a pas de réponse", async () => {
    const { control, answer, elapse } = setup();
    control.start(toFilmStart("portrait"));
    const media = await answer(undefined, PORTRAIT_SIZE);
    let release: () => void = () => undefined;
    media.video.gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    media.video.settings = LANDSCAPE_SIZE;
    control.reframe();
    await elapse(1000);
    expect(media.video.applied).toHaveLength(1);
    release();
    await elapse(2000);
    expect(media.video.applied).toHaveLength(1);
    expect(media.video.settings).toEqual(PORTRAIT_SIZE);
  });

  it("ne lance pas non plus une seconde demande quand le téléphone tourne de nouveau pendant la première", async () => {
    const { control, answer, elapse } = setup();
    control.start(toFilmStart("portrait"));
    const media = await answer(undefined, PORTRAIT_SIZE);
    let release: () => void = () => undefined;
    media.video.gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    media.video.settings = LANDSCAPE_SIZE;
    control.reframe();
    await elapse(0);
    control.reframe();
    await elapse(3000);
    expect(media.video.applied).toHaveLength(1);
    release();
    await elapse(0);
    expect(media.video.settings).toEqual(PORTRAIT_SIZE);
  });

  it("remet le cadrage sur la piste de l'autre objectif, arrivée dans une autre orientation", async () => {
    const { control, answer, elapse, last } = setup();
    control.start(toFilmStart("portrait"));
    await answer(undefined, PORTRAIT_SIZE);
    control.switchCamera();
    await answer(undefined, LANDSCAPE_SIZE);
    await elapse(0);
    const video = last()?.stream?.video;
    expect(video?.applied).toEqual([toReframeConstraints("portrait", false)]);
    expect(video?.settings).toEqual(PORTRAIT_SIZE);
  });

  it("remet le cadrage sur la caméra relancée d'un toucher, arrivée dans une autre orientation", async () => {
    const { control, answer, elapse, last } = setup();
    control.start(toFilmStart("landscape"));
    await answer(undefined, LANDSCAPE_SIZE);
    control.interrupt();
    control.restart();
    await answer(undefined, PORTRAIT_SIZE);
    await elapse(0);
    const video = last()?.stream?.video;
    expect(video?.applied).toEqual([toReframeConstraints("landscape", false)]);
    expect(video?.settings).toEqual(LANDSCAPE_SIZE);
  });

  it("prend un nouveau cadrage à chaque Filmer", async () => {
    const { control, answer, elapse } = setup();
    control.start(toFilmStart("portrait"));
    await answer(undefined, PORTRAIT_SIZE);
    control.stop();
    control.start(toFilmStart("landscape"));
    const media = await answer(undefined, LANDSCAPE_SIZE);
    media.video.settings = PORTRAIT_SIZE;
    control.reframe();
    await elapse(0);
    expect(media.video.applied).toEqual([toReframeConstraints("landscape", false)]);
  });

  it("ne programme rien sans caméra en marche, sans Filmer ou quand le navigateur ne donne pas la taille", async () => {
    const { control, answer, timers } = setup();
    control.reframe();
    expect(timers).toHaveLength(0);
    control.start(toFilmStart("portrait"));
    control.reframe();
    expect(timers).toHaveLength(0);
    const media = await answer();
    control.reframe();
    expect(timers).toHaveLength(0);
    control.interrupt();
    control.reframe();
    expect(timers).toHaveLength(0);
    expect(media.video.applied).toEqual([]);
  });

  it("annule les vérifications en attente quand la caméra s'arrête ou s'interrompt", async () => {
    for (const ends of ["stop", "interrupt"] as const) {
      const { control, answer, elapse, timers } = setup();
      control.start(toFilmStart("portrait"));
      const media = await answer(undefined, PORTRAIT_SIZE);
      media.video.settings = LANDSCAPE_SIZE;
      control.reframe();
      expect(timers.length, ends).toBeGreaterThan(0);
      if (ends === "stop") control.stop();
      else control.interrupt();
      expect(timers, ends).toHaveLength(0);
      await elapse(10_000);
      expect(media.video.applied, ends).toEqual([]);
    }
  });

  it("Si Safari refuse la demande, alors le système doit le dire dans le journal et laisser la caméra en marche", async () => {
    const { control, requests, answer, elapse, logs, last } = setup();
    control.start(toFilmStart("portrait"));
    const media = await answer(undefined, PORTRAIT_SIZE);
    media.video.failure = new DOMException("non", "OverconstrainedError");
    media.video.settings = LANDSCAPE_SIZE;
    control.reframe();
    await elapse(0);
    expect(logs).toEqual(["Caméra : le cadrage n'a pas pu être remis"]);
    expect(requests).toHaveLength(1);
    expect(last()).toEqual({ stream: media, status: "live", facing: "user" });
    expect(media.video.isStopped).toBe(false);
  });

  it("rend le cadrage seul : jamais de nouvelle demande de caméra, d'arrêt de piste ni de nouvel état", async () => {
    const { control, requests, states, answer, elapse } = setup();
    control.start(toFilmStart("portrait"));
    const media = await answer(undefined, PORTRAIT_SIZE);
    const before = states.length;
    for (const size of [LANDSCAPE_SIZE, PORTRAIT_SIZE, LANDSCAPE_SIZE]) {
      media.video.settings = size;
      control.reframe();
      await elapse(5000);
    }
    expect(requests).toHaveLength(1);
    expect(states).toHaveLength(before);
    expect(media.video.isStopped).toBe(false);
    expect(media.audio.isStopped).toBe(false);
  });
});

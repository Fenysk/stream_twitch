import { describe, expect, it } from "vitest";
import { toFilmStart, toPhoneLayout } from "../../domain/phone-layout.rules";
import {
  type CameraControl,
  type CameraMedia,
  type CameraState,
  type CameraTrack,
  createCameraControl,
} from "./camera-control";
import { toCameraConstraints, toVideoConstraints } from "./camera-media";

// Une piste : elle se dit arrêtée, et `end` la termine comme le fait Safari qui passe en arrière-plan.
class FakeTrack implements CameraTrack {
  isStopped = false;
  private readonly listeners: Array<() => void> = [];

  stop(): void {
    this.isStopped = true;
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

// La caméra du téléphone à la main : chaque demande à `getUserMedia` attend que le test lui réponde.
const setup = () => {
  const requests: Pending[] = [];
  const states: CameraState<FakeMedia>[] = [];
  const logs: string[] = [];
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
    log: (message) => logs.push(message),
  });
  const answer = async (index = requests.length - 1): Promise<FakeMedia> => {
    const media = new FakeMedia();
    requests[index]?.resolve(media);
    await flush();
    return media;
  };
  const refuse = async (name: string, index = requests.length - 1): Promise<void> => {
    requests[index]?.reject(new DOMException("non", name));
    await flush();
  };
  const last = (): CameraState<FakeMedia> | undefined => states.at(-1);
  return { control, requests, states, logs, answer, refuse, last };
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

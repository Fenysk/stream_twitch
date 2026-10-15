import { describe, expect, it } from "vitest";
import { createSoundScreen, type SoundPlayer } from "./sound-screen";

type FakeTrack = {
  soundId: string;
  version: string;
  fader: number;
  isStopped: boolean;
  end: () => void;
  fail: (reason: string) => void;
};

// Un faux navigateur : il note chaque son lancé, et laisse le test le finir ou le rater.
const setup = () => {
  const tracks: FakeTrack[] = [];
  const reports: { playId: string; outcome: string; reason: string | undefined }[] = [];
  const player: SoundPlayer = {
    start({ soundId, version, fader }, listener) {
      const track: FakeTrack = {
        soundId,
        version,
        fader,
        isStopped: false,
        end: () => {
          if (!track.isStopped) listener.onEnd();
        },
        fail: (reason) => {
          if (!track.isStopped) listener.onFail(reason);
        },
      };
      tracks.push(track);
      return {
        stop() {
          track.isStopped = true;
        },
      };
    },
  };
  const screen = createSoundScreen({
    player,
    report: (playId, outcome, reason) => reports.push({ playId, outcome, reason }),
  });
  return { screen, tracks, reports };
};

const play = (playId: string, soundId = "rire0001", fader = 80) =>
  ({ kind: "play", playId, soundId, version: "1.10", fader }) as const;

describe("createSoundScreen : la page /sounds", () => {
  it("joue le son reçu, à son fader et à sa version", () => {
    const { screen, tracks } = setup();
    screen.handle(play("p1", "bravo002", 35));
    expect(tracks).toHaveLength(1);
    expect(tracks[0]).toMatchObject({ soundId: "bravo002", version: "1.10", fader: 35, isStopped: false });
  });

  it("répond « fini » au serveur quand le son se termine, une seule fois", () => {
    const { screen, tracks, reports } = setup();
    screen.handle(play("p1"));
    tracks[0]?.end();
    tracks[0]?.end();
    expect(reports).toEqual([{ playId: "p1", outcome: "ended", reason: undefined }]);
  });

  it("répond « raté » avec la raison quand le navigateur ne peut pas jouer le son", () => {
    const { screen, tracks, reports } = setup();
    screen.handle(play("p1"));
    tracks[0]?.fail("fichier illisible");
    tracks[0]?.end();
    expect(reports).toEqual([{ playId: "p1", outcome: "failed", reason: "fichier illisible" }]);
  });

  it("se tait sur l'ordre du serveur, sans rien répondre", () => {
    const { screen, tracks, reports } = setup();
    screen.handle(play("p1"));
    screen.handle({ kind: "stop" });
    tracks[0]?.end();
    expect(tracks[0]?.isStopped).toBe(true);
    expect(reports).toEqual([]);
  });

  it("coupe un son encore en cours plutôt que de le superposer à un autre", () => {
    const { screen, tracks } = setup();
    screen.handle(play("p1"));
    screen.handle(play("p2", "bravo002"));
    expect(tracks.map(({ isStopped }) => isStopped)).toEqual([true, false]);
  });

  it("répond une fois le son fini même si le port l'a fini avant de rendre la main", () => {
    const reports: string[] = [];
    const screen = createSoundScreen({
      player: {
        start(_sound, listener) {
          listener.onEnd();
          return { stop: () => undefined };
        },
      },
      report: (playId, outcome) => reports.push(`${playId}:${outcome}`),
    });
    screen.handle(play("p1"));
    screen.handle({ kind: "stop" });
    expect(reports).toEqual(["p1:ended"]);
  });

  it("coupe le son en cours quand la page se ferme", () => {
    const { screen, tracks, reports } = setup();
    screen.handle(play("p1"));
    screen.close();
    expect(tracks[0]?.isStopped).toBe(true);
    expect(reports).toEqual([]);
  });
});

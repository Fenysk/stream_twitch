import { describe, expect, it } from "vitest";
import {
  type AnimationLoop,
  connectLaughPreview,
  createLaughPreview,
  type PreviewAudio,
  type PreviewSound,
  type PreviewSource,
} from "./laugh-preview";

const SOUNDS: PreviewSound[] = [
  { id: "a", version: "1", fader: 80 },
  { id: "b", version: "2", fader: 60 },
];

// On garde de 10 s à 50 s du clip brut ; le sound « a » dure 5 s, « b » 1 s.
const source = (overrides: Partial<PreviewSource> = {}): PreviewSource => ({
  laughs: [
    { at: 12, sound: "a" },
    { at: 20, sound: "b" },
    { at: 50, sound: "b" },
  ],
  sounds: SOUNDS,
  seconds: new Map([
    ["a", 5],
    ["b", 1],
  ]),
  kept: { start: 10, end: 50 },
  laughFader: 100,
  origin: 0,
  ...overrides,
});

// Un faux lecteur audio : chaque lecture, chaque coupure et chaque changement de force se notent.
const setupAudio = () => {
  const plays: { id: string; fader: number; offset: number }[] = [];
  const stops: number[] = [];
  const updates: { index: number; fader: number }[] = [];
  const audio: PreviewAudio = {
    play: (sound, fader, offset) => {
      const index = plays.length;
      plays.push({ id: sound.id, fader, offset });
      return {
        stop: () => stops.push(index),
        update: (next) => updates.push({ index, fader: next }),
      };
    },
  };
  return { audio, plays, stops, updates };
};

// La lecture démarre à `from` et avance par pas de 0,1 s jusqu'à `to`.
const sweep = (preview: ReturnType<typeof createLaughPreview>, from: number, to: number) => {
  preview.start(from);
  for (let step = 1; from + step * 0.1 < to; step += 1) preview.tick(from + step * 0.1);
  preview.tick(to);
};

const setup = (initial: PreviewSource | null = source()) => {
  const current = { source: initial };
  const fake = setupAudio();
  const preview = createLaughPreview(fake.audio, () => current.source);
  return { ...fake, preview, current };
};

describe("createLaughPreview : la lecture avance", () => {
  it("fait partir un rire quand la lecture passe son instant, au fader de son sound, une seule fois", () => {
    const { preview, plays } = setup();
    preview.start(11.9);
    preview.tick(11.95);
    expect(plays).toEqual([]);
    preview.tick(12.01);
    expect(plays).toEqual([{ id: "a", fader: 80, offset: 0 }]);
    preview.tick(12.3);
    preview.tick(12.6);
    expect(plays).toHaveLength(1);
  });

  it("joue chaque rire au fader de son sound fois le volume des rires du clip", () => {
    const { preview, plays } = setup(source({ laughFader: 50 }));
    sweep(preview, 11.9, 20.1);
    expect(plays.map(({ fader }) => fader)).toEqual([40, 30]);
  });

  it("ne joue jamais un rire hors de la partie gardée", () => {
    const { preview, plays } = setup(
      source({
        laughs: [
          { at: 5, sound: "a" },
          { at: 30, sound: "b" },
          { at: 60, sound: "a" },
        ],
      }),
    );
    preview.start(0);
    for (let position = 0.1; position < 70; position += 0.1) preview.tick(position);
    expect(plays.map(({ id }) => id)).toEqual(["b"]);
  });

  it("laisse plusieurs rires jouer en même temps : aucun n'en coupe un autre", () => {
    const { preview, plays, stops } = setup(
      source({
        laughs: [
          { at: 12, sound: "a" },
          { at: 13, sound: "b" },
        ],
      }),
    );
    sweep(preview, 11.9, 13.2);
    expect(plays.map(({ id }) => id)).toEqual(["a", "b"]);
    expect(stops).toEqual([]);
  });

  it("ne fait rien tant que la lecture n'a pas démarré", () => {
    const { preview, plays } = setup();
    preview.tick(12.5);
    expect(plays).toEqual([]);
    expect(preview.state()).toBe("idle");
  });

  it("lit les rires de l'éditeur à chaque pas : un rire posé pendant la lecture part", () => {
    const { preview, plays, current } = setup();
    preview.start(30);
    preview.tick(30.02);
    current.source = source({ laughs: [{ at: 30.1, sound: "b" }] });
    preview.tick(30.2);
    expect(plays).toEqual([{ id: "b", fader: 60, offset: 0 }]);
  });

  it("saute sans erreur un rire dont le sound n'est plus dans la soundboard", () => {
    const { preview, plays } = setup(source({ laughs: [{ at: 12, sound: "disparu" }] }));
    sweep(preview, 11.9, 12.5);
    expect(plays).toEqual([]);
  });

  it("ne fait rien sans partie gardée connue, sans erreur", () => {
    const { preview, plays } = setup(null);
    preview.start(11);
    preview.tick(12.5);
    preview.finish();
    expect(plays).toEqual([]);
  });
});

describe("createLaughPreview : la lecture démarre ou reprend", () => {
  it("joue depuis le milieu d'un rire en route : décalage = position − instant, quand la durée du sound est connue", () => {
    const { preview, plays } = setup();
    preview.start(14.5);
    expect(plays).toEqual([{ id: "a", fader: 80, offset: 2.5 }]);
  });

  it("ne reprend pas un rire dont la durée est inconnue, ni un rire fini", () => {
    const unknown = setup(source({ seconds: new Map() }));
    unknown.preview.start(14.5);
    expect(unknown.plays).toEqual([]);
    const finished = setup();
    finished.preview.start(18);
    expect(finished.plays).toEqual([]);
  });

  it("fait partir un rire posé pile à la position par le premier pas, pas par la reprise", () => {
    const { preview, plays } = setup();
    preview.start(12);
    expect(plays).toEqual([]);
    preview.tick(12.02);
    expect(plays).toHaveLength(1);
  });

  it("coupe ceux qui jouaient et reprend selon la nouvelle position quand la lecture se déplace", () => {
    const { preview, plays, stops } = setup();
    preview.start(11.9);
    preview.tick(12.01);
    preview.start(14.5);
    expect(stops).toEqual([0]);
    expect(plays).toEqual([
      { id: "a", fader: 80, offset: 0 },
      { id: "a", fader: 80, offset: 2.5 },
    ]);
  });

  it("reprend selon la nouvelle position après un saut de la lecture : en avant de plus d'une demi-seconde, ou en arrière", () => {
    const forward = setup();
    forward.preview.start(11.9);
    forward.preview.tick(12.01);
    forward.preview.tick(14.5);
    expect(forward.stops).toEqual([0]);
    expect(forward.plays.at(-1)).toEqual({ id: "a", fader: 80, offset: 2.5 });

    const backward = setup();
    backward.preview.start(11.9);
    backward.preview.tick(12.01);
    backward.preview.tick(11);
    expect(backward.stops).toEqual([0]);
    expect(backward.plays).toHaveLength(1);
  });
});

describe("createLaughPreview : la pause et la fin", () => {
  it("ne reprend rien quand la position recule d'un souffle : le lecteur arrondit sa position, le rire ne repart pas", () => {
    const { preview, plays, stops } = setup();
    preview.start(11.9);
    preview.tick(12.01);
    preview.tick(12.0095);
    preview.tick(12.02);
    expect(plays).toHaveLength(1);
    expect(stops).toEqual([]);
  });

  it("coupe tous les rires qui jouent, et plus aucun ne part ensuite", () => {
    const { preview, plays, stops } = setup(
      source({
        laughs: [
          { at: 12, sound: "a" },
          { at: 13, sound: "b" },
          { at: 30, sound: "b" },
        ],
      }),
    );
    sweep(preview, 11.9, 13.2);
    preview.stop();
    expect(stops).toEqual([0, 1]);
    preview.tick(30.5);
    expect(plays).toHaveLength(2);
    expect(preview.state()).toBe("idle");
  });

  it("fait partir à la fin les rires pas encore partis jusqu'à la fin gardée, un rire posé à `end` compris, sans couper ceux qui jouent", () => {
    const { preview, plays, stops } = setup();
    preview.start(13);
    preview.tick(13.1);
    preview.finish();
    expect(plays).toEqual([
      { id: "a", fader: 80, offset: 1 },
      { id: "b", fader: 60, offset: 0 },
      { id: "b", fader: 60, offset: 0 },
    ]);
    expect(stops).toEqual([]);
    expect(preview.state()).toBe("finishing");
  });

  it("ne fait partir aucun rire deux fois à la fin : ni ceux d'avant, ni à un second appel", () => {
    const { preview, plays } = setup();
    preview.start(40);
    preview.finish();
    preview.finish();
    preview.tick(50.5);
    expect(plays).toEqual([{ id: "b", fader: 60, offset: 0 }]);
  });

  it("ne joue pas à la fin un rire hors de la partie gardée", () => {
    const { preview, plays } = setup(source({ laughs: [{ at: 60, sound: "a" }] }));
    preview.start(40);
    preview.finish();
    expect(plays).toEqual([]);
  });

  it("coupe encore ce qui joue à la fin quand la lecture est déplacée ensuite", () => {
    const { preview, stops } = setup();
    preview.start(40);
    preview.finish();
    preview.stop();
    expect(stops).toEqual([0]);
  });
});

describe("createLaughPreview : la lecture est déplacée", () => {
  it("coupe tous les rires qui jouent quand elle est déplacée ailleurs", () => {
    const { preview, stops } = setup();
    preview.start(13);
    preview.seek(30);
    expect(stops).toEqual([0]);
    expect(preview.state()).toBe("idle");
  });

  it("ne coupe rien quand le pas d'animation a déjà repris à cette position : le déplacement n'est pas fait deux fois", () => {
    const { preview, plays, stops } = setup();
    preview.start(13);
    preview.tick(14.5);
    expect(stops).toEqual([0]);
    preview.seek(14.5);
    preview.seek(14.52);
    expect(stops).toEqual([0]);
    expect(plays).toHaveLength(2);
    expect(preview.state()).toBe("running");
  });

  it("ne fait rien quand rien ne joue", () => {
    const { preview, plays, stops } = setup();
    preview.seek(14.5);
    expect(plays).toEqual([]);
    expect(stops).toEqual([]);
  });
});

describe("createLaughPreview : le volume des rires change pendant qu'ils jouent", () => {
  const twoLaughs = (laughFader: number) =>
    source({
      laughFader,
      laughs: [
        { at: 12, sound: "a" },
        { at: 12.5, sound: "b" },
      ],
    });

  it("applique aussitôt la force courante aux rires qui jouent : fader du sound fois volume des rires", () => {
    const { preview, current, updates } = setup(twoLaughs(100));
    preview.start(13);
    current.source = twoLaughs(50);
    preview.refresh();
    expect(updates).toEqual([
      { index: 0, fader: 40 },
      { index: 1, fader: 30 },
    ]);
  });

  it("l'applique aussi aux rires qui jouent encore après la fin de la sélection", () => {
    const { preview, current, updates } = setup();
    preview.start(13);
    preview.finish();
    current.source = source({ laughFader: 0 });
    preview.refresh();
    expect(updates.map(({ fader }) => fader)).toEqual([0, 0, 0]);
  });

  it("ne fait rien quand rien ne joue", () => {
    const { preview, updates } = setup();
    preview.refresh();
    preview.start(11);
    preview.refresh();
    preview.stop();
    preview.refresh();
    expect(updates).toEqual([]);
  });

  it("applique le nouveau volume aux rires qui partent ensuite", () => {
    const { preview, current, plays } = setup();
    preview.start(11.9);
    current.source = source({ laughFader: 25 });
    preview.refresh();
    preview.tick(12.01);
    expect(plays).toEqual([{ id: "a", fader: 20, offset: 0 }]);
  });
});

// Un faux <video> : on règle sa position et son état à la main, puis on déclenche ses évènements.
class FakeVideo extends EventTarget {
  currentTime = 0;
  paused = true;
  ended = false;

  fire(type: string): void {
    this.dispatchEvent(new Event(type));
  }
}

// Une fausse boucle d'animation : un pas ne vient que sur demande.
const createLoop = () => {
  const pending = new Map<number, () => void>();
  let next = 1;
  const animation: AnimationLoop = {
    request: (callback) => {
      pending.set(next, callback);
      next += 1;
      return next - 1;
    },
    cancel: (id) => {
      pending.delete(id);
    },
  };
  const step = () => {
    const callbacks = [...pending.values()];
    pending.clear();
    for (const callback of callbacks) callback();
  };
  return { animation, step, count: () => pending.size };
};

const connect = (initial: PreviewSource | null = source()) => {
  const video = new FakeVideo();
  const loop = createLoop();
  const fake = setup(initial);
  const disconnect = connectLaughPreview(video, fake.preview, () => fake.current.source, loop.animation);
  return { video, loop, disconnect, ...fake };
};

describe("connectLaughPreview : le lecteur vidéo", () => {
  it("suit la position à chaque image d'animation pendant la lecture, et fait partir un rire à l'heure", () => {
    const { video, loop, plays } = connect();
    video.currentTime = 11.9;
    video.paused = false;
    video.fire("play");
    loop.step();
    expect(plays).toEqual([]);
    video.currentTime = 12.02;
    loop.step();
    expect(plays).toEqual([{ id: "a", fader: 80, offset: 0 }]);
    loop.step();
    expect(plays).toHaveLength(1);
  });

  it("ne suit rien tant que le lecteur ne joue pas : aucun pas demandé à l'arrêt ni après une pause", () => {
    const { video, loop } = connect();
    expect(loop.count()).toBe(0);
    video.paused = false;
    video.fire("play");
    expect(loop.count()).toBe(1);
    video.paused = true;
    video.fire("pause");
    expect(loop.count()).toBe(0);
  });

  it("coupe tous les rires à la pause d'Alexis", () => {
    const { video, loop, stops } = connect();
    video.currentTime = 11.9;
    video.paused = false;
    video.fire("play");
    video.currentTime = 12.02;
    loop.step();
    video.currentTime = 12.5;
    video.paused = true;
    video.fire("pause");
    expect(stops).toEqual([0]);
  });

  it("coupe les rires quand la lecture est déplacée, et les reprend selon la nouvelle position si elle continue", () => {
    const { video, loop, plays, stops } = connect();
    video.currentTime = 11.9;
    video.paused = false;
    video.fire("play");
    video.currentTime = 12.02;
    loop.step();
    video.currentTime = 13;
    video.fire("seeking");
    expect(stops).toEqual([0]);
    video.fire("seeked");
    expect(plays.at(-1)).toEqual({ id: "a", fader: 80, offset: 1 });
    expect(plays).toHaveLength(2);
  });

  it("ne fait pas repartir deux fois un rire quand un pas d'animation voit le saut avant l'évènement de déplacement", () => {
    const { video, loop, plays, stops } = connect();
    video.currentTime = 13;
    video.paused = false;
    video.fire("play");
    video.currentTime = 14.5;
    loop.step();
    video.fire("seeking");
    video.fire("seeked");
    expect(plays).toEqual([
      { id: "a", fader: 80, offset: 1 },
      { id: "a", fader: 80, offset: 2.5 },
    ]);
    expect(stops).toEqual([0]);
  });

  it("ne démarre rien après un déplacement quand le lecteur est en pause", () => {
    const { video, plays, stops } = connect();
    video.currentTime = 13;
    video.fire("seeking");
    video.fire("seeked");
    expect(plays).toEqual([]);
    expect(stops).toEqual([]);
  });

  it("ne reprend qu'une fois quand « Lire la sélection » se place puis joue : déplacement, lecture, déplacement fini", () => {
    const { video, plays } = connect();
    video.currentTime = 12.5;
    video.fire("seeking");
    video.paused = false;
    video.fire("play");
    video.fire("seeked");
    expect(plays).toEqual([{ id: "a", fader: 80, offset: 0.5 }]);
  });

  it("fait partir à la fin de la sélection les rires pas encore partis, un rire à `end` compris, et laisse jouer ceux en route", () => {
    const { video, loop, plays, stops } = connect();
    video.currentTime = 13;
    video.paused = false;
    video.fire("play");
    // La lecture de la sélection s'arrête seule à la fin gardée, puis le lecteur se replace sur la dernière image gardée.
    video.paused = true;
    video.currentTime = 49.99;
    video.fire("pause");
    video.fire("seeking");
    video.fire("seeked");
    expect(plays.map(({ id }) => id)).toEqual(["a", "b", "b"]);
    expect(stops).toEqual([]);
    expect(loop.count()).toBe(0);
  });

  it("coupe ce qui joue encore après la fin de la sélection quand Alexis déplace la lecture ailleurs", () => {
    const { video, stops } = connect();
    video.currentTime = 13;
    video.paused = false;
    video.fire("play");
    video.paused = true;
    video.currentTime = 49.99;
    video.fire("pause");
    video.fire("seeking");
    video.currentTime = 20;
    video.fire("seeking");
    expect(stops).toEqual([0, 1, 2]);
  });

  it("fait partir à la fin de la vidéo les rires pas encore partis, et laisse jouer ceux en route", () => {
    const { video, plays, stops } = connect();
    video.currentTime = 13;
    video.paused = false;
    video.fire("play");
    video.currentTime = 60;
    video.paused = true;
    video.ended = true;
    video.fire("pause");
    video.fire("ended");
    expect(plays.map(({ id }) => id)).toEqual(["a", "b", "b"]);
    expect(stops).toEqual([]);
  });

  it("coupe à la pause quand elle n'est ni à la fin gardée ni à la fin de la vidéo", () => {
    const { video, plays, stops } = connect();
    video.currentTime = 13;
    video.paused = false;
    video.fire("play");
    video.currentTime = 30;
    video.paused = true;
    video.fire("pause");
    expect(plays).toHaveLength(1);
    expect(stops).toEqual([0]);
  });

  it("compte la position depuis le début de la vidéo lue quand elle commence plus tard que le clip brut", () => {
    const { video, loop, plays } = connect(
      source({ laughs: [{ at: 25, sound: "a" }], kept: { start: 20, end: 50 }, origin: 20 }),
    );
    video.currentTime = 4.9;
    video.paused = false;
    video.fire("play");
    loop.step();
    expect(plays).toEqual([]);
    video.currentTime = 5.05;
    loop.step();
    expect(plays).toEqual([{ id: "a", fader: 80, offset: 0 }]);
  });

  it("ne fait plus rien une fois déconnecté : ni évènement ni pas d'animation", () => {
    const { video, loop, plays, disconnect } = connect();
    video.paused = false;
    video.currentTime = 11.9;
    video.fire("play");
    expect(loop.count()).toBe(1);
    disconnect();
    expect(loop.count()).toBe(0);
    video.currentTime = 12.02;
    video.fire("play");
    loop.step();
    expect(plays).toEqual([]);
  });
});

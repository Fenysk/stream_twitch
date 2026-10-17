import { describe, expect, it } from "vitest";
import type { ChatMessage } from "../../domain/chat.schema";
import type { ShowCues, ShowLaugh } from "../../domain/show.schema";
import { createShowTicker } from "./show-ticker";

const message = (id: string): ChatMessage => ({
  id,
  nickname: "Viewer",
  color: null,
  fragments: [{ kind: "text", text: id }],
  isHidden: false,
  receivedAt: 0,
});

const CUES: ShowCues = {
  chat: [
    { at: 0, message: message("début") },
    { at: 2000, message: message("milieu") },
    { at: 2000, message: message("même instant") },
    { at: 9000, message: message("fin") },
  ],
  spikes: [3000, 8000],
  startleMs: 1000,
};

const laugh = (id: string, at: number): ShowLaugh => ({ id, version: "1", fader: 80, at });

const LAUGHS = [laugh("début", 0), laugh("milieu", 4000), laugh("même instant", 4000), laugh("fin", 10_000)];

const setup = (cues: ShowCues | null = CUES, laughs: readonly ShowLaugh[] = []) => {
  const shown: string[][] = [];
  const startles: number[] = [];
  const laughing: string[] = [];
  const ticker = createShowTicker(
    { cues, laughs },
    {
      addChat: (messages) => shown.push(messages.map(({ id }) => id)),
      startle: (ms) => startles.push(ms),
      startLaugh: ({ id }) => laughing.push(id),
    },
  );
  return { tick: ticker.tick, end: ticker.end, shown, startles, laughing };
};

describe("createShowTicker", () => {
  it("fait paraître chaque message à son instant, dans l'ordre, sans en perdre ni en doubler entre deux pas", () => {
    const { tick, shown } = setup();
    for (const ms of [100, 1500, 2500, 2600, 5000, 9500]) tick(ms);
    expect(shown.flat()).toEqual(["début", "milieu", "même instant", "fin"]);
  });

  it("donne les messages du même instant ensemble, au pas qui les franchit", () => {
    const { tick, shown } = setup();
    tick(1000);
    tick(2100);
    expect(shown).toEqual([["début"], ["milieu", "même instant"]]);
  });

  it("fait sursauter Jean-Renard au pas qui franchit un spike, pour la durée donnée, une fois par spike", () => {
    const { tick, startles } = setup();
    for (const ms of [1000, 2900, 3100, 3200, 7000, 8100, 9500]) tick(ms);
    expect(startles).toEqual([1000, 1000]);
  });

  it("ne fait rien d'un clip sans tchat ni spikes", () => {
    const { tick, shown, startles } = setup({ chat: [], spikes: [], startleMs: 1000 });
    tick(5000);
    expect(shown).toEqual([[]]);
    expect(startles).toEqual([]);
  });

  it("rattrape tout d'un coup si la vidéo saute en avant", () => {
    const { tick, shown, startles } = setup();
    tick(10_000);
    expect(shown.flat()).toEqual(["début", "milieu", "même instant", "fin"]);
    expect(startles).toEqual([1000]);
  });
});

describe("createShowTicker : les rires", () => {
  it("fait partir chaque rire au pas qui franchit son instant, dans l'ordre, une seule fois", () => {
    const { tick, laughing } = setup(CUES, LAUGHS);
    for (const ms of [100, 1500, 3900, 4100, 4200, 9000, 10_100, 10_200]) tick(ms);
    expect(laughing).toEqual(["début", "milieu", "même instant", "fin"]);
  });

  it("ne fait partir aucun rire avant son instant", () => {
    const { tick, laughing } = setup(CUES, LAUGHS);
    tick(3999);
    expect(laughing).toEqual(["début"]);
    tick(4000);
    expect(laughing).toEqual(["début"]);
    tick(4001);
    expect(laughing).toEqual(["début", "milieu", "même instant"]);
  });

  it("rattrape tous les rires passés si la vidéo saute en avant", () => {
    const { tick, laughing } = setup(CUES, LAUGHS);
    tick(20_000);
    expect(laughing).toEqual(["début", "milieu", "même instant", "fin"]);
  });

  it("à la fin de la vidéo, fait partir tous les rires pas encore partis : un rire posé à la fin, ou après la dernière position lue", () => {
    const { tick, end, laughing } = setup(CUES, LAUGHS);
    tick(4100);
    expect(laughing).toEqual(["début", "milieu", "même instant"]);
    end();
    expect(laughing).toEqual(["début", "milieu", "même instant", "fin"]);
  });

  it("ne fait partir aucun rire deux fois : ni ceux d'avant la fin, ni à un second appel", () => {
    const { tick, end, laughing } = setup(CUES, LAUGHS);
    tick(5000);
    end();
    end();
    expect(laughing).toEqual(["début", "milieu", "même instant", "fin"]);
  });

  it("fait partir tous les rires d'une vidéo dont aucune position n'a été lue", () => {
    const { end, laughing } = setup(CUES, LAUGHS);
    end();
    expect(laughing).toEqual(["début", "milieu", "même instant", "fin"]);
  });

  it("marche sans les données du serveur : ni tchat ni sursaut, mais les rires jouent", () => {
    const { tick, end, shown, startles, laughing } = setup(null, LAUGHS);
    tick(4100);
    end();
    expect(shown).toEqual([]);
    expect(startles).toEqual([]);
    expect(laughing).toEqual(["début", "milieu", "même instant", "fin"]);
  });

  it("ne fait rien d'un clip sans rires", () => {
    const { tick, end, laughing } = setup(CUES, []);
    tick(5000);
    end();
    expect(laughing).toEqual([]);
  });
});

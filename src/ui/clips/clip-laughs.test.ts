import { describe, expect, it } from "vitest";
import type { SoundSummary } from "../../domain/sound.schema";
import {
  createLaughsState,
  type EditorLaugh,
  type LaughsAction,
  type LaughsState,
  type LaughView,
  reduceLaughs,
  toLaughBlocks,
  toLaughDetails,
  toLaughRequests,
  toUsedSounds,
} from "./clip-laughs";

const sound = (id: string, title: string): SoundSummary => ({
  id,
  title,
  fader: 80,
  version: "1-1",
  rewardTitles: [],
  clipCount: 0,
});

const SOUNDS = [
  sound("aaaa0001", "Applaudissements"),
  sound("bbbb0002", "Rire gras"),
  sound("cccc0003", "Cri"),
];

const reduce = (state: LaughsState, ...actions: LaughsAction[]): LaughsState =>
  actions.reduce(reduceLaughs, state);

describe("createLaughsState", () => {
  it("donne une clé à chaque rire du clip, dans l'ordre, sans en choisir aucun", () => {
    expect(
      createLaughsState([
        { at: 4, sound: "aaaa0001" },
        { at: 9, sound: "bbbb0002" },
      ]),
    ).toEqual({
      laughs: [
        { key: 0, at: 4, sound: "aaaa0001" },
        { key: 1, at: 9, sound: "bbbb0002" },
      ],
      selectedKey: null,
      nextKey: 2,
    });
  });

  it("part de zéro rire quand le clip n'en a pas", () => {
    expect(createLaughsState()).toEqual({ laughs: [], selectedKey: null, nextKey: 0 });
  });
});

describe("reduceLaughs", () => {
  const start = createLaughsState([{ at: 4, sound: "aaaa0001" }]);

  it("pose un rire avec une clé neuve et le choisit", () => {
    const next = reduce(start, { kind: "create", at: 7.5, sound: "bbbb0002" });
    expect(next.laughs).toEqual([
      { key: 0, at: 4, sound: "aaaa0001" },
      { key: 1, at: 7.5, sound: "bbbb0002" },
    ]);
    expect(next.selectedKey).toBe(1);
  });

  it("donne deux clés différentes à deux rires posés au même instant", () => {
    const next = reduce(
      createLaughsState(),
      { kind: "create", at: 3, sound: "aaaa0001" },
      { kind: "create", at: 3, sound: "aaaa0001" },
    );
    expect(next.laughs.map(({ key }) => key)).toEqual([0, 1]);
    expect(next.selectedKey).toBe(1);
  });

  it("ne rend pas la clé d'un rire retiré à un rire posé ensuite", () => {
    const next = reduce(start, { kind: "delete", key: 0 }, { kind: "create", at: 2, sound: "aaaa0001" });
    expect(next.laughs.map(({ key }) => key)).toEqual([1]);
  });

  it("déplace un seul rire, sans toucher ni à son sound ni aux autres", () => {
    const two = reduce(start, { kind: "create", at: 7.5, sound: "bbbb0002" });
    const next = reduce(two, { kind: "move", key: 0, at: 5 });
    expect(next.laughs).toEqual([
      { key: 0, at: 5, sound: "aaaa0001" },
      { key: 1, at: 7.5, sound: "bbbb0002" },
    ]);
    expect(next.selectedKey).toBe(two.selectedKey);
  });

  it("change le sound d'un seul rire, sans toucher à son instant", () => {
    const next = reduce(start, { kind: "update", key: 0, sound: "cccc0003" });
    expect(next.laughs).toEqual([{ key: 0, at: 4, sound: "cccc0003" }]);
  });

  it("choisit un rire", () => {
    expect(reduce(start, { kind: "choose", key: 0 }).selectedKey).toBe(0);
  });

  it("retire le rire choisi : plus aucun n'est choisi", () => {
    const next = reduce(start, { kind: "choose", key: 0 }, { kind: "delete", key: 0 });
    expect(next.laughs).toEqual([]);
    expect(next.selectedKey).toBeNull();
  });

  it("garde le rire choisi quand on en retire un autre", () => {
    const two = reduce(start, { kind: "create", at: 7.5, sound: "bbbb0002" });
    const next = reduce(two, { kind: "delete", key: 0 });
    expect(next.laughs.map(({ key }) => key)).toEqual([1]);
    expect(next.selectedKey).toBe(1);
  });

  it("ne change rien pour une clé qui n'existe pas", () => {
    expect(reduce(start, { kind: "move", key: 9, at: 1 })).toEqual(start);
    expect(reduce(start, { kind: "update", key: 9, sound: "cccc0003" })).toEqual(start);
    expect(reduce(start, { kind: "delete", key: 9 })).toEqual(start);
  });
});

describe("toLaughBlocks et toLaughDetails", () => {
  // On garde de 10 s à 50 s du clip brut. La vidéo lue est le clip brut entier (origine 0), sauf mention contraire.
  const view = (overrides: Partial<LaughView> = {}): LaughView => ({
    sounds: SOUNDS,
    seconds: new Map([
      ["aaaa0001", 2],
      ["bbbb0002", 1.5],
    ]),
    kept: { start: 10, end: 50 },
    origin: 0,
    ...overrides,
  });
  const laughs: EditorLaugh[] = [
    { key: 0, at: 20, sound: "aaaa0001" },
    { key: 1, at: 5, sound: "bbbb0002" },
    { key: 2, at: 49, sound: "cccc0003" },
  ];

  it("fait un bloc par rire : son instant, le titre de son sound, sa durée quand elle est lue", () => {
    expect(
      toLaughBlocks(laughs, null, view()).map(({ key, at, title, seconds }) => ({ key, at, title, seconds })),
    ).toEqual([
      { key: 0, at: 20, title: "Applaudissements", seconds: 2 },
      { key: 1, at: 5, title: "Rire gras", seconds: 1.5 },
      { key: 2, at: 49, title: "Cri", seconds: undefined },
    ]);
  });

  it("dit quels blocs sont dans la partie gardée, bords compris, et lequel est choisi", () => {
    const blocks = toLaughBlocks(laughs, 2, view());
    expect(blocks.map(({ isKept }) => isKept)).toEqual([true, false, true]);
    expect(blocks.map(({ isSelected }) => isSelected)).toEqual([false, false, true]);
    expect(toLaughBlocks([{ key: 0, at: 50, sound: "aaaa0001" }], null, view())[0]?.isKept).toBe(true);
  });

  it("place les blocs dans la vidéo lue quand elle commence plus tard que le clip brut", () => {
    const [block] = toLaughBlocks([{ key: 0, at: 30, sound: "aaaa0001" }], null, view({ origin: 10 }));
    expect(block?.at).toBe(20);
  });

  it("ne rend rien des rires d'un sound qui n'est plus dans la soundboard", () => {
    expect(toLaughBlocks([{ key: 0, at: 20, sound: "disparu1" }], null, view())).toEqual([]);
  });

  it("détaille le rire choisi : son rang parmi tous les rires, son instant, son sound", () => {
    expect(toLaughDetails(laughs, 0, view())).toMatchObject({
      key: 0,
      rank: 2,
      count: 3,
      at: 20,
      sound: "aaaa0001",
    });
    expect(toLaughDetails(laughs, 1, view())).toMatchObject({ rank: 1, count: 3 });
  });

  it("n'a aucun détail quand aucun rire n'est choisi, ou que sa clé n'existe plus", () => {
    expect(toLaughDetails(laughs, null, view())).toBeNull();
    expect(toLaughDetails(laughs, 9, view())).toBeNull();
  });

  it("dit qu'un rire dépasse la fin quand son sound finit après la fin gardée, jamais tant que sa durée est inconnue", () => {
    const sound = { key: 0, at: 49.5, sound: "aaaa0001" };
    expect(toLaughDetails([sound], 0, view())?.isOverEnd).toBe(true);
    expect(toLaughDetails([{ ...sound, at: 40 }], 0, view())?.isOverEnd).toBe(false);
    expect(toLaughDetails([{ ...sound, sound: "cccc0003" }], 0, view())?.isOverEnd).toBe(false);
  });

  it("dit qu'un rire est hors de la partie gardée (après une recoupe)", () => {
    expect(toLaughDetails(laughs, 1, view())?.isKept).toBe(false);
    expect(toLaughDetails(laughs, 0, view())?.isKept).toBe(true);
  });

  it("compte l'instant du détail dans la vidéo lue, et la fin dans le clip brut", () => {
    const details = toLaughDetails([{ key: 0, at: 49.5, sound: "aaaa0001" }], 0, view({ origin: 10 }));
    expect(details?.at).toBe(39.5);
    expect(details?.isOverEnd).toBe(true);
  });
});

describe("toUsedSounds", () => {
  it("ne rend que les sounds qu'un rire utilise, une fois chacun", () => {
    const used = toUsedSounds([{ sound: "bbbb0002" }, { sound: "bbbb0002" }, { sound: "disparu1" }], SOUNDS);
    expect(used.map(({ id }) => id)).toEqual(["bbbb0002"]);
  });

  it("ne rend rien tant que la soundboard n'est pas lue", () => {
    expect(toUsedSounds([{ sound: "bbbb0002" }], null)).toEqual([]);
  });
});

describe("toLaughRequests", () => {
  it("rend l'instant et le sound de chaque rire, sans la clé", () => {
    expect(
      toLaughRequests([
        { key: 4, at: 20, sound: "aaaa0001" },
        { key: 7, at: 5, sound: "bbbb0002" },
      ]),
    ).toEqual([
      { at: 20, sound: "aaaa0001" },
      { at: 5, sound: "bbbb0002" },
    ]);
  });
});

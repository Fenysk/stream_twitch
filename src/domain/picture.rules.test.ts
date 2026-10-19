import { describe, expect, it } from "vitest";
import type { ControlMic } from "./control.schema";
import {
  canCutCamera,
  type ObsPictureMember,
  type PictureItem,
  toCutNotice,
  toCutRequest,
  toFallbackPictureId,
  toLiveCameraMicId,
  toLostMicId,
  toLostPictureId,
  toNextPictureId,
  toObsPicture,
  toPhonePictureId,
  toPictureCameraNumber,
  toPictureLabel,
  toPictureMemberId,
  toPictureMicId,
  toPicturePlan,
  toPictureSources,
  toPictureStanding,
  toPictureState,
} from "./picture.rules";
import type { PictureStanding, PictureState } from "./picture.schema";

const HOSTS = ["localhost:4747", "127.0.0.1:4747"];

const input = (id: number, name: string, inputKind: string, isEnabled = false): PictureItem => ({
  id,
  name,
  kind: "input",
  inputKind,
  isEnabled,
});

// La place de l'OBS d'Alexis : la capture du PC visible, la tête cachée, la caméra 2 cachée et présente deux fois, et un élément qui n'est
// pas un membre.
const PLACE: PictureItem[] = [
  input(1, "Webcam PC", "dshow_input", true),
  input(2, "SouthPark", "browser_source"),
  input(3, "Caméra 2", "browser_source"),
  input(4, "Caméra 2", "browser_source"),
  input(5, "Cadre", "image_source", true),
  { id: 6, name: "Master - Fond", kind: "scene", inputKind: null, isEnabled: true },
];

const ADDRESSES = new Map<string, string | undefined>([
  ["SouthPark", "http://localhost:4747/head"],
  ["Caméra 2", "http://camera-2.localhost:4747/camera/2"],
  ["Cadre", undefined],
]);

describe("toPictureMemberId", () => {
  it("reconnaît le PC à sa capture vidéo, sur chaque système", () => {
    for (const kind of ["dshow_input", "av_capture_input", "av_capture_input_v2", "v4l2_input"]) {
      expect(toPictureMemberId(input(1, "Capture", kind), undefined, HOSTS), kind).toBe("pc");
    }
  });

  it("reconnaît la tête à sa source navigateur vers /head d'un hôte du serveur, avec ou sans barre finale ni paramètres", () => {
    const head = input(2, "SouthPark", "browser_source");
    for (const address of [
      "http://localhost:4747/head",
      "http://127.0.0.1:4747/head/",
      "http://localhost:4747/head?debug=1",
    ]) {
      expect(toPictureMemberId(head, address, HOSTS), address).toBe("head");
    }
  });

  it("reconnaît une caméra à sa source navigateur vers /camera/<numéro>, sur son hôte ou sur un hôte du serveur", () => {
    const camera = input(3, "Caméra 2", "browser_source");
    expect(toPictureMemberId(camera, "http://camera-2.localhost:4747/camera/2", HOSTS)).toBe("camera-2");
    expect(toPictureMemberId(camera, "http://localhost:4747/camera/2", HOSTS)).toBe("camera-2");
    expect(toPictureMemberId(camera, "http://camera-12.localhost:4747/camera/12", HOSTS)).toBe("camera-12");
  });

  it("refuse tout le reste : une page d'un autre port ou d'un autre site, un numéro mal écrit, un autre genre de source, une scène", () => {
    const page = input(3, "Page", "browser_source");
    for (const address of [
      "http://localhost:3000/head",
      "https://www.twitch.tv/head",
      "http://localhost:4747/show",
      "http://localhost:4747/camera/02",
      "http://camera-3.localhost:4747/camera/2",
      "pas une adresse",
      undefined,
    ]) {
      expect(toPictureMemberId(page, address, HOSTS), String(address)).toBeNull();
    }
    expect(
      toPictureMemberId(input(5, "Image", "image_source"), "http://localhost:4747/head", HOSTS),
    ).toBeNull();
    expect(
      toPictureMemberId(
        { id: 6, name: "Master - Fond", kind: "scene", inputKind: null, isEnabled: true },
        undefined,
        HOSTS,
      ),
    ).toBeNull();
    expect(
      toPictureMemberId(
        { id: 7, name: "Groupe", kind: "group", inputKind: null, isEnabled: true },
        undefined,
        HOSTS,
      ),
    ).toBeNull();
    expect(
      toPictureMemberId(
        { id: 8, name: "Entrée", kind: "input", inputKind: null, isEnabled: true },
        undefined,
        HOSTS,
      ),
    ).toBeNull();
  });
});

describe("toPictureSources", () => {
  it("range les membres dans l'ordre de la place, une source présente deux fois comptant une fois avec tous ses éléments", () => {
    const sources = toPictureSources(PLACE, ADDRESSES, HOSTS);
    expect(sources.map(({ id }) => id)).toEqual(["pc", "head", "camera-2"]);
    expect(sources.map(({ label }) => label)).toEqual(["PC", "Tête", "Caméra 2"]);
    expect(sources[2]?.items).toEqual([
      { id: 3, isEnabled: false },
      { id: 4, isEnabled: false },
    ]);
  });

  it("dit visible un membre dont un seul élément l'est", () => {
    const places = PLACE.map((item) => (item.id === 4 ? { ...item, isEnabled: true } : item));
    const sources = toPictureSources(places, ADDRESSES, HOSTS);
    expect(sources.map(({ isVisible }) => isVisible)).toEqual([true, false, true]);
  });

  it("ignore l'élément qui n'est pas un membre : ni image ni scène imbriquée", () => {
    const sources = toPictureSources(PLACE, ADDRESSES, HOSTS);
    const itemIds = sources.flatMap(({ items }) => items.map((item) => item.id));
    expect(itemIds).toEqual([1, 2, 3, 4]);
  });

  it("rend deux sources vers la même caméra comme un seul membre", () => {
    const twice: PictureItem[] = [input(1, "A", "browser_source"), input(2, "B", "browser_source", true)];
    const addresses = new Map([
      ["A", "http://camera-1.localhost:4747/camera/1"],
      ["B", "http://localhost:4747/camera/1"],
    ]);
    const sources = toPictureSources(twice, addresses, HOSTS);
    expect(sources).toHaveLength(1);
    expect(sources[0]?.items.map((item) => item.id)).toEqual([1, 2]);
    expect(sources[0]?.isVisible).toBe(true);
  });

  it("rend une place vide quand la scène n'a aucun membre", () => {
    expect(toPictureSources([input(5, "Cadre", "image_source")], ADDRESSES, HOSTS)).toEqual([]);
  });
});

describe("toPicturePlan : un seul membre à l'image", () => {
  const sources = toPictureSources(PLACE, ADDRESSES, HOSTS);

  it("montre tous les éléments du membre choisi et cache les autres membres", () => {
    expect(toPicturePlan(sources, "camera-2")).toEqual({ show: [3, 4], hide: [1] });
  });

  it("ne touche ni la tête quand elle est déjà cachée ni le PC déjà visible", () => {
    expect(toPicturePlan(sources, "pc")).toEqual({ show: [], hide: [] });
  });

  it("cache chaque élément visible des autres membres, même quand plusieurs le sont", () => {
    const places = PLACE.map((item) =>
      item.id === 2 || item.id === 4 ? { ...item, isEnabled: true } : item,
    );
    expect(toPicturePlan(toPictureSources(places, ADDRESSES, HOSTS), "head")).toEqual({
      show: [],
      hide: [1, 4],
    });
  });

  it("n'a pas de plan pour un membre qui n'est pas dans la place", () => {
    expect(toPicturePlan(sources, "camera-7")).toBeNull();
  });

  it("ne met jamais un élément qui n'est pas un membre dans le plan", () => {
    const plan = toPicturePlan(sources, "head");
    expect([...(plan?.show ?? []), ...(plan?.hide ?? [])]).not.toContain(5);
    expect([...(plan?.show ?? []), ...(plan?.hide ?? [])]).not.toContain(6);
  });
});

describe("toPictureState", () => {
  const members: ObsPictureMember[] = [
    { id: "head", label: "Tête", isVisible: false },
    { id: "camera-2", label: "Caméra 2", isVisible: false },
    { id: "pc", label: "PC", isVisible: false },
    { id: "camera-1", label: "Caméra 1", isVisible: false },
  ];

  it("range les membres PC, caméras par numéro, tête, quel que soit l'ordre de la place", () => {
    expect(toPictureState(members, []).members.map(({ id }) => id)).toEqual([
      "pc",
      "camera-1",
      "camera-2",
      "head",
    ]);
  });

  it("garde le PC et la tête toujours disponibles, et une caméra seulement quand son téléphone filme jusqu'à OBS", () => {
    const state = toPictureState(members, [2]);
    expect(state.members.map(({ id, isAvailable }) => `${id}:${isAvailable}`)).toEqual([
      "pc:true",
      "camera-1:false",
      "camera-2:true",
      "head:true",
    ]);
  });

  it("prend pour image le membre visible, ou aucun quand rien ne l'est", () => {
    expect(toPictureState(members, []).currentId).toBeNull();
    const shown = members.map((member) =>
      member.id === "camera-2" ? { ...member, isVisible: true } : member,
    );
    expect(toPictureState(shown, []).currentId).toBe("camera-2");
  });

  it("suit l'ordre de la place quand OBS laisse plusieurs membres visibles : le premier gagne", () => {
    const shown = members.map((member) => ({ ...member, isVisible: member.id !== "head" }));
    expect(toPictureState(shown, []).currentId).toBe("camera-2");
  });

  it("n'a ni membre ni image sans place", () => {
    expect(toPictureState([], [1])).toEqual({ members: [], currentId: null });
  });

  it("rend les membres d'OBS sans leurs éléments", () => {
    const sources = toPictureSources(PLACE, ADDRESSES, HOSTS);
    expect(toObsPicture(sources)).toEqual([
      { id: "pc", label: "PC", isVisible: true },
      { id: "head", label: "Tête", isVisible: false },
      { id: "camera-2", label: "Caméra 2", isVisible: false },
    ]);
  });
});

const state = (currentId: string | null, available: Record<string, boolean>): PictureState => ({
  members: [
    { id: "pc", label: "PC", isAvailable: true },
    { id: "camera-1", label: "Caméra 1", isAvailable: available["camera-1"] ?? true },
    { id: "camera-2", label: "Caméra 2", isAvailable: available["camera-2"] ?? true },
    { id: "head", label: "Tête", isAvailable: true },
  ],
  currentId,
});

describe("toNextPictureId : le cycle de la touche", () => {
  it("passe du PC aux caméras par numéro, puis à la tête, puis revient au PC", () => {
    expect(toNextPictureId(state("pc", {}))).toBe("camera-1");
    expect(toNextPictureId(state("camera-1", {}))).toBe("camera-2");
    expect(toNextPictureId(state("camera-2", {}))).toBe("head");
    expect(toNextPictureId(state("head", {}))).toBe("pc");
  });

  it("saute une caméra dont le téléphone ne filme pas", () => {
    expect(toNextPictureId(state("pc", { "camera-1": false }))).toBe("camera-2");
    expect(toNextPictureId(state("pc", { "camera-1": false, "camera-2": false }))).toBe("head");
  });

  it("repart du membre qui suit l'image quand sa caméra ne filme plus", () => {
    expect(toNextPictureId(state("camera-1", { "camera-1": false }))).toBe("camera-2");
    expect(toNextPictureId(state("camera-2", { "camera-2": false }))).toBe("head");
  });

  it("repart du PC quand aucun membre n'est à l'image", () => {
    expect(toNextPictureId(state(null, {}))).toBe("pc");
  });

  it("reste sur le seul membre disponible, et ne propose rien sans place", () => {
    expect(
      toNextPictureId({ members: [{ id: "pc", label: "PC", isAvailable: true }], currentId: "pc" }),
    ).toBe("pc");
    expect(toNextPictureId({ members: [], currentId: null })).toBeNull();
  });

  it("ne propose rien quand aucun membre n'est disponible", () => {
    const none: PictureState = {
      members: [{ id: "camera-1", label: "Caméra 1", isAvailable: false }],
      currentId: "camera-1",
    };
    expect(toNextPictureId(none)).toBeNull();
  });
});

describe("le repli sur la tête", () => {
  it("replie sur la tête, ou sur le PC quand la place n'a pas de tête, ou sur rien", () => {
    expect(toFallbackPictureId(state("camera-1", {}))).toBe("head");
    const withoutHead: PictureState = {
      members: state("pc", {}).members.filter(({ id }) => id !== "head"),
      currentId: "camera-1",
    };
    expect(toFallbackPictureId(withoutHead)).toBe("pc");
    expect(toFallbackPictureId({ members: [], currentId: null })).toBeNull();
  });

  it("dit perdue la caméra à l'image dont le téléphone ne filme plus, et seulement elle", () => {
    expect(toLostPictureId(state("camera-1", { "camera-1": false }))).toBe("camera-1");
    expect(toLostPictureId(state("camera-1", {}))).toBeNull();
    expect(toLostPictureId(state("camera-2", { "camera-1": false }))).toBeNull();
    expect(toLostPictureId(state("pc", { "camera-1": false }))).toBeNull();
    expect(toLostPictureId(state(null, { "camera-1": false }))).toBeNull();
  });
});

describe("le micro qui suit l'image", () => {
  it("rend le micro de la caméra choisie, et celui du PC pour le PC et la tête", () => {
    expect(toPictureMicId("camera-3")).toBe("camera-3");
    expect(toPictureMicId("pc")).toBe("pc");
    expect(toPictureMicId("head")).toBe("pc");
  });
});

describe("le toucher sur « Hors antenne » d'un téléphone", () => {
  it("choisit la caméra de ce téléphone, ou rien tant que le serveur ne lui a pas donné de numéro", () => {
    expect(toPhonePictureId(3)).toBe("camera-3");
    expect(toPhonePictureId(null)).toBeNull();
  });
});

describe("où en est l'image pour un téléphone", () => {
  it("dit s'il y a une place, si ce téléphone est le membre à l'image, et qui l'est", () => {
    expect(toPictureStanding(state("camera-1", {}), 1)).toEqual({
      hasPlace: true,
      isCurrent: true,
      shown: "Caméra 1",
    });
    expect(toPictureStanding(state("camera-1", {}), 2)).toEqual({
      hasPlace: true,
      isCurrent: false,
      shown: "Caméra 1",
    });
    expect(toPictureStanding(state("head", {}), 1)).toEqual({
      hasPlace: true,
      isCurrent: false,
      shown: "Tête",
    });
    expect(toPictureStanding(state("pc", {}), 1)).toEqual({ hasPlace: true, isCurrent: false, shown: "PC" });
  });

  it("ne met aucun nom quand personne n'est à l'image, ou que celui qui l'était n'est plus dans la place", () => {
    expect(toPictureStanding(state(null, {}), 1)).toEqual({ hasPlace: true, isCurrent: false, shown: null });
    expect(toPictureStanding(state("camera-9", {}), 1)).toEqual({
      hasPlace: true,
      isCurrent: false,
      shown: null,
    });
  });

  it("dit qu'il n'y a pas de place sans membre, et qu'un téléphone sans numéro n'est jamais à l'image", () => {
    expect(toPictureStanding({ members: [], currentId: null }, 1)).toEqual({
      hasPlace: false,
      isCurrent: false,
      shown: null,
    });
    expect(toPictureStanding(state("camera-1", {}), null)).toEqual({
      hasPlace: true,
      isCurrent: false,
      shown: "Caméra 1",
    });
  });
});

describe("le bouton qui coupe ou montre la caméra d'un téléphone", () => {
  const standing = (overrides: Partial<PictureStanding>): PictureStanding => ({
    hasPlace: true,
    isCurrent: false,
    shown: "PC",
    ...overrides,
  });

  it("hors de l'image, met ce téléphone à l'image et lui donne le micro", () => {
    expect(toCutRequest(standing({}), 3)).toEqual({ id: "camera-3", isMicKept: false });
    expect(toCutRequest(standing({ shown: "Tête" }), 1)).toEqual({ id: "camera-1", isMicKept: false });
  });

  it("à l'image, passe l'image à la tête et garde le micro à ce téléphone", () => {
    expect(toCutRequest(standing({ isCurrent: true, shown: "Caméra 3" }), 3)).toEqual({
      id: "head",
      isMicKept: true,
    });
  });

  it("ne demande rien tant que le serveur n'a pas donné de numéro au téléphone", () => {
    expect(toCutRequest(standing({}), null)).toBeNull();
    expect(toCutRequest(standing({ isCurrent: true }), null)).toBeNull();
  });

  it("n'est touchable qu'avec une place caméra, ou pour quitter l'image", () => {
    expect(canCutCamera(standing({}))).toBe(true);
    expect(canCutCamera(standing({ hasPlace: false, shown: null }))).toBe(false);
    expect(canCutCamera(standing({ hasPlace: false, isCurrent: true }))).toBe(true);
  });

  it("dit discrètement « Caméra cachée · … au plan » quand le téléphone n'a pas le plan, et rien sinon", () => {
    expect(toCutNotice(standing({ shown: "Tête" }))).toBe("Caméra cachée · Tête au plan");
    expect(toCutNotice(standing({ shown: "Caméra 2" }))).toBe("Caméra cachée · Caméra 2 au plan");
    expect(toCutNotice(standing({ isCurrent: true, shown: "Caméra 1" }))).toBeNull();
    expect(toCutNotice(standing({ shown: null }))).toBeNull();
    expect(toCutNotice(standing({ hasPlace: false, shown: null }))).toBeNull();
  });
});

describe("le micro du live d'une caméra qui ne filme plus", () => {
  const mics = (open: string | null): ControlMic[] =>
    ["pc", "camera-1", "camera-2"].map((id) => ({ id, label: id, isOpen: id === open, isAvailable: true }));

  const cameras = (...open: number[]) =>
    [1, 2].map((number) => ({ number, input: `Caméra ${number}`, isMuted: !open.includes(number) }));

  it("prend pour micro du live de caméra celui qui est ouvert dans la liste, et rien pour le PC", () => {
    expect(toLiveCameraMicId(mics("camera-1"), cameras(1), null)).toBe("camera-1");
    expect(toLiveCameraMicId(mics("camera-2"), cameras(2), "camera-1")).toBe("camera-2");
    expect(toLiveCameraMicId(mics("pc"), cameras(), "camera-1")).toBeNull();
  });

  it("garde la caméra qui l'était quand son téléphone part (elle sort de la liste) tant que sa source reste ouverte dans OBS", () => {
    expect(toLiveCameraMicId([], cameras(1), "camera-1")).toBe("camera-1");
    expect(toLiveCameraMicId(mics(null), cameras(1, 2), "camera-2")).toBe("camera-2");
  });

  it("l'oublie quand Alexis coupe sa source, ouvre un autre micro, ou qu'elle ne l'était pas", () => {
    expect(toLiveCameraMicId([], cameras(), "camera-1")).toBeNull();
    expect(toLiveCameraMicId(mics("pc"), cameras(1), "camera-1")).toBeNull();
    expect(toLiveCameraMicId([], cameras(1), null)).toBeNull();
    expect(toLiveCameraMicId([], cameras(2), "camera-1")).toBeNull();
  });

  it("rend le micro du live quand c'est celui d'une caméra dont le téléphone ne filme pas vers OBS", () => {
    expect(toLostMicId("camera-1", [])).toBe("camera-1");
    expect(toLostMicId("camera-2", [1])).toBe("camera-2");
  });

  it("ne rend rien quand son téléphone filme, ou qu'aucune caméra n'a le micro du live", () => {
    expect(toLostMicId("camera-1", [1])).toBeNull();
    expect(toLostMicId("camera-1", [1, 2])).toBeNull();
    expect(toLostMicId(null, [])).toBeNull();
  });
});

describe("noms des membres", () => {
  it("écrit PC, Tête et Caméra <numéro>", () => {
    expect(toPictureLabel("pc")).toBe("PC");
    expect(toPictureLabel("head")).toBe("Tête");
    expect(toPictureLabel("camera-4")).toBe("Caméra 4");
  });

  it("lit le numéro d'une caméra et refuse tout autre texte", () => {
    expect(toPictureCameraNumber("camera-12")).toBe(12);
    for (const wrong of ["pc", "head", "camera-0", "camera-02", "camera-", "camera-1x", "Camera-1"]) {
      expect(toPictureCameraNumber(wrong), wrong).toBeNull();
    }
  });
});

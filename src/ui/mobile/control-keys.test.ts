import { describe, expect, it } from "vitest";
import { MUTE_MIC_ID } from "../../domain/control.rules";
import { type ControlState, IDLE_CONTROL } from "../../domain/control.schema";
import type { SoundSummary } from "../../domain/sound.schema";
import {
  PAGE_LABELS,
  toEmptyText,
  toKeys,
  toMicKeys,
  toMicsEmptyText,
  toPictureEmptyText,
  toPictureKeys,
  toSceneKeys,
  toScenesEmptyText,
  toSentence,
} from "./control-keys";

const STATE: ControlState = {
  ...IDLE_CONTROL,
  isLinked: true,
  scene: "Jeu",
  scenes: ["Jeu", "Pause", "Cuisine"],
  mics: [
    { id: "pc", label: "Micro du PC", isOpen: false, isAvailable: true },
    { id: "camera-1", label: "Caméra 1", isOpen: true, isAvailable: true },
    { id: "camera-2", label: "Caméra 2", isOpen: false, isAvailable: false },
  ],
};

const sound = (id: string, title: string): SoundSummary => ({
  id,
  title,
  fader: 80,
  version: "1",
  rewardTitles: [],
  clipCount: 0,
});

describe("les touches du menu des scènes", () => {
  it("fait une touche par scène d'OBS, dans l'ordre, la scène à l'antenne active et les autres neutres", () => {
    const keys = toSceneKeys(STATE);
    expect(keys.map(({ label, state }) => [label, state])).toEqual([
      ["Jeu", "active"],
      ["Pause", "idle"],
      ["Cuisine", "idle"],
    ]);
    expect(keys[1]?.action).toEqual({ kind: "scene", name: "Pause" });
    expect(keys.every(({ isDisabled }) => !isDisabled)).toBe(true);
  });

  it("n'a aucune touche quand OBS n'a pas de scène, et le dit selon qu'il est joint ou non", () => {
    expect(toSceneKeys(IDLE_CONTROL)).toEqual([]);
    expect(toScenesEmptyText(IDLE_CONTROL)).toBe("OBS n'est pas connecté.");
    expect(toScenesEmptyText({ ...IDLE_CONTROL, isLinked: true })).toBe("Aucune scène dans OBS.");
  });

  it("Quand OBS a des scènes imbriquées « Master », le système ne doit pas en faire de touche, les vraies scènes gardent leur ordre", () => {
    const keys = toSceneKeys({
      ...STATE,
      scene: "Chill",
      scenes: [
        "Jeu",
        "Master - Tchat",
        "LivePlace",
        "master - Background video",
        "Chill",
        "Master - Webcam",
        "Pause",
      ],
    });
    expect(keys.map(({ label, state }) => [label, state])).toEqual([
      ["Jeu", "idle"],
      ["LivePlace", "idle"],
      ["Chill", "active"],
      ["Pause", "idle"],
    ]);
  });

  it("ne met aucune touche en surbrillance quand la scène à l'antenne est une scène de Master, et dit qu'il n'y a rien à passer quand elles sont toutes de Master", () => {
    const keys = toSceneKeys({ ...STATE, scene: "Master - Tchat", scenes: ["Jeu", "Master - Tchat"] });
    expect(keys.map(({ state }) => state)).toEqual(["idle"]);
    const onlyMaster = { ...STATE, scenes: ["Master - Tchat", "Master - Webcam"] };
    expect(toSceneKeys(onlyMaster)).toEqual([]);
    expect(toScenesEmptyText(onlyMaster)).toBe("Aucune scène dans OBS.");
  });
});

describe("les pages de la grille", () => {
  it("n'a plus de page des scènes ni des micros : ils ont leur menu, dans le bandeau", () => {
    expect(Object.keys(PAGE_LABELS)).toEqual(["sounds", "fox"]);
    expect(toEmptyText("sounds", null)).toBe("Chargement…");
  });
});

describe("les touches des sons", () => {
  it("fait une touche neutre par son de la soundboard, qui le joue dans OBS", () => {
    const keys = toKeys("sounds", STATE, [sound("a1", "Applaudissements"), sound("b2", "Rire")]);
    expect(keys.map(({ label, state }) => [label, state])).toEqual([
      ["Applaudissements", "idle"],
      ["Rire", "idle"],
    ]);
    expect(keys[0]?.action).toEqual({ kind: "sound", id: "a1" });
  });

  it("dit « Chargement… » tant que la liste n'est pas là, puis où ajouter un son quand elle est vide", () => {
    expect(toKeys("sounds", STATE, null)).toEqual([]);
    expect(toEmptyText("sounds", null)).toBe("Chargement…");
    expect(toEmptyText("sounds", [])).toBe("Aucun son : ajoute-en dans l'onglet Sons.");
  });
});

describe("les touches du menu Micro", () => {
  it("met le micro entendu en clair et les autres en neutre, PC avant les caméras, et Muet en dernier", () => {
    const keys = toMicKeys(STATE);
    expect(keys.map(({ label, state }) => [label, state])).toEqual([
      ["PC", "idle"],
      ["Caméra 1", "active"],
      ["Caméra 2", "idle"],
      ["Muet", "idle"],
    ]);
    expect(keys[1]?.action).toEqual({ kind: "mic", id: "camera-1" });
    expect(keys[3]?.action).toEqual({ kind: "mic", id: MUTE_MIC_ID });
  });

  it("met en clair PC quand c'est lui qui est entendu, et Muet quand aucun micro n'est ouvert", () => {
    const pcOpen = toMicKeys({
      ...STATE,
      mics: STATE.mics.map((mic) => ({ ...mic, isOpen: mic.id === "pc" })),
    });
    expect(pcOpen.map(({ state }) => state)).toEqual(["active", "idle", "idle", "idle"]);
    const noneOpen = toMicKeys({ ...STATE, mics: STATE.mics.map((mic) => ({ ...mic, isOpen: false })) });
    expect(noneOpen.map(({ state }) => state)).toEqual(["idle", "idle", "idle", "active"]);
  });

  it("écrit « · ce téléphone » après la caméra de ce téléphone, et rien après les autres", () => {
    expect(toMicKeys(STATE, 1).map(({ label }) => label)).toEqual([
      "PC",
      "Caméra 1 · ce téléphone",
      "Caméra 2",
      "Muet",
    ]);
    expect(toMicKeys(STATE, 3).map(({ label }) => label)).toEqual(["PC", "Caméra 1", "Caméra 2", "Muet"]);
    expect(toMicKeys(STATE, null).map(({ label }) => label)).toEqual(["PC", "Caméra 1", "Caméra 2", "Muet"]);
  });

  it("ne met pas Muet en clair quand OBS n'est pas joint : on ne sait pas qu'aucun micro n'est ouvert", () => {
    const offline = toMicKeys({
      ...STATE,
      isLinked: false,
      mics: STATE.mics.map((mic) => ({ ...mic, isOpen: false })),
    });
    expect(offline.at(-1)).toMatchObject({ label: "Muet", state: "idle", isDisabled: false });
  });

  it("grise le micro d'une caméra dont la source OBS n'existe pas, et dit ce qui manque", () => {
    const [, , camera] = toMicKeys(STATE);
    expect(camera).toMatchObject({ isDisabled: true, note: "Source OBS introuvable" });
    const [pc] = toMicKeys(STATE);
    expect(pc).not.toHaveProperty("note");
    expect(pc?.isDisabled).toBe(false);
  });

  it("n'a aucune touche, pas même Muet, avant le premier état du serveur, qui donne toujours celui du PC, et le dit", () => {
    expect(toMicKeys(IDLE_CONTROL)).toEqual([]);
    expect(toMicsEmptyText()).toBe("En attente du serveur…");
  });
});

describe("les touches du menu de l'image", () => {
  const withPicture = (currentId: string | null): ControlState => ({
    ...STATE,
    picture: {
      members: [
        { id: "pc", label: "PC", isAvailable: true },
        { id: "camera-1", label: "Caméra 1", isAvailable: true },
        { id: "camera-2", label: "Caméra 2", isAvailable: false },
        { id: "head", label: "Tête", isAvailable: true },
      ],
      currentId,
    },
  });

  it("fait une touche par membre de la place, dans l'ordre PC, caméras, Tête, le membre à l'image en clair", () => {
    const keys = toPictureKeys(withPicture("camera-1"));
    expect(keys.map(({ label, state }) => [label, state])).toEqual([
      ["PC", "idle"],
      ["Caméra 1", "active"],
      ["Caméra 2", "idle"],
      ["Tête", "idle"],
    ]);
    expect(keys[1]?.action).toEqual({ kind: "picture", id: "camera-1" });
    expect(keys[3]?.action).toEqual({ kind: "picture", id: "head" });
  });

  it("ne met personne en clair quand rien n'est à l'image", () => {
    expect(toPictureKeys(withPicture(null)).every(({ state }) => state === "idle")).toBe(true);
  });

  it("grise une caméra dont le téléphone ne filme pas vers OBS, et dit ce qui manque ; le PC et la tête restent touchables", () => {
    const keys = toPictureKeys(withPicture("pc"));
    expect(keys[2]).toMatchObject({ isDisabled: true, note: "Le téléphone ne filme pas vers OBS" });
    expect(keys.filter(({ isDisabled }) => !isDisabled).map(({ label }) => label)).toEqual([
      "PC",
      "Caméra 1",
      "Tête",
    ]);
    expect(keys[0]).not.toHaveProperty("note");
  });

  it("n'a aucune touche sans place caméra, et dit si OBS n'est pas joint ou n'a pas de place", () => {
    expect(toPictureKeys(IDLE_CONTROL)).toEqual([]);
    expect(toPictureEmptyText(IDLE_CONTROL)).toBe("OBS n'est pas connecté.");
    expect(toPictureEmptyText({ ...IDLE_CONTROL, isLinked: true })).toBe(
      "OBS n'a pas de place caméra : vérifie cameraSlotScene.",
    );
  });
});

describe("les touches de Jean-Renard", () => {
  it("donne trois touches fixes dans cet ordre : le bilan, la fin du live moins dix, la fin du live plus dix", () => {
    const keys = toKeys("fox", IDLE_CONTROL, null);
    expect(keys.map(({ label, action }) => [label, action])).toEqual([
      ["Faire le bilan", { kind: "review" }],
      ["Fin du live −10", { kind: "end", direction: "sooner" }],
      ["Fin du live +10", { kind: "end", direction: "later" }],
    ]);
    expect(keys.every(({ state, isDisabled }) => state === "idle" && !isDisabled)).toBe(true);
  });

  it("écrit sous les deux touches de fin l'heure de la fin prévue, ou « --:-- » sans fin", () => {
    const [, sooner, later] = toKeys("fox", IDLE_CONTROL, null);
    expect(later?.note).toBe("--:--");
    expect(sooner?.note).toBe("--:--");
    const endAt = new Date(2026, 9, 19, 23, 40).getTime();
    const withEnd = toKeys("fox", { ...IDLE_CONTROL, endAt }, null);
    expect(withEnd[1]?.note).toBe("23:40");
    expect(withEnd[2]?.note).toBe("23:40");
    expect(withEnd[0]).not.toHaveProperty("note");
  });

  it("ne dit rien quand la page est vide : elle ne l'est jamais", () => {
    expect(toEmptyText("fox", null)).toBe("");
  });
});

describe("toSentence et PAGE_LABELS", () => {
  it("met une majuscule au refus du serveur, sans toucher au reste", () => {
    expect(toSentence("la scène « Pause » n'existe pas")).toBe("La scène « Pause » n'existe pas");
    expect(toSentence("OBS n'est pas connecté")).toBe("OBS n'est pas connecté");
    expect(toSentence("")).toBe("");
  });

  it("nomme les deux pages : Sons, Jean-Renard", () => {
    expect(PAGE_LABELS).toEqual({ sounds: "Sons", fox: "Jean-Renard" });
  });
});

import { describe, expect, it } from "vitest";
import type { ObsIdentity, ObsRenamed } from "../domain/obs-ids.rules";
import type { ObsIdsFile } from "../domain/obs-ids.schema";
import {
  createObsIds,
  type ObsIdsSettings,
  type ObsIdsSource,
  type ObsIdsStore,
  type ObsNameChange,
} from "./obs-ids.usecase";

const MIC: ObsIdentity = { uuid: "u-mic", name: "Mic/Aux" };
const DESKTOP: ObsIdentity = { uuid: "u-desktop", name: "Audio du bureau" };
const PLACE: ObsIdentity = { uuid: "s-webcam", name: "Master - Webcam" };
const END: ObsIdentity = { uuid: "s-end", name: "Fin" };

const SETTINGS: ObsIdsSettings = {
  micName: "Mic/Aux",
  desktopName: "Audio du bureau",
  cameraSlotScene: "Master - Webcam",
  showEndScene: "",
};

// Un faux OBS : ses entrées et ses scènes avec leur identifiant, les lectures demandées, et les renommages envoyés à la main.
const createFakeSource = () => {
  const state = {
    inputs: [MIC, DESKTOP] as ObsIdentity[],
    scenes: [PLACE, END] as ObsIdentity[],
    error: undefined as Error | undefined,
    reads: 0,
  };
  const listeners: Array<(renamed: ObsRenamed) => void> = [];
  const source: ObsIdsSource = {
    async listInputIdentities() {
      state.reads += 1;
      if (state.error) throw state.error;
      return state.inputs;
    },
    async listSceneIdentities() {
      state.reads += 1;
      if (state.error) throw state.error;
      return state.scenes;
    },
    onRenamed: (listener) => listeners.push(listener),
  };
  const sendRenamed = (renamed: ObsRenamed) => {
    for (const listener of listeners) listener(renamed);
  };
  return { source, state, sendRenamed };
};

// Un faux fichier : ce qu'il contient, ce qui y a été écrit, et `error` : le disque refuse d'écrire.
const createFakeStore = (file?: ObsIdsFile) => {
  const state = { file, writes: [] as ObsIdsFile[], error: undefined as Error | undefined };
  const store: ObsIdsStore = {
    get: () => state.file,
    update(next) {
      if (state.error) throw state.error;
      state.writes.push(next);
      state.file = next;
    },
  };
  return { store, state };
};

const setup = (settings: ObsIdsSettings = SETTINGS, file?: ObsIdsFile) => {
  const fake = createFakeSource();
  const disk = createFakeStore(file);
  const logs: string[] = [];
  const changes: ObsNameChange[] = [];
  const ids = createObsIds({
    source: fake.source,
    store: disk.store,
    settings,
    log: (line) => logs.push(line),
  });
  ids.subscribe((change) => changes.push(change));
  return { fake, disk, logs, changes, ids };
};

// Les lectures lancées par un changement de réglage finissent après lui : on leur laisse leur tour.
const settle = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

// Une session qui a déjà retenu trois réglages : le fichier qu'elle a écrit.
const REMEMBERED: ObsIdsFile = {
  ids: {
    micName: { configuredName: "Mic/Aux", uuid: "u-mic", name: "Mic/Aux" },
    desktopName: { configuredName: "Audio du bureau", uuid: "u-desktop", name: "Audio du bureau" },
    cameraSlotScene: { configuredName: "Master - Webcam", uuid: "s-webcam", name: "Master - Webcam" },
  },
};

describe("createObsIds : les noms avant qu'OBS réponde", () => {
  it("prend les noms des réglages, et ne voit rien dans un réglage vide ou absent", () => {
    const { ids } = setup({ micName: "Mic/Aux", showEndScene: "" });
    expect(ids.getNames()).toEqual({ micName: "Mic/Aux" });
  });

  it("prend le dernier nom connu de chaque source retenue", () => {
    const file: ObsIdsFile = {
      ids: { micName: { configuredName: "Mic/Aux", uuid: "u-mic", name: "Micro PC" } },
    };
    const { ids } = setup(SETTINGS, file);
    expect(ids.getNames()).toEqual({
      micName: "Micro PC",
      desktopName: "Audio du bureau",
      cameraSlotScene: "Master - Webcam",
    });
  });

  it("préfère le nom des réglages quand il a changé depuis que la source a été retenue", () => {
    const file: ObsIdsFile = {
      ids: { micName: { configuredName: "Autre", uuid: "u-mic", name: "Micro PC" } },
    };
    expect(setup(SETTINGS, file).ids.getNames().micName).toBe("Mic/Aux");
  });
});

describe("createObsIds : la première connexion", () => {
  it("retient l'identifiant de chaque source trouvée par le nom du réglage, dans le fichier, et le dit", async () => {
    const { ids, disk, logs, changes } = setup();
    await ids.resolve();
    expect(disk.state.writes).toEqual([REMEMBERED]);
    expect(logs).toContain(
      "Entrée du micro « Mic/Aux » retenue par son identifiant : si OBS la renomme, elle reste suivie.",
    );
    expect(logs).toHaveLength(3);
    expect(changes).toEqual([]);
  });

  it("ne retient rien d'une source qu'OBS ne liste pas, et n'écrit rien", async () => {
    const { ids, fake, disk, logs } = setup();
    fake.state.inputs = [];
    fake.state.scenes = [];
    await ids.resolve();
    expect(disk.state.writes).toEqual([]);
    expect(logs).toEqual([]);
    expect(ids.getNames().micName).toBe("Mic/Aux");
  });

  it("ne demande à OBS que les genres dont un réglage a besoin", async () => {
    const { ids, fake } = setup({ micName: "Mic/Aux" });
    await ids.resolve();
    expect(fake.state.reads).toBe(1);
  });

  it("dit une seule fois qu'OBS ne donne pas ses identifiants, garde les noms des réglages, et ne lève pas", async () => {
    const { ids, fake, disk, logs } = setup();
    fake.state.error = new Error("Not connected");
    await ids.resolve();
    await ids.resolve();
    expect(logs).toEqual([
      "Suivi d'OBS : identifiants illisibles, les noms des réglages sont utilisés (Not connected).",
    ]);
    expect(ids.getNames().micName).toBe("Mic/Aux");
    expect(disk.state.writes).toEqual([]);
  });
});

describe("createObsIds : une connexion de plus", () => {
  it("retrouve une source renommée entre-temps par son identifiant, change le nom, le dit et met le fichier à jour", async () => {
    const { ids, fake, disk, logs, changes } = setup(SETTINGS, REMEMBERED);
    fake.state.inputs = [{ uuid: "u-mic", name: "Micro PC" }, DESKTOP];
    await ids.resolve();
    expect(ids.getNames().micName).toBe("Micro PC");
    expect(changes).toEqual([{ key: "micName", from: "Mic/Aux", to: "Micro PC" }]);
    expect(logs).toEqual(["Entrée du micro renommée dans OBS : « Mic/Aux » → « Micro PC », suivie."]);
    expect(disk.state.writes).toHaveLength(1);
    expect(disk.state.file?.ids.micName).toEqual({
      configuredName: "Mic/Aux",
      uuid: "u-mic",
      name: "Micro PC",
    });
  });

  it("n'écrit rien et ne dit rien quand rien n'a bougé", async () => {
    const { ids, disk, logs, changes } = setup(SETTINGS, REMEMBERED);
    await ids.resolve();
    expect(disk.state.writes).toEqual([]);
    expect(logs).toEqual([]);
    expect(changes).toEqual([]);
  });

  it("revient au nom des réglages quand la source retenue est supprimée, le dit une seule fois, et l'oublie", async () => {
    const { ids, fake, disk, logs, changes } = setup(SETTINGS, {
      ids: { micName: { configuredName: "Mic/Aux", uuid: "u-mic", name: "Micro PC" } },
    });
    fake.state.inputs = [DESKTOP];
    await ids.resolve();
    await ids.resolve();
    expect(ids.getNames().micName).toBe("Mic/Aux");
    expect(changes).toEqual([{ key: "micName", from: "Micro PC", to: "Mic/Aux" }]);
    expect(logs.filter((line) => line.includes("supprimée"))).toEqual([
      "Entrée du micro « Micro PC » supprimée dans OBS : retour au nom des réglages, « Mic/Aux ».",
    ]);
    expect(disk.state.file?.ids.micName).toBeUndefined();
  });

  it("suit une scène renommée, comme une entrée", async () => {
    const { ids, fake, changes } = setup(SETTINGS, REMEMBERED);
    fake.state.scenes = [{ uuid: "s-webcam", name: "Webcam" }, END];
    await ids.resolve();
    expect(ids.getNames().cameraSlotScene).toBe("Webcam");
    expect(changes).toEqual([{ key: "cameraSlotScene", from: "Master - Webcam", to: "Webcam" }]);
  });
});

describe("createObsIds : un renommage pendant la connexion", () => {
  const renamed: ObsRenamed = { kind: "input", uuid: "u-mic", from: "Mic/Aux", to: "Micro PC" };

  it("passe tout de suite au nouveau nom, le dit, prévient les abonnés et met le fichier à jour", () => {
    const { fake, ids, disk, logs, changes } = setup(SETTINGS, REMEMBERED);
    fake.sendRenamed(renamed);
    expect(ids.getNames().micName).toBe("Micro PC");
    expect(changes).toEqual([{ key: "micName", from: "Mic/Aux", to: "Micro PC" }]);
    expect(logs).toEqual(["Entrée du micro renommée dans OBS : « Mic/Aux » → « Micro PC », suivie."]);
    expect(disk.state.file?.ids.micName?.name).toBe("Micro PC");
  });

  it("suit deux renommages de suite", () => {
    const { fake, ids } = setup(SETTINGS, REMEMBERED);
    fake.sendRenamed(renamed);
    fake.sendRenamed({ ...renamed, from: "Micro PC", to: "Mon micro" });
    expect(ids.getNames().micName).toBe("Mon micro");
  });

  it("ne touche à rien quand c'est une source qu'aucun réglage ne désigne", () => {
    const { fake, disk, logs, changes, ids } = setup(SETTINGS, REMEMBERED);
    fake.sendRenamed({ kind: "input", uuid: "u-autre", from: "Caméra", to: "Webcam USB" });
    expect(changes).toEqual([]);
    expect(logs).toEqual([]);
    expect(disk.state.writes).toEqual([]);
    expect(ids.getNames().micName).toBe("Mic/Aux");
  });

  it("suit une scène renommée", () => {
    const { fake, ids, changes } = setup(SETTINGS, REMEMBERED);
    fake.sendRenamed({ kind: "scene", uuid: "s-webcam", from: "Master - Webcam", to: "Place caméra" });
    expect(ids.getNames().cameraSlotScene).toBe("Place caméra");
    expect(changes).toEqual([{ key: "cameraSlotScene", from: "Master - Webcam", to: "Place caméra" }]);
  });

  it("ne confond pas une scène et une entrée qui auraient le même identifiant", () => {
    const { fake, ids } = setup(SETTINGS, REMEMBERED);
    fake.sendRenamed({ kind: "scene", uuid: "u-mic", from: "Mic/Aux", to: "Autre" });
    expect(ids.getNames().micName).toBe("Mic/Aux");
  });

  it("ne suit pas la source d'un réglage dont le nom a été changé à la main depuis", () => {
    const { fake, ids } = setup({ ...SETTINGS, micName: "Autre" }, REMEMBERED);
    fake.sendRenamed(renamed);
    expect(ids.getNames().micName).toBe("Autre");
  });
});

describe("createObsIds : un nom de réglage changé", () => {
  it("l'emporte, retient la source de ce nouveau nom, et prévient les abonnés tout de suite", async () => {
    const { ids, fake, disk, changes } = setup(SETTINGS, REMEMBERED);
    fake.state.scenes = [PLACE, END];
    ids.update({ ...SETTINGS, showEndScene: "Fin" });
    expect(ids.getNames().showEndScene).toBe("Fin");
    expect(changes).toEqual([{ key: "showEndScene", from: undefined, to: "Fin" }]);
    await settle();
    expect(disk.state.file?.ids.showEndScene).toEqual({ configuredName: "Fin", uuid: "s-end", name: "Fin" });
  });

  it("garde la même source quand le réglage prend le nom qu'OBS lui donne déjà : sans relire OBS", () => {
    const { ids, fake, disk, changes } = setup(
      { ...SETTINGS, showEndScene: "Fin" },
      { ids: { showEndScene: { configuredName: "Fin", uuid: "s-end", name: "Au revoir" } } },
    );
    expect(ids.getNames().showEndScene).toBe("Au revoir");
    ids.update({ ...SETTINGS, showEndScene: "Au revoir" });
    expect(ids.getNames().showEndScene).toBe("Au revoir");
    expect(changes).toEqual([]);
    expect(fake.state.reads).toBe(0);
    expect(disk.state.file?.ids.showEndScene).toEqual({
      configuredName: "Au revoir",
      uuid: "s-end",
      name: "Au revoir",
    });
  });

  it("ne remplace pas une source retenue par un nom qu'OBS ne connaît pas : le nom des réglages sert tel quel", async () => {
    const { ids, disk, changes } = setup(SETTINGS, REMEMBERED);
    ids.update({ ...SETTINGS, micName: "Inconnue" });
    await settle();
    expect(ids.getNames().micName).toBe("Inconnue");
    expect(changes).toEqual([{ key: "micName", from: "Mic/Aux", to: "Inconnue" }]);
    expect(disk.state.file?.ids.micName).toBeUndefined();
  });

  it("ne voit plus rien dans un réglage retiré, et le dit aux abonnés", () => {
    const { ids, changes } = setup(SETTINGS, REMEMBERED);
    ids.update({ micName: "Mic/Aux", cameraSlotScene: "Master - Webcam" });
    expect(ids.getNames().desktopName).toBeUndefined();
    expect(changes).toEqual([{ key: "desktopName", from: "Audio du bureau", to: undefined }]);
  });

  it("ne remet pas l'ancien nom quand le réglage change pendant que OBS répond", async () => {
    const { ids, changes } = setup();
    const reading = ids.resolve();
    ids.update({ ...SETTINGS, micName: "Autre" });
    await reading;
    await settle();
    expect(ids.getNames().micName).toBe("Autre");
    expect(changes).toEqual([{ key: "micName", from: "Mic/Aux", to: "Autre" }]);
  });

  it("ne fait rien quand les noms n'ont pas changé", () => {
    const { ids, fake, disk, changes } = setup(SETTINGS, REMEMBERED);
    ids.update({ ...SETTINGS });
    expect(changes).toEqual([]);
    expect(fake.state.reads).toBe(0);
    expect(disk.state.writes).toEqual([]);
  });
});

describe("createObsIds : le fichier", () => {
  it("dit que le fichier n'est pas écrit quand le disque refuse, et continue de suivre", () => {
    const { fake, ids, disk, logs } = setup(SETTINGS, REMEMBERED);
    disk.state.error = new Error("EACCES");
    fake.sendRenamed({ kind: "input", uuid: "u-mic", from: "Mic/Aux", to: "Micro PC" });
    expect(ids.getNames().micName).toBe("Micro PC");
    expect(logs.at(-1)).toBe("Suivi d'OBS : identifiants non enregistrés (EACCES).");
  });

  it("ne garde pas la source d'un réglage retiré", () => {
    const { ids, disk } = setup(SETTINGS, REMEMBERED);
    ids.update({ micName: "Mic/Aux", cameraSlotScene: "Master - Webcam" });
    expect(disk.state.file?.ids.desktopName).toBeUndefined();
  });

  it("cesse d'écouter un abonné qui se retire", () => {
    const { fake, ids, changes } = setup(SETTINGS, REMEMBERED);
    const seen: ObsNameChange[] = [];
    const unsubscribe = ids.subscribe((change) => seen.push(change));
    unsubscribe();
    fake.sendRenamed({ kind: "input", uuid: "u-mic", from: "Mic/Aux", to: "Micro PC" });
    expect(seen).toEqual([]);
    expect(changes).toHaveLength(1);
  });
});

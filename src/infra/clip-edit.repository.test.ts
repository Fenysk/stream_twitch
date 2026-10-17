import {
  createReadStream,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import type { ClipConfirmation } from "../domain/clip.schema";
import { CONFIRMED_FOLDER, createClipStore, PROCESSED_FOLDER } from "./clip.repository";

const folders: string[] = [];

afterEach(() => {
  for (const folder of folders.splice(0)) rmSync(folder, { recursive: true, force: true });
});

const confirmation: ClipConfirmation = {
  title: "Le saut",
  phrase: "Quel saut !",
  start: 1,
  end: 5,
  rawName: "Replay.mp4",
  processedName: "Replay.mp4",
  confirmedAt: "2026-10-16T10:00:00.000Z",
};

const names = (folder: string): string[] => (existsSync(folder) ? readdirSync(folder).sort() : []);

// Un dossier de clips jetable (jamais celui d'Alexis) avec un clip confirmé « Replay » : sa vidéo et son JSON dans Confirmés, son
// clip brut dans Traités.
const setup = (json: Partial<ClipConfirmation> = {}) => {
  const folder = mkdtempSync(join(tmpdir(), "clip-edit-"));
  folders.push(folder);
  const confirmed = join(folder, CONFIRMED_FOLDER);
  const processed = join(folder, PROCESSED_FOLDER);
  mkdirSync(confirmed);
  mkdirSync(processed);
  writeFileSync(join(confirmed, "Replay.mp4"), "ancienne vidéo");
  writeFileSync(join(confirmed, "Replay.json"), JSON.stringify({ ...confirmation, ...json }));
  writeFileSync(join(processed, "Replay.mp4"), "clip brut");
  const logs: string[] = [];
  return { folder, confirmed, processed, logs, store: createClipStore((line) => logs.push(line)) };
};

const getJson = (path: string): unknown => JSON.parse(readFileSync(path, "utf8"));

describe("le lien d'un clip confirmé avec son clip brut de Traités", () => {
  it("retrouve le clip brut sous le nom que le JSON garde, même renommé « (2) » dans Traités", () => {
    const { folder, processed, store } = setup({ processedName: "Replay (2).mp4" });
    writeFileSync(join(processed, "Replay (2).mp4"), "le vrai brut");
    expect(store.listConfirmed(folder).map(({ processedName }) => processedName)).toEqual(["Replay (2).mp4"]);
  });

  it("retombe sur rawName pour un JSON d'avant, qui n'a pas processedName", () => {
    const { folder, confirmed, store } = setup();
    const { processedName: _, ...old } = confirmation;
    writeFileSync(join(confirmed, "Replay.json"), JSON.stringify(old));
    expect(store.listConfirmed(folder).map(({ processedName }) => processedName)).toEqual(["Replay.mp4"]);
  });

  it("dit que le clip brut n'y est plus (null) quand il a disparu de Traités", () => {
    const { folder, processed, store } = setup();
    rmSync(join(processed, "Replay.mp4"));
    expect(store.listConfirmed(folder).map(({ processedName }) => processedName)).toEqual([null]);
  });

  it("refuse un nom qui n'est pas un clip du dossier Traités : chemin, remontée, autre dossier", () => {
    for (const processedName of ["../Replay.mp4", "..\\Replay.mp4", "C:\\Windows\\Replay.mp4", "notes.txt"]) {
      const { folder, store } = setup({ processedName });
      expect(store.listConfirmed(folder).map((clip) => clip.processedName)).toEqual([null]);
    }
  });

  it("donne à chaque clip la version de sa vidéo, qui change quand la vidéo change", () => {
    const { folder, confirmed, store } = setup();
    const before = store.listConfirmed(folder)[0]?.version;
    expect(before).toMatch(/^[0-9]+-15$/);
    writeFileSync(join(confirmed, "Replay.mp4"), "une vidéo plus longue");
    expect(store.listConfirmed(folder)[0]?.version).not.toBe(before);
  });

  it("garde le nom réel du clip brut quand la validation le range sous « (2) » parce que Traités a déjà le même nom", () => {
    const { folder, processed, store } = setup();
    // Un nouveau clip brut du même nom arrive dans le dossier d'OBS, puis se valide : Traités a déjà « Replay.mp4 ».
    writeFileSync(join(folder, "Replay.mp4"), "deuxième clip brut");
    const plan = store.planConfirm(folder, "Replay.mp4");
    if (!plan) throw new Error("le plan manque");
    writeFileSync(plan.outputPath, "recodé");
    store.commitConfirm(folder, "Replay.mp4", plan, {
      ...confirmation,
      processedName: undefined,
    } as ClipConfirmation);
    expect(plan.name).toBe("Replay (2).mp4");
    expect(names(processed)).toEqual(["Replay (2).mp4", "Replay.mp4"]);
    const second = store.listConfirmed(folder).find(({ name }) => name === "Replay (2).mp4");
    expect(second?.processedName).toBe("Replay (2).mp4");
    expect(readFileSync(join(processed, "Replay (2).mp4"), "utf8")).toBe("deuxième clip brut");
  });

  it("sert le clip brut de Traités, avec sa version, et pas celui du dossier brut", () => {
    const { folder, store } = setup();
    expect(store.openVideo(folder, "processed", "Replay.mp4")?.size).toBe(9);
    expect(store.openVideo(folder, "processed", "Replay.mp4")?.version).toMatch(/^[0-9]+-9$/);
    expect(store.openVideo(folder, "raw", "Replay.mp4")).toBeUndefined();
    expect(store.openVideo(folder, "processed", "../Replay.mp4")).toBeUndefined();
  });
});

describe("modifier le titre et la phrase d'un clip confirmé", () => {
  it("réécrit le JSON sans toucher à la vidéo", () => {
    const { folder, confirmed, store } = setup();
    store.updateConfirmation(folder, "Replay.mp4", { ...confirmation, title: "Nouveau titre", phrase: "" });
    expect(getJson(join(confirmed, "Replay.json"))).toEqual({
      ...confirmation,
      title: "Nouveau titre",
      phrase: "",
    });
    expect(readFileSync(join(confirmed, "Replay.mp4"), "utf8")).toBe("ancienne vidéo");
    expect(names(confirmed)).toEqual(["Replay.json", "Replay.mp4"]);
  });

  it("refuse un clip confirmé qui n'existe pas", () => {
    const { folder, store } = setup();
    expect(() => store.updateConfirmation(folder, "Absent.mp4", confirmation)).toThrow("n'existe plus");
  });
});

describe("recoder un clip confirmé depuis son clip brut", () => {
  it("prépare un fichier partiel dans Confirmés et lit le clip brut de Traités", () => {
    const { folder, confirmed, processed, store } = setup();
    expect(store.planReplace(folder, "Replay.mp4", "Replay.mp4")).toEqual({
      inputPath: join(processed, "Replay.mp4"),
      outputPath: join(confirmed, "Replay.partial"),
      name: "Replay.mp4",
    });
  });

  it("ne prépare rien quand le clip confirmé ou son clip brut manque, ou que le nom n'est pas un clip", () => {
    const { folder, store } = setup();
    expect(store.planReplace(folder, "Absent.mp4", "Replay.mp4")).toBeUndefined();
    expect(store.planReplace(folder, "Replay.mp4", "Absent.mp4")).toBeUndefined();
    expect(store.planReplace(folder, "Replay.mp4", "../Replay.mp4")).toBeUndefined();
  });

  it("met la nouvelle vidéo à la place de l'ancienne, range l'ancienne dans Traités et réécrit le JSON", async () => {
    const { folder, confirmed, processed, store } = setup();
    const plan = store.planReplace(folder, "Replay.mp4", "Replay.mp4");
    if (!plan) throw new Error("le plan manque");
    writeFileSync(plan.outputPath, "nouvelle vidéo");
    await store.commitReplace(folder, plan, { ...confirmation, start: 2, end: 4 });
    expect(readFileSync(join(confirmed, "Replay.mp4"), "utf8")).toBe("nouvelle vidéo");
    expect(getJson(join(confirmed, "Replay.json"))).toEqual({ ...confirmation, start: 2, end: 4 });
    expect(names(confirmed)).toEqual(["Replay.json", "Replay.mp4"]);
    expect(names(processed)).toEqual(["Replay (ancienne version).mp4", "Replay.mp4"]);
    expect(readFileSync(join(processed, "Replay (ancienne version).mp4"), "utf8")).toBe("ancienne vidéo");
    expect(readFileSync(join(processed, "Replay.mp4"), "utf8")).toBe("clip brut");
  });

  it("remplace une vidéo que le serveur garde ouverte (/show qui la lit), ce que Windows refuse par-dessus un fichier ouvert", async () => {
    const { folder, confirmed, store } = setup();
    writeFileSync(join(confirmed, "Replay.mp4"), Buffer.alloc(4 * 1024 * 1024, 7));
    // Un flux ouvert et pas fini, comme celui d'un lecteur qui bufferise.
    const open = createReadStream(join(confirmed, "Replay.mp4"), { highWaterMark: 64 * 1024 });
    await new Promise((resolve) => open.once("readable", resolve));
    const plan = store.planReplace(folder, "Replay.mp4", "Replay.mp4");
    if (!plan) throw new Error("le plan manque");
    writeFileSync(plan.outputPath, "nouvelle vidéo");
    await store.commitReplace(folder, plan, { ...confirmation, start: 2, end: 4 });
    expect(readFileSync(join(confirmed, "Replay.mp4"), "utf8")).toBe("nouvelle vidéo");
    expect(existsSync(plan.outputPath)).toBe(false);
    // Le flux ouvert finit de lire l'ancienne vidéo, sans erreur.
    let total = 0;
    for await (const chunk of open) total += chunk.length;
    expect(total).toBe(4 * 1024 * 1024);
  });

  it("garde chaque ancienne version : la suivante prend « (2) », rien n'est écrasé dans Traités", async () => {
    const { folder, processed, store } = setup();
    for (const content of ["deuxième", "troisième"]) {
      const plan = store.planReplace(folder, "Replay.mp4", "Replay.mp4");
      if (!plan) throw new Error("le plan manque");
      writeFileSync(plan.outputPath, content);
      await store.commitReplace(folder, plan, confirmation);
    }
    expect(names(processed)).toEqual([
      "Replay (ancienne version) (2).mp4",
      "Replay (ancienne version).mp4",
      "Replay.mp4",
    ]);
    expect(readFileSync(join(processed, "Replay (ancienne version).mp4"), "utf8")).toBe("ancienne vidéo");
    expect(readFileSync(join(processed, "Replay (ancienne version) (2).mp4"), "utf8")).toBe("deuxième");
  });

  it("rend l'ancienne vidéo et l'ancien JSON quand le recodage n'a rien produit", async () => {
    const { folder, confirmed, processed, store } = setup();
    const plan = store.planReplace(folder, "Replay.mp4", "Replay.mp4");
    if (!plan) throw new Error("le plan manque");
    await expect(store.commitReplace(folder, plan, { ...confirmation, start: 2, end: 4 })).rejects.toThrow();
    expect(readFileSync(join(confirmed, "Replay.mp4"), "utf8")).toBe("ancienne vidéo");
    expect(getJson(join(confirmed, "Replay.json"))).toEqual(confirmation);
    expect(names(confirmed)).toEqual(["Replay.json", "Replay.mp4"]);
    expect(names(processed)).toEqual(["Replay.mp4"]);
  });
});

describe("retirer un clip confirmé de l'émission", () => {
  it("range la vidéo, son JSON et son chat dans Traités sous un nom libre, et le clip sort de la liste", async () => {
    const { folder, confirmed, processed, store } = setup();
    writeFileSync(join(confirmed, "Replay.chat.json"), '{"savedAt":1,"messages":[]}');
    expect(await store.withdraw(folder, "Replay.mp4")).toBe("Replay (2).mp4");
    expect(names(confirmed)).toEqual([]);
    expect(names(processed)).toEqual([
      "Replay (2).chat.json",
      "Replay (2).json",
      "Replay (2).mp4",
      "Replay.mp4",
    ]);
    expect(readFileSync(join(processed, "Replay (2).mp4"), "utf8")).toBe("ancienne vidéo");
    expect(readFileSync(join(processed, "Replay.mp4"), "utf8")).toBe("clip brut");
    expect(store.listConfirmed(folder)).toEqual([]);
  });

  it("retire aussi un clip dont le nom est libre dans Traités, sans chat", async () => {
    const { folder, confirmed, processed, store } = setup({ processedName: "Replay.mp4" });
    rmSync(join(processed, "Replay.mp4"));
    expect(await store.withdraw(folder, "Replay.mp4")).toBe("Replay.mp4");
    expect(names(confirmed)).toEqual([]);
    expect(names(processed)).toEqual(["Replay.json", "Replay.mp4"]);
  });

  it("retire une vidéo que le serveur garde ouverte", async () => {
    const { folder, confirmed, store } = setup();
    writeFileSync(join(confirmed, "Replay.mp4"), Buffer.alloc(2 * 1024 * 1024, 3));
    const open = createReadStream(join(confirmed, "Replay.mp4"), { highWaterMark: 64 * 1024 });
    await new Promise((resolve) => open.once("readable", resolve));
    expect(await store.withdraw(folder, "Replay.mp4")).toBe("Replay (2).mp4");
    open.destroy();
    expect(names(confirmed)).toEqual([]);
  });

  it("ne retire rien pour un clip qui n'existe pas ou qui n'est pas un nom de clip", async () => {
    const { folder, confirmed, store } = setup();
    expect(await store.withdraw(folder, "Absent.mp4")).toBeUndefined();
    expect(await store.withdraw(folder, "../Replay.mp4")).toBeUndefined();
    expect(names(confirmed)).toEqual(["Replay.json", "Replay.mp4"]);
  });

  it("remet ce qui était parti quand un déplacement échoue : le clip reste confirmé, entier", async () => {
    const { folder, confirmed, processed, store } = setup();
    // Un dossier au nom de la vidéo à venir : le JSON part, la vidéo ne peut pas le suivre.
    mkdirSync(join(processed, "Replay (2).mp4"));
    await expect(store.withdraw(folder, "Replay.mp4")).rejects.toThrow();
    expect(names(confirmed)).toEqual(["Replay.json", "Replay.mp4"]);
    expect(names(processed)).toEqual(["Replay (2).mp4", "Replay.mp4"]);
    expect(store.listConfirmed(folder)).toHaveLength(1);
  });
});

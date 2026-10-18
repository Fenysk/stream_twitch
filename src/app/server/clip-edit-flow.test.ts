import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { ClipConfirmationSchema } from "../../domain/clip.schema";
import { LAUGH_PHRASE } from "../../domain/show.rules";
import { CONFIRMED_FOLDER, createClipStore, PROCESSED_FOLDER } from "../../infra/clip.repository";
import { createClipLibrary, type TrimRequest } from "../../usecase/clip.usecase";
import { createClipAnalysis } from "../../usecase/clip-analysis.usecase";

const folders: string[] = [];

afterEach(() => {
  for (const folder of folders.splice(0)) rmSync(folder, { recursive: true, force: true });
});

const names = (folder: string): string[] => (existsSync(folder) ? readdirSync(folder).sort() : []);

// Le serveur câblé comme runtime.ts le fait pour l'émission, sur un vrai dossier jetable. ffmpeg est remplacé par un fichier qui dit
// de quel clip brut il vient : de quoi voir quel clip brut le recodage a lu.
const startStack = () => {
  const folder = mkdtempSync(join(tmpdir(), "clip-edit-flow-"));
  folders.push(folder);
  const trims: TrimRequest[] = [];
  const store = createClipStore(() => undefined);
  const probe = { probe: async () => 118.55 };
  const library = createClipLibrary({
    store,
    probe,
    analysis: createClipAnalysis({
      store,
      probe,
      levels: { listLevels: async () => undefined },
      log: () => undefined,
    }),
    encoder: {
      trim: async (request) => {
        trims.push(request);
        writeFileSync(request.outputPath, `recodé depuis « ${readFileSync(request.inputPath, "utf8")} »`);
        return { ok: true, encoder: "test" };
      },
    },
    clock: () => Date.UTC(2026, 9, 16, 10, 0, 0),
    log: () => undefined,
  });
  library.update({ showClipsFolder: folder });
  const confirmed = join(folder, CONFIRMED_FOLDER);
  const processed = join(folder, PROCESSED_FOLDER);
  return {
    folder,
    confirmed,
    processed,
    trims,
    library,
    // OBS dépose un clip brut du même nom que le précédent (le tampon se sauvegarde, et le nom d'OBS se répète ici pour le test).
    dropRaw: (content: string) => writeFileSync(join(folder, "Replay.mp4"), content),
    readConfirmation: (name: string) =>
      ClipConfirmationSchema.parse(JSON.parse(readFileSync(join(confirmed, name), "utf8"))),
  };
};

const choice = { title: "Un clip", phrase: "Une phrase", endPhrase: "Une fin", start: 10, end: 30 };

describe("modifier un clip validé, de la validation jusqu'au retrait de l'émission", () => {
  it("recode depuis le bon clip brut de Traités, même quand la validation l'y a renommé « (2) »", async () => {
    const stack = startStack();
    stack.dropRaw("premier clip brut");
    expect((await stack.library.confirm({ name: "Replay.mp4", ...choice, title: "Premier" })).ok).toBe(true);
    stack.dropRaw("second clip brut");
    expect((await stack.library.confirm({ name: "Replay.mp4", ...choice, title: "Second" })).ok).toBe(true);
    expect(names(stack.confirmed)).toEqual([
      "Replay (2).json",
      "Replay (2).mp4",
      "Replay.json",
      "Replay.mp4",
    ]);
    expect(names(stack.processed)).toEqual(["Replay (2).mp4", "Replay.mp4"]);
    expect(stack.readConfirmation("Replay (2).json")).toMatchObject({
      rawName: "Replay.mp4",
      processedName: "Replay (2).mp4",
    });

    stack.trims.length = 0;
    const revised = await stack.library.revise({
      name: "Replay (2).mp4",
      title: "Second, refait",
      phrase: "",
      endPhrase: "",
      start: 20,
      end: 60,
    });
    expect(revised).toEqual({ ok: true, value: { name: "Replay (2).mp4" } });
    expect(stack.trims).toHaveLength(1);
    expect(stack.trims[0]).toMatchObject({ start: 20, end: 60 });
    expect(stack.trims[0]?.inputPath).toBe(join(stack.processed, "Replay (2).mp4"));
    expect(readFileSync(join(stack.confirmed, "Replay (2).mp4"), "utf8")).toBe(
      "recodé depuis « second clip brut »",
    );
    expect(readFileSync(join(stack.confirmed, "Replay.mp4"), "utf8")).toBe(
      "recodé depuis « premier clip brut »",
    );
    expect(stack.readConfirmation("Replay (2).json")).toMatchObject({
      title: "Second, refait",
      phrase: "",
      endPhrase: "",
      start: 20,
      end: 60,
      processedName: "Replay (2).mp4",
      confirmedAt: "2026-10-16T10:00:00.000Z",
    });
    expect(names(stack.confirmed)).toEqual([
      "Replay (2).json",
      "Replay (2).mp4",
      "Replay.json",
      "Replay.mp4",
    ]);
    expect(names(stack.processed)).toEqual([
      "Replay (2) (ancienne version).mp4",
      "Replay (2).mp4",
      "Replay.mp4",
    ]);
  });

  it("change la version de la vidéo quand elle est recodée, pas quand seuls le titre ou les phrases changent", async () => {
    const stack = startStack();
    stack.dropRaw("clip brut");
    await stack.library.confirm({ name: "Replay.mp4", ...choice });
    const versionOf = async () => {
      const listed = await stack.library.list();
      return listed.ok ? listed.value.confirmed[0]?.version : undefined;
    };
    const first = await versionOf();
    await stack.library.revise({
      name: "Replay.mp4",
      ...choice,
      title: "Autre titre",
      phrase: "Autre phrase",
      endPhrase: "Autre fin",
    });
    expect(await versionOf()).toBe(first);
    expect(stack.readConfirmation("Replay.json")).toMatchObject({
      title: "Autre titre",
      phrase: "Autre phrase",
      endPhrase: "Autre fin",
    });
    expect(stack.trims).toHaveLength(1);

    await stack.library.revise({ name: "Replay.mp4", ...choice, end: 25 });
    expect(await versionOf()).not.toBe(first);
    expect(stack.trims).toHaveLength(2);
  });

  it("ne change que la phrase de fin sans recoder : ni nouvelle vidéo, ni nouvelle version, le reste du JSON tel quel", async () => {
    const stack = startStack();
    stack.dropRaw("clip brut");
    await stack.library.confirm({ name: "Replay.mp4", ...choice });
    const before = stack.readConfirmation("Replay.json");
    expect(before.endPhrase).toBe("Une fin");
    expect(stack.trims).toHaveLength(1);
    const revised = await stack.library.revise({ name: "Replay.mp4", ...choice, endPhrase: "" });
    expect(revised).toEqual({ ok: true, value: { name: "Replay.mp4" } });
    expect(stack.trims).toHaveLength(1);
    expect(stack.readConfirmation("Replay.json")).toEqual({ ...before, endPhrase: "" });
    expect(readFileSync(join(stack.confirmed, "Replay.mp4"), "utf8")).toBe("recodé depuis « clip brut »");
  });

  it("donne la phrase des rires comme phrase de fin à un clip d'avant, avec des rires, et l'écrit à son prochain Enregistrer", async () => {
    const stack = startStack();
    stack.dropRaw("clip brut");
    await stack.library.confirm({ name: "Replay.mp4", ...choice, laughs: [{ at: 12, sound: "abcd1234" }] });
    // Le JSON d'avant la phrase de fin : sans la clé `endPhrase`.
    const { endPhrase, ...legacy } = stack.readConfirmation("Replay.json");
    writeFileSync(join(stack.confirmed, "Replay.json"), JSON.stringify(legacy));
    const listed = await stack.library.list();
    expect(listed.ok && listed.value.confirmed[0]?.endPhrase).toBe(LAUGH_PHRASE);
    expect(stack.readConfirmation("Replay.json").endPhrase).toBeUndefined();

    const revised = await stack.library.revise({
      name: "Replay.mp4",
      ...choice,
      endPhrase: LAUGH_PHRASE,
      laughs: [{ at: 12, sound: "abcd1234" }],
    });
    expect(revised.ok).toBe(true);
    expect(stack.readConfirmation("Replay.json").endPhrase).toBe(LAUGH_PHRASE);
    expect(stack.trims).toHaveLength(1);
  });

  it("ne sert plus l'ancienne version d'une vidéo recodée, et laisse finir le flux déjà ouvert (le clip passe à l'antenne)", async () => {
    const stack = startStack();
    stack.dropRaw("clip brut");
    await stack.library.confirm({ name: "Replay.mp4", ...choice });
    const listed = await stack.library.list();
    const previousVersion = listed.ok ? listed.value.confirmed[0]?.version : undefined;
    const video = stack.library.getVideo("confirmed", "Replay.mp4", previousVersion);
    if (!video.ok) throw new Error("la vidéo manque");
    // Le flux de /show est ouvert : un morceau lu, le reste attend.
    const reader = video.value.read(0, video.value.size - 1).getReader();
    expect((await reader.read()).done).toBe(false);

    const revised = await stack.library.revise({ name: "Replay.mp4", ...choice, start: 11, end: 31 });
    expect(revised.ok).toBe(true);
    expect(readFileSync(join(stack.confirmed, "Replay.mp4"), "utf8")).toBe("recodé depuis « clip brut »");
    expect(stack.library.getVideo("confirmed", "Replay.mp4", previousVersion)).toEqual({
      ok: false,
      status: 404,
      message: "cette version du clip n'existe plus",
    });
    const next = await stack.library.list();
    expect(
      stack.library.getVideo("confirmed", "Replay.mp4", next.ok ? next.value.confirmed[0]?.version : "").ok,
    ).toBe(true);
    await reader.cancel();
  });

  it("garde le titre et les phrases modifiables quand le clip brut a disparu, et refuse un autre début ou une autre fin", async () => {
    const stack = startStack();
    stack.dropRaw("clip brut");
    await stack.library.confirm({ name: "Replay.mp4", ...choice });
    rmSync(join(stack.processed, "Replay.mp4"));
    const listed = await stack.library.list();
    expect(listed.ok && listed.value.confirmed[0]?.processedName).toBeNull();

    expect((await stack.library.revise({ name: "Replay.mp4", ...choice, title: "Toujours là" })).ok).toBe(
      true,
    );
    expect(stack.readConfirmation("Replay.json").title).toBe("Toujours là");
    const refused = await stack.library.revise({ name: "Replay.mp4", ...choice, start: 11 });
    expect(refused).toMatchObject({ ok: false, status: 409 });
  });

  it("retire le clip de l'émission : la vidéo, son JSON et son chat passent dans Traités, rien n'est supprimé", async () => {
    const stack = startStack();
    stack.dropRaw("clip brut");
    writeFileSync(join(stack.folder, "Replay.chat.json"), '{"savedAt":1,"messages":[]}');
    await stack.library.confirm({ name: "Replay.mp4", ...choice });
    expect(names(stack.confirmed)).toEqual(["Replay.chat.json", "Replay.json", "Replay.mp4"]);

    expect(await stack.library.withdraw("Replay.mp4")).toEqual({
      ok: true,
      value: { name: "Replay (2).mp4" },
    });
    expect(names(stack.confirmed)).toEqual([]);
    expect(names(stack.processed)).toEqual([
      "Replay (2).chat.json",
      "Replay (2).json",
      "Replay (2).mp4",
      "Replay.chat.json",
      "Replay.mp4",
    ]);
    const listed = await stack.library.list();
    expect(listed.ok && listed.value.confirmed).toEqual([]);
    expect(stack.library.getVideo("confirmed", "Replay.mp4").ok).toBe(false);
  });
});

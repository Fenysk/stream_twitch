import { describe, expect, it } from "vitest";
import {
  createFfmpegClient,
  type ProcessResult,
  type ProcessRunner,
  toLevels,
  toLevelsArgs,
  toTrimArgs,
} from "./ffmpeg.client";

const setup = (run: ProcessRunner) => {
  const logs: string[] = [];
  return { logs, client: createFfmpegClient(run, (line) => logs.push(line)) };
};

describe("la durée d'un fichier (ffprobe)", () => {
  it("lance ffprobe avec un tableau d'arguments, le chemin entier en dernier, et rend les secondes lues", async () => {
    const calls: { command: string; args: string[] }[] = [];
    const { client } = setup(async (command, args) => {
      calls.push({ command, args });
      return { code: 0, stdout: "118.550000\r\n", stderr: "" };
    });
    expect(await client.probe("C:\\Vidéos\\Clips OBS\\Replay 2026-10-15 15-09-05.mp4")).toBe(118.55);
    expect(calls).toHaveLength(1);
    expect(calls[0]?.command).toBe("ffprobe");
    expect(calls[0]?.args.at(-1)).toBe("C:\\Vidéos\\Clips OBS\\Replay 2026-10-15 15-09-05.mp4");
  });

  it("rend rien quand ffprobe échoue ou ne rend pas un nombre", async () => {
    const failed = setup(async () => ({ code: 1, stdout: "", stderr: "Invalid data" }));
    expect(await failed.client.probe("a.mp4")).toBeUndefined();
    const garbage = setup(async () => ({ code: 0, stdout: "N/A\n", stderr: "" }));
    expect(await garbage.client.probe("a.mp4")).toBeUndefined();
  });

  it("rend rien et journalise une fois quand ffprobe est introuvable", async () => {
    const { client, logs } = setup(async () => {
      throw new Error("ffprobe est introuvable (absent du PATH)");
    });
    expect(await client.probe("a.mp4")).toBeUndefined();
    expect(await client.probe("b.mp4")).toBeUndefined();
    expect(logs).toEqual(["ffprobe : ffprobe est introuvable (absent du PATH)"]);
  });
});

const request = {
  inputPath: "C:\\Clips OBS\\Replay 2026-10-15 15-09-05.mp4",
  outputPath: "C:\\Clips OBS\\Confirmés\\Replay 2026-10-15 15-09-05.partial",
  start: 12.5,
  end: 40,
};

const succeeded: ProcessResult = { code: 0, stdout: "", stderr: "" };

describe("les arguments du recodage", () => {
  const args = toTrimArgs(request, "h264_nvenc");

  it("coupent à l'image près : début avant l'entrée, durée gardée, une seule vidéo et le premier son s'il existe", () => {
    expect(args.slice(args.indexOf("-ss"), args.indexOf("-ss") + 4)).toEqual([
      "-ss",
      "12.500000",
      "-i",
      request.inputPath,
    ]);
    expect(args.slice(args.indexOf("-t"), args.indexOf("-t") + 2)).toEqual(["-t", "27.500000"]);
    expect(args).toContain("0:v:0");
    expect(args).toContain("0:a:0?");
  });

  it("égalisent le son (loudnorm, -16 LUFS), recodent en H.264 et AAC, et placent l'index du MP4 au début", () => {
    expect(args[args.indexOf("-af") + 1]).toBe("loudnorm=I=-16:TP=-1.5:LRA=11");
    expect(args[args.indexOf("-c:v") + 1]).toBe("h264_nvenc");
    expect(args[args.indexOf("-c:a") + 1]).toBe("aac");
    expect(args.slice(args.indexOf("-movflags"), args.indexOf("-movflags") + 2)).toEqual([
      "-movflags",
      "+faststart",
    ]);
  });

  it("écrivent un MP4 dans le fichier partiel, dont l'extension ne dit rien du format, en dernier argument", () => {
    expect(args.slice(-3)).toEqual(["-f", "mp4", request.outputPath]);
  });

  it("changent seulement l'encodeur vidéo pour le repli x264", () => {
    const fallback = toTrimArgs(request, "libx264");
    expect(fallback[fallback.indexOf("-c:v") + 1]).toBe("libx264");
    expect(fallback).not.toContain("h264_nvenc");
    expect(fallback[fallback.indexOf("-af") + 1]).toBe("loudnorm=I=-16:TP=-1.5:LRA=11");
  });
});

describe("le recodage d'un clip (ffmpeg)", () => {
  it("recode avec h264_nvenc quand il marche, sans rien tenter d'autre", async () => {
    const calls: string[][] = [];
    const { client } = setup(async (command, commandArgs) => {
      calls.push([command, ...commandArgs]);
      return succeeded;
    });
    expect(await client.trim(request)).toEqual({ ok: true, encoder: "h264_nvenc" });
    expect(calls).toHaveLength(1);
    expect(calls[0]?.[0]).toBe("ffmpeg");
  });

  it("se replie sur libx264 quand l'encodeur du GPU échoue, et le dit dans le journal", async () => {
    const encoders: string[] = [];
    const { client, logs } = setup(async (_command, commandArgs) => {
      const encoder = commandArgs[commandArgs.indexOf("-c:v") + 1] ?? "";
      encoders.push(encoder);
      return encoder === "h264_nvenc"
        ? { code: 1, stdout: "", stderr: "Cannot load nvcuda.dll\nError initializing output stream" }
        : succeeded;
    });
    expect(await client.trim(request)).toEqual({ ok: true, encoder: "libx264" });
    expect(encoders).toEqual(["h264_nvenc", "libx264"]);
    expect(logs.join("\n")).toContain("h264_nvenc a échoué");
  });

  it("rend l'échec de libx264 avec la fin de la sortie d'erreur de ffmpeg, quand les deux encodeurs échouent", async () => {
    const { client } = setup(async () => ({
      code: 1,
      stdout: "",
      stderr: "début\nNo space left on device\n",
    }));
    const result = await client.trim(request);
    expect(result).toEqual({
      ok: false,
      message: "ffmpeg a échoué (code 1) : début No space left on device",
    });
  });

  it("rend l'échec sans repli quand ffmpeg ne démarre pas ou dépasse son temps", async () => {
    let calls = 0;
    const { client } = setup(async () => {
      calls += 1;
      throw new Error("ffmpeg est introuvable (absent du PATH)");
    });
    expect(await client.trim(request)).toEqual({
      ok: false,
      message: "ffmpeg est introuvable (absent du PATH)",
    });
    expect(calls).toBe(1);
  });
});

describe("la mesure du son d'un clip (ffmpeg)", () => {
  const STDOUT = [
    "frame:0    pts:0       pts_time:0",
    "lavfi.astats.Overall.Peak_level=-58.713062",
    "frame:1    pts:2400    pts_time:0.05",
    "lavfi.astats.Overall.Peak_level=-1.568634",
    "frame:2    pts:4800    pts_time:0.1",
    "lavfi.astats.Overall.Peak_level=-inf",
    "",
  ].join("\r\n");

  it("mesure le pic de chaque fenêtre de 50 ms sur le premier son, sans vidéo, chemin entier en argument séparé", () => {
    const args = toLevelsArgs("C:\\Clips OBS\\Confirmés\\Le saut.mp4");
    expect(args).toContain("C:\\Clips OBS\\Confirmés\\Le saut.mp4");
    expect(args).toContain("-vn");
    const filter = args[args.indexOf("-af") + 1] ?? "";
    expect(filter).toContain("aresample=48000");
    expect(filter).toContain("asetnsamples=n=2400");
    expect(filter).toContain("lavfi.astats.Overall.Peak_level");
  });

  it("lit les levels dans l'ordre, et le silence numérique vaut -100 dB", () => {
    expect(toLevels(STDOUT)).toEqual([-58.713062, -1.568634, -100]);
  });

  it("ne trouve aucun level dans une sortie vide ou illisible", () => {
    expect(toLevels("")).toEqual([]);
    expect(toLevels("rien d'utile")).toEqual([]);
  });

  it("rend les levels que ffmpeg a écrits, et demande à garder toute sa sortie", async () => {
    const calls: { command: string; keepChars: number | undefined }[] = [];
    const { client } = setup(async (command, _args, _limitMs, keepChars) => {
      calls.push({ command, keepChars });
      return { code: 0, stdout: STDOUT, stderr: "" };
    });
    expect(await client.listLevels("a.mp4")).toEqual([-58.713062, -1.568634, -100]);
    expect(calls[0]?.command).toBe("ffmpeg");
    expect(calls[0]?.keepChars).toBeGreaterThan(1_000_000);
  });

  it("rend rien et le journalise une fois quand ffmpeg échoue ou est introuvable", async () => {
    const failed = setup(async () => ({ code: 1, stdout: "", stderr: "Invalid data found" }));
    expect(await failed.client.listLevels("a.mp4")).toBeUndefined();
    expect(await failed.client.listLevels("a.mp4")).toBeUndefined();
    expect(failed.logs).toHaveLength(1);
    expect(failed.logs[0]).toContain("Invalid data found");
    const missing = setup(async () => {
      throw new Error("ffmpeg est introuvable (absent du PATH)");
    });
    expect(await missing.client.listLevels("b.mp4")).toBeUndefined();
    expect(missing.logs).toEqual([
      "ffmpeg : le son de « b.mp4 » n'a pas pu être mesuré, ffmpeg est introuvable (absent du PATH)",
    ]);
  });
});

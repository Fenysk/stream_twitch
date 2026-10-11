import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { getHeadFiles } from "./head-files.repository";

const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47];
const folders: string[] = [];

const createFolder = (): string => {
  const folder = mkdtempSync(join(tmpdir(), "head-files-"));
  folders.push(folder);
  return folder;
};

afterEach(() => {
  for (const folder of folders.splice(0)) rmSync(folder, { recursive: true, force: true });
});

describe("getHeadFiles", () => {
  it("lit la tête livrée dans tete-south-park/ : une tête et deux images PNG", () => {
    const { head, images } = getHeadFiles("tete-south-park");
    expect(head.poses.length).toBeGreaterThanOrEqual(2);
    expect(Array.from(images.top.slice(0, 4))).toEqual(PNG_SIGNATURE);
    expect(Array.from(images.bottom.slice(0, 4))).toEqual(PNG_SIGNATURE);
  });

  it("refuse un tete.json qui n'est pas du JSON", () => {
    const folder = createFolder();
    writeFileSync(join(folder, "tete.json"), "{ pas du json");
    expect(() => getHeadFiles(folder)).toThrow("n'est pas du JSON valide");
  });

  it("refuse un tete.json qui ne suit pas le format de l'outil, en nommant le champ fautif", () => {
    const folder = createFolder();
    writeFileSync(join(folder, "tete.json"), JSON.stringify({ format: "tete-south-park/1" }));
    expect(() => getHeadFiles(folder)).toThrow(/tete\.json invalide : image/);
  });
});

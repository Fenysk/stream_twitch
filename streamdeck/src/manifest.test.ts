import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  CYCLE_ACTION_UUID,
  END_LATER_ACTION_UUID,
  END_SOONER_ACTION_UUID,
  PHRASE_ACTION_UUID,
  PICTURE_ACTION_UUID,
  PRESET_ACTION_UUID,
  TOGGLE_ACTION_UUID,
} from "./action-ids";
import { VIEWERS_ACTION_UUID } from "./viewers-action";

const PLUGIN_FOLDER = join(import.meta.dirname, "..", "com.fenysk.stream-twitch.sdPlugin");

// Le manifest est écrit en PascalCase (c'est le format du Stream Deck) : il se lit par le nom de ses champs, jamais par des propriétés.
const manifest: unknown = JSON.parse(readFileSync(join(PLUGIN_FOLDER, "manifest.json"), "utf8"));

const read = (record: unknown, key: string): unknown =>
  typeof record === "object" && record !== null ? Reflect.get(record, key) : undefined;

const readText = (record: unknown, key: string): string => {
  const value = read(record, key);
  return typeof value === "string" ? value : "";
};

const readList = (record: unknown, key: string): unknown[] => {
  const value = read(record, key);
  return Array.isArray(value) ? value : [];
};

const actions = readList(manifest, "Actions");
const findAction = (uuid: string): unknown => actions.find((action) => readText(action, "UUID") === uuid);

// Le Stream Deck cherche une image sans extension en .svg, puis en .png (et .png en @2x).
const hasImage = (path: string): boolean =>
  path !== "" &&
  [".svg", ".png", "@2x.png"].some((suffix) => existsSync(join(PLUGIN_FOLDER, `${path}${suffix}`)));

describe("le manifest du plugin", () => {
  it("garde les règles du plugin : Node 20 seul, une icône de plugin et une icône de catégorie qui existent", () => {
    expect(readText(read(manifest, "Nodejs"), "Version")).toBe("20");
    expect(hasImage(readText(manifest, "CategoryIcon"))).toBe(true);
    expect(hasImage(readText(manifest, "Icon"))).toBe(true);
  });

  it("déclare chaque action du plugin une seule fois, et seulement elles", () => {
    const declared = actions.map((action) => readText(action, "UUID")).sort();
    const known = [
      VIEWERS_ACTION_UUID,
      TOGGLE_ACTION_UUID,
      CYCLE_ACTION_UUID,
      PRESET_ACTION_UUID,
      PHRASE_ACTION_UUID,
      END_LATER_ACTION_UUID,
      END_SOONER_ACTION_UUID,
      PICTURE_ACTION_UUID,
    ].sort();
    expect(declared).toEqual(known);
    expect(new Set(declared).size).toBe(declared.length);
  });

  it("donne à chaque action un nom, une info-bulle, une touche de clavier et des images qui existent", () => {
    for (const action of actions) {
      const uuid = readText(action, "UUID");
      expect(uuid.startsWith(`${readText(manifest, "UUID")}.`), uuid).toBe(true);
      expect(readText(action, "Name"), uuid).not.toBe("");
      expect(readText(action, "Tooltip"), uuid).not.toBe("");
      expect(readList(action, "Controllers"), uuid).toEqual(["Keypad"]);
      expect(hasImage(readText(action, "Icon")), `${uuid} : icône`).toBe(true);
      for (const state of readList(action, "States")) {
        expect(hasImage(readText(state, "Image")), `${uuid} : image de touche`).toBe(true);
      }
    }
  });

  it("déclare la touche « Image » : une image, aucun inspecteur", () => {
    const picture = findAction(PICTURE_ACTION_UUID);
    expect(readText(picture, "Name")).toBe("Image");
    expect(readList(picture, "States")).toHaveLength(1);
    expect(read(picture, "PropertyInspectorPath")).toBeUndefined();
  });
});

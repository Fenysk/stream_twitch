import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { TwitchToken } from "../domain/twitch.schema";
import { createTwitchTokenStore } from "./twitch-token.repository";

const token: TwitchToken = {
  accessToken: "ACCESS-SECRET",
  refreshToken: "REFRESH-SECRET",
  expiresAt: 1_700_000_000_000,
  login: "fenysk",
  userId: "68710381",
  scope: "moderator:read:followers",
};

let directory = "";
let path = "";
let logs: string[] = [];

beforeEach(() => {
  directory = mkdtempSync(join(tmpdir(), "twitch-token-"));
  path = join(directory, "data", "twitch-token.json");
  logs = [];
});

afterEach(() => {
  rmSync(directory, { recursive: true, force: true });
});

const create = () => createTwitchTokenStore(path, (line) => logs.push(line));

describe("createTwitchTokenStore : data/twitch-token.json", () => {
  it("n'a pas de jeton tant que le fichier n'existe pas, et ne dit rien", () => {
    expect(create().get()).toBeNull();
    expect(logs).toEqual([]);
  });

  it("garde un jeton et le relit à l'identique, en créant le dossier", () => {
    const store = create();
    store.update(token);
    expect(store.get()).toEqual(token);
    expect(create().get()).toEqual(token);
  });

  it("écrit un JSON à plat, deux espaces et un retour final : ce que Biome laisse tel quel", () => {
    create().update(token);
    expect(readFileSync(path, "utf8")).toBe(`${JSON.stringify(token, null, 2)}\n`);
    for (const value of Object.values(JSON.parse(readFileSync(path, "utf8")))) {
      expect(Array.isArray(value)).toBe(false);
      expect(typeof value === "object").toBe(false);
    }
  });

  it("remplace le jeton à chaque renouvellement, sans laisser de fichier temporaire", () => {
    const store = create();
    store.update(token);
    store.update({ ...token, accessToken: "ACCESS-2", expiresAt: 1_700_000_999_000 });
    expect(store.get()?.accessToken).toBe("ACCESS-2");
    expect(readdirSync(join(directory, "data"))).toEqual(["twitch-token.json"]);
  });

  it("efface le fichier, et n'échoue pas quand il n'existe pas", () => {
    const store = create();
    store.update(token);
    store.delete();
    expect(existsSync(path)).toBe(false);
    expect(store.get()).toBeNull();
    expect(() => store.delete()).not.toThrow();
  });

  it("ignore un fichier qui n'est pas du JSON, le dit, et n'en écrit pas le contenu", () => {
    const store = create();
    store.update(token);
    writeFileSync(path, "ACCESS-SECRET pas du json");
    expect(store.get()).toBeNull();
    expect(logs).toHaveLength(1);
    expect(logs[0]).toContain("ce n'est pas du JSON");
    expect(logs.join("\n")).not.toContain("ACCESS-SECRET");
  });

  it("ignore un fichier incomplet, le dit, et n'en écrit pas les valeurs", () => {
    const store = create();
    store.update(token);
    writeFileSync(path, JSON.stringify({ accessToken: "ACCESS-SECRET" }));
    expect(store.get()).toBeNull();
    expect(logs[0]).toContain("incomplet");
    expect(logs.join("\n")).not.toContain("ACCESS-SECRET");
  });
});

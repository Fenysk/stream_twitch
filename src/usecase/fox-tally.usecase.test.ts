import { describe, expect, it } from "vitest";
import type { RawMessage } from "../domain/chat.types";
import { type Counted, createFoxTally } from "./fox-tally.usecase";

const message = (viewerId: string, nickname: string, text = "Bonjour"): RawMessage => ({
  id: `${viewerId}-${text}`,
  viewerId,
  viewerLogin: nickname.toLowerCase(),
  nickname,
  color: null,
  text,
  emotes: [],
  isCommand: false,
});

describe("createFoxTally : le compte des messages acceptés de chaque viewer", () => {
  it("compte un de plus à chaque message d'un viewer, et donne le compte aux abonnés", () => {
    const tally = createFoxTally();
    const heard: Counted[] = [];
    tally.subscribe((counted) => heard.push(counted));
    tally.noteMessage(message("v1", "Alice"));
    tally.noteMessage(message("v1", "Alice"));
    tally.noteMessage(message("v1", "Alice"));
    expect(heard.map(({ messages }) => messages)).toEqual([1, 2, 3]);
    expect(heard[2]).toEqual({ viewerId: "v1", nickname: "Alice", messages: 3 });
  });

  it("tient un compte par viewer : les messages des uns ne comptent pas pour les autres", () => {
    const tally = createFoxTally();
    const heard: Counted[] = [];
    tally.subscribe((counted) => heard.push(counted));
    tally.noteMessage(message("v1", "Alice"));
    tally.noteMessage(message("v2", "Bob"));
    tally.noteMessage(message("v1", "Alice"));
    expect(heard.map(({ viewerId, messages }) => [viewerId, messages])).toEqual([
      ["v1", 1],
      ["v2", 1],
      ["v1", 2],
    ]);
  });

  it("retient le nickname le plus récent du viewer", () => {
    const tally = createFoxTally();
    const heard: Counted[] = [];
    tally.subscribe((counted) => heard.push(counted));
    tally.noteMessage(message("v1", "alice"));
    tally.noteMessage(message("v1", "Alice"));
    expect(heard.at(-1)?.nickname).toBe("Alice");
  });

  it("ne garde jamais le texte d'un message : seul le compte part aux abonnés", () => {
    const tally = createFoxTally();
    const heard: Counted[] = [];
    tally.subscribe((counted) => heard.push(counted));
    tally.noteMessage(message("v1", "Alice", "un secret"));
    expect(JSON.stringify(heard)).not.toContain("secret");
    expect(Object.keys(heard[0] ?? {}).sort()).toEqual(["messages", "nickname", "viewerId"]);
  });

  it("compte sans abonné, et n'avertit plus un abonné qui s'est désabonné", () => {
    const tally = createFoxTally();
    tally.noteMessage(message("v1", "Alice"));
    const heard: Counted[] = [];
    const unsubscribe = tally.subscribe((counted) => heard.push(counted));
    tally.noteMessage(message("v1", "Alice"));
    unsubscribe();
    tally.noteMessage(message("v1", "Alice"));
    expect(heard.map(({ messages }) => messages)).toEqual([2]);
  });
});

describe("createFoxTally : la liste des viewers", () => {
  it("rend les viewers dans l'ordre de leur premier message accepté, avec leur compte", () => {
    const tally = createFoxTally();
    tally.noteMessage(message("v2", "Bob"));
    tally.noteMessage(message("v1", "Alice"));
    tally.noteMessage(message("v2", "Bob"));
    expect(tally.list()).toEqual([
      { viewerId: "v2", nickname: "Bob", messages: 2 },
      { viewerId: "v1", nickname: "Alice", messages: 1 },
    ]);
  });

  it("est vide avant tout message, et chaque liste est une photo : un message de plus ne la change pas", () => {
    const tally = createFoxTally();
    expect(tally.list()).toEqual([]);
    tally.noteMessage(message("v1", "Alice"));
    const photo = tally.list();
    tally.noteMessage(message("v2", "Bob"));
    expect(photo).toHaveLength(1);
    expect(tally.list()).toHaveLength(2);
  });
});

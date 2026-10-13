import { describe, expect, it } from "vitest";
import {
  EMOTE_PROVIDERS,
  EmoteListsSchema,
  StoredEmotesSchema,
  toEmoteCount,
  toEmoteNames,
  toEmptyLists,
  toKnownEmoteNames,
  toStoredEmotes,
  toStoredText,
} from "./emote-sync.rules";

// Des réponses de la forme que les services rendent, réduites à quelques emotes. Écrites en JSON, comme elles arrivent :
// 7TV et FFZ nomment leurs clés en snake_case (`emote_set`, `default_sets`).
const fromJson = (text: string): unknown => JSON.parse(text);

const sevenTvGlobal = fromJson(`{
  "id": "62cdd34e72a832540de95857",
  "name": "Global Emotes",
  "emote_count": 2,
  "emotes": [{ "id": "01", "name": "EZ", "flags": 0 }, { "id": "02", "name": "Clap", "flags": 0 }]
}`);
const sevenTvUser = fromJson(`{
  "id": "user",
  "platform": "TWITCH",
  "emote_set": { "id": "set", "name": "fenysk", "emotes": [{ "id": "03", "name": "FenyHype" }] }
}`);
const betterTtvGlobal = [
  { id: "a", code: ":tf:", imageType: "png", animated: false },
  { id: "b", code: "CiGrip", imageType: "png", animated: false },
];
const betterTtvChannel = {
  id: "68710381",
  channelEmotes: [{ id: "c", code: "FenyWave", imageType: "png" }],
  sharedEmotes: [{ id: "d", code: "monkaS", imageType: "png", user: { name: "x" } }],
};
const ffzSets = `{
  "3": { "id": 3, "emoticons": [{ "id": 1, "name": "ZreknarF" }, { "id": 2, "name": "LaterSooner" }] },
  "4": { "id": 4, "emoticons": [{ "id": 3, "name": "NotDefault" }] }
}`;
const ffzGlobal = fromJson(`{ "default_sets": [3], "sets": ${ffzSets} }`);
const ffzRoom = fromJson(`{
  "room": { "id": "fenysk", "twitch_id": 68710381, "set": 99 },
  "sets": { "99": { "id": 99, "emoticons": [{ "id": 5, "name": "FenyFFZ" }] } }
}`);

describe("toEmoteNames : les noms d'une réponse de chaque service", () => {
  it("lit les emotes globales de 7TV", () => {
    expect(toEmoteNames("7tv", "global", sevenTvGlobal)).toEqual(["EZ", "Clap"]);
  });

  it("lit l'ensemble d'emotes de la chaîne sur 7TV, et rend une liste vide quand l'utilisateur n'en a pas", () => {
    expect(toEmoteNames("7tv", "channel", sevenTvUser)).toEqual(["FenyHype"]);
    expect(toEmoteNames("7tv", "channel", fromJson('{ "id": "user", "emote_set": null }'))).toEqual([]);
    expect(toEmoteNames("7tv", "channel", { id: "user" })).toEqual([]);
    expect(toEmoteNames("7tv", "global", { id: "set", emotes: null })).toEqual([]);
  });

  it("refuse un ensemble d'emotes de la chaîne qui n'a pas la forme de 7TV", () => {
    expect(toEmoteNames("7tv", "channel", fromJson('{ "emote_set": { "emotes": "aucune" } }'))).toBeNull();
  });

  it("lit les codes des emotes globales de BTTV", () => {
    expect(toEmoteNames("bttv", "global", betterTtvGlobal)).toEqual([":tf:", "CiGrip"]);
  });

  it("lit les emotes de la chaîne sur BTTV : les siennes, puis les partagées", () => {
    expect(toEmoteNames("bttv", "channel", betterTtvChannel)).toEqual(["FenyWave", "monkaS"]);
    expect(toEmoteNames("bttv", "channel", { id: "x", channelEmotes: [], sharedEmotes: null })).toEqual([]);
  });

  it("lit les emotes globales de FFZ : seuls les ensembles de default_sets", () => {
    expect(toEmoteNames("ffz", "global", ffzGlobal)).toEqual(["ZreknarF", "LaterSooner"]);
  });

  it("lit les emotes de la chaîne sur FFZ : tous les ensembles de la réponse", () => {
    expect(toEmoteNames("ffz", "channel", ffzRoom)).toEqual(["FenyFFZ"]);
  });

  it("rend null quand la réponse n'a pas la forme du service : liste, texte, null, autre service", () => {
    for (const provider of EMOTE_PROVIDERS) {
      for (const scope of ["global", "channel"] as const) {
        expect(toEmoteNames(provider, scope, null), `${provider} ${scope}`).toBeNull();
        expect(toEmoteNames(provider, scope, "<html>"), `${provider} ${scope}`).toBeNull();
      }
    }
    expect(toEmoteNames("bttv", "global", sevenTvGlobal)).toBeNull();
    expect(toEmoteNames("ffz", "global", betterTtvGlobal)).toBeNull();
    expect(toEmoteNames("ffz", "global", fromJson('{ "default_sets": [3] }'))).toBeNull();
    expect(toEmoteNames("ffz", "global", fromJson(`{ "sets": ${ffzSets} }`))).toBeNull();
    expect(toEmoteNames("7tv", "global", { emotes: [{ name: 3 }] })).toBeNull();
  });

  it("ignore un ensemble par défaut que la réponse ne donne pas", () => {
    const answer = fromJson(`{ "default_sets": [3, 5], "sets": ${ffzSets} }`);
    expect(toEmoteNames("ffz", "global", answer)).toEqual(["ZreknarF", "LaterSooner"]);
  });
});

describe("toKnownEmoteNames : la liste que le filtre utilise", () => {
  const lists = {
    ...toEmptyLists(),
    "7tv": { global: ["EZ", "Clap"], channel: ["FenyHype"] },
    bttv: { global: ["Clap", "monkaS"], channel: [] },
  };

  it("réunit les trois services et les ajouts à la main, chaque nom une seule fois", () => {
    expect(toKnownEmoteNames(lists, ["KEKW", "EZ"])).toEqual(["EZ", "Clap", "FenyHype", "monkaS", "KEKW"]);
  });

  it("garde les ajouts à la main quand rien n'est synchronisé", () => {
    expect(toKnownEmoteNames(toEmptyLists(), ["KEKW"])).toEqual(["KEKW"]);
    expect(toKnownEmoteNames(toEmptyLists(), [])).toEqual([]);
  });

  it("compte les emotes d'un service, globales et chaîne ensemble, un nom en double une fois", () => {
    expect(toEmoteCount(lists, "7tv")).toBe(3);
    expect(toEmoteCount(lists, "bttv")).toBe(2);
    expect(toEmoteCount(lists, "ffz")).toBe(0);
    expect(toEmoteCount({ ...lists, ffz: { global: ["A"], channel: ["A", "B"] } }, "ffz")).toBe(2);
  });
});

describe("ce que le serveur garde entre deux démarrages", () => {
  it("relit ce qu'il écrit, listes vides comprises", () => {
    expect(StoredEmotesSchema.safeParse({ savedAt: 1, lists: toEmptyLists() }).success).toBe(true);
    expect(EmoteListsSchema.safeParse(toEmptyLists()).success).toBe(true);
  });

  it("refuse un fichier qui n'a pas la forme : un service manquant, un nom vide, une date absente", () => {
    expect(
      StoredEmotesSchema.safeParse({ savedAt: 1, lists: { "7tv": { global: [], channel: [] } } }).success,
    ).toBe(false);
    expect(
      StoredEmotesSchema.safeParse({
        savedAt: 1,
        lists: { ...toEmptyLists(), ffz: { global: [""], channel: [] } },
      }).success,
    ).toBe(false);
    expect(StoredEmotesSchema.safeParse({ lists: toEmptyLists() }).success).toBe(false);
  });
});

describe("le cache en texte : une ligne par liste", () => {
  const lists = {
    "7tv": { global: ["EZ", "Clap"], channel: ["FenyHype"] },
    bttv: { global: [":tf:", "monkaS", "(ditto)"], channel: [] },
    ffz: { global: ["ZreknarF"], channel: ["Fény", "O_o"] },
  };
  const stored = { savedAt: 1791852675582, lists };

  it("écrit la date, puis les six listes dans l'ordre des services et des listes", () => {
    expect(toStoredText(stored)).toBe(
      [
        "savedAt: 1791852675582",
        "7tv global: EZ Clap",
        "7tv channel: FenyHype",
        "bttv global: :tf: monkaS (ditto)",
        "bttv channel:",
        "ffz global: ZreknarF",
        "ffz channel: Fény O_o",
        "",
      ].join("\n"),
    );
  });

  it("relit ce qu'il a écrit, noms avec deux-points, parenthèses et accents compris", () => {
    expect(toStoredEmotes(toStoredText(stored))).toEqual(stored);
    expect(toStoredEmotes(toStoredText({ savedAt: 5, lists: toEmptyLists() }))).toEqual({
      savedAt: 5,
      lists: toEmptyLists(),
    });
  });

  it("n'écrit pas un nom qui a un espace : le tchat se coupe aux espaces, il ne serait jamais reconnu", () => {
    const text = toStoredText({
      savedAt: 1,
      lists: { ...toEmptyLists(), ffz: { global: ["A B", "C"], channel: [] } },
    });
    expect(text).toContain("ffz global: C\n");
    expect(toStoredEmotes(text)?.lists.ffz.global).toEqual(["C"]);
  });

  it("lit un fichier avec un BOM, des fins de ligne Windows, des espaces en trop et des lignes en plus", () => {
    const text = `${String.fromCharCode(0xfeff)}${toStoredText(stored).replaceAll("\n", "\r\n")}\r\nune ligne sans rien\r\n`;
    expect(toStoredEmotes(text)).toEqual(stored);
    expect(
      toStoredEmotes(toStoredText(stored).replace("7tv global: EZ Clap", "7tv   global :   EZ   Clap  ")),
    ).toEqual(stored);
  });

  it("rend null pour un texte qui n'est pas ce que le serveur écrit", () => {
    expect(toStoredEmotes("")).toBeNull();
    expect(toStoredEmotes("pas une liste")).toBeNull();
    expect(
      toStoredEmotes(toStoredText(stored).replace("savedAt: 1791852675582", "savedAt: hier")),
    ).toBeNull();
    expect(toStoredEmotes(toStoredText(stored).replace("savedAt: 1791852675582\n", ""))).toBeNull();
    expect(toStoredEmotes(toStoredText(stored).replace("ffz channel: Fény O_o\n", ""))).toBeNull();
  });
});

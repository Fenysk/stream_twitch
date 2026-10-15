import { describe, expect, it } from "vitest";
import { isFillable, toFilledPhrase } from "./phrase.rules";
import { REWARD_PHRASE_VARIABLES, TEST_NICKNAME, toPhraseIssues } from "./reward-phrase.rules";
import { RewardPhrasesFileSchema, RewardPhrasesInputSchema } from "./reward-phrase.schema";

describe("toPhraseIssues : les variables d'une phrase de récompense", () => {
  it("accepte {user}, seule variable donnée par un rachat, et les phrases sans variable", () => {
    expect(REWARD_PHRASE_VARIABLES).toEqual(["user"]);
    expect(toPhraseIssues(["Bois un coup de la part de {user} !", "Étire-toi.", "{user} {user}"])).toEqual(
      [],
    );
  });

  it("refuse une variable qu'un rachat ne donne pas, une seule fois même écrite deux fois", () => {
    expect(toPhraseIssues(["{user} offre à {recipient}", "{recipient} aussi", "{viewers} gens"])).toEqual([
      "la variable {recipient} n'existe pas ici : seule {user} est permise",
      "la variable {viewers} n'existe pas ici : seule {user} est permise",
    ]);
  });

  it("n'a rien à dire d'une liste vide", () => {
    expect(toPhraseIssues([])).toEqual([]);
  });

  it("donne à « Tester » le nickname de Fenysk à la place de {user}", () => {
    const values = { user: TEST_NICKNAME };
    expect(isFillable("Bois un coup de la part de {user} !", values)).toBe(true);
    expect(toFilledPhrase("Bois un coup de la part de {user} !", values)).toBe(
      "Bois un coup de la part de Fenysk !",
    );
  });
});

describe("le fichier des phrases des récompenses", () => {
  it("lit les phrases de chaque récompense avec son dernier titre", () => {
    const file = { "reward-1": { title: "À boire !", phrases: ["Bois un coup de la part de {user} !"] } };
    expect(RewardPhrasesFileSchema.parse(file)).toEqual(file);
  });

  it("refuse une récompense sans phrase, ou une phrase vide : le fichier ne garde que ce qui se dit", () => {
    expect(
      RewardPhrasesFileSchema.safeParse({ "reward-1": { title: "À boire !", phrases: [] } }).success,
    ).toBe(false);
    expect(
      RewardPhrasesFileSchema.safeParse({ "reward-1": { title: "À boire !", phrases: [""] } }).success,
    ).toBe(false);
  });

  it("demande une liste de textes à l'interface, vide permise", () => {
    expect(RewardPhrasesInputSchema.safeParse({ phrases: [] }).success).toBe(true);
    expect(RewardPhrasesInputSchema.safeParse({ phrases: ["A", "B"] }).success).toBe(true);
    expect(RewardPhrasesInputSchema.safeParse({ phrases: "A" }).success).toBe(false);
    expect(RewardPhrasesInputSchema.safeParse({ phrases: [1] }).success).toBe(false);
    expect(RewardPhrasesInputSchema.safeParse({}).success).toBe(false);
  });
});

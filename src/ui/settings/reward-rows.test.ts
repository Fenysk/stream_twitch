import { describe, expect, it } from "vitest";
import type { RewardSummary } from "../../domain/reward.schema";
import type { RewardPhrasesEntry } from "../../domain/reward-phrase.schema";
import { toRewardRows } from "./reward-rows";

const reward = (id: string, title: string, overrides: Partial<RewardSummary> = {}): RewardSummary => ({
  id,
  title,
  cost: 100,
  pace: 30,
  isManaged: true,
  isMissing: false,
  sound: null,
  ...overrides,
});

const entry = (
  id: string,
  title: string,
  overrides: Partial<RewardPhrasesEntry> = {},
): RewardPhrasesEntry => ({
  id,
  title,
  isMissing: false,
  isReserved: false,
  phrases: [],
  ...overrides,
});

describe("toRewardRows : les lignes de l'onglet Points de chaîne", () => {
  it("joint chaque récompense à ses phrases par son identifiant, dans l'ordre des récompenses", () => {
    const rows = toRewardRows(
      [reward("a", "A"), reward("b", "B")],
      [entry("b", "B", { phrases: ["Salut {user}"] }), entry("a", "A")],
    );
    expect(rows.map(({ reward: row }) => row.id)).toEqual(["a", "b"]);
    expect(rows[0]?.phrases?.id).toBe("a");
    expect(rows[1]?.phrases?.phrases).toEqual(["Salut {user}"]);
  });

  it("laisse les phrases à null quand la liste des phrases n'est pas lue, ou que la récompense n'en a pas d'entrée", () => {
    expect(toRewardRows([reward("a", "A")], null)).toEqual([{ reward: reward("a", "A"), phrases: null }]);
    expect(toRewardRows([reward("a", "A")], [entry("autre", "Autre")])).toEqual([
      { reward: reward("a", "A"), phrases: null },
    ]);
  });

  it("garde à la fin la récompense disparue de Twitch qui n'a gardé que ses phrases, comme une récompense qui n'existe plus", () => {
    const gone = entry("gone", "Hydrate-toi", { isMissing: true, phrases: ["Un verre ?"] });
    const rows = toRewardRows([reward("a", "A")], [gone, entry("a", "A")]);
    expect(rows).toHaveLength(2);
    expect(rows[1]).toEqual({
      reward: {
        id: "gone",
        title: "Hydrate-toi",
        cost: 0,
        pace: 0,
        isManaged: false,
        isMissing: true,
        sound: null,
      },
      phrases: gone,
    });
  });

  it("ne double pas une récompense disparue qui a déjà sa ligne par son enregistrement", () => {
    const rows = toRewardRows(
      [reward("a", "A", { isMissing: true, cost: 0, pace: 0 })],
      [entry("a", "A", { isMissing: true, phrases: ["Salut"] })],
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]?.phrases?.phrases).toEqual(["Salut"]);
  });

  it("n'a aucune ligne quand il n'y a ni récompense ni phrases", () => {
    expect(toRewardRows([], [])).toEqual([]);
    expect(toRewardRows([], null)).toEqual([]);
  });
});

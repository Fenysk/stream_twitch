import { describe, expect, it } from "vitest";
import {
  BURST_START,
  type FollowBurst,
  toBurstAfterFollow,
  toBurstAfterGap,
  toGroupDueIn,
} from "./follow-burst.rules";

const GAP = 10_000;

// Rejoue des follows à des dates données, et rend ce que le renard dit à chacune.
const replay = (times: number[]): { says: ("named" | "group" | null)[]; burst: FollowBurst } => {
  let burst = BURST_START;
  const says: ("named" | "group" | null)[] = [];
  for (const now of times) {
    const step = toBurstAfterFollow(burst, now, GAP);
    burst = step.burst;
    says.push(step.say);
  }
  return { says, burst };
};

describe("toBurstAfterFollow : un remerciement nominatif toutes les 10 s", () => {
  it("remercie par son nom le premier follow", () => {
    expect(toBurstAfterFollow(BURST_START, 5000, GAP)).toEqual({
      burst: { namedAt: 5000, pending: 0 },
      say: "named",
    });
  });

  it("met en attente les follows qui arrivent avant la fin du délai", () => {
    const { says, burst } = replay([0, 1, 2, 3, 9999]);
    expect(says).toEqual(["named", null, null, null, null]);
    expect(burst).toEqual({ namedAt: 0, pending: 4 });
  });

  it("remercie par son nom un follow arrivé exactement 10 s après le dernier remerciement nominatif", () => {
    const { says } = replay([0, 9999, 10_000]);
    expect(says).toEqual(["named", null, "named"]);
  });

  it("une rafale de 10 follows donne un remerciement nominatif, et 9 follows en attente", () => {
    const { says, burst } = replay(Array.from({ length: 10 }, (_, index) => index * 100));
    expect(says.filter((say) => say === "named")).toHaveLength(1);
    expect(burst.pending).toBe(9);
  });

  it("suit le délai réglé", () => {
    expect(toBurstAfterFollow({ namedAt: 0, pending: 0 }, 2000, 2000).say).toBe("named");
    expect(toBurstAfterFollow({ namedAt: 0, pending: 0 }, 1999, 2000).say).toBeNull();
  });
});

describe("toBurstAfterGap et toGroupDueIn : la phrase groupée", () => {
  it("regroupe les follows en attente en une phrase, et les remet à zéro", () => {
    expect(toBurstAfterGap({ namedAt: 0, pending: 9 })).toEqual({
      burst: { namedAt: 0, pending: 0 },
      say: "group",
    });
  });

  it("ne dit rien quand aucun follow n'attend", () => {
    expect(toBurstAfterGap({ namedAt: 0, pending: 0 })).toEqual({
      burst: { namedAt: 0, pending: 0 },
      say: null,
    });
  });

  it("dit dans combien de ms la phrase groupée est due : la fin du délai, jamais avant le dernier nominatif", () => {
    expect(toGroupDueIn({ namedAt: 1000, pending: 3 }, 4000, GAP)).toBe(7000);
    expect(toGroupDueIn({ namedAt: 1000, pending: 3 }, 11_000, GAP)).toBe(0);
    expect(toGroupDueIn({ namedAt: 1000, pending: 3 }, 50_000, GAP)).toBe(0);
  });

  it("n'attend aucune phrase groupée sans follow en attente", () => {
    expect(toGroupDueIn({ namedAt: 1000, pending: 0 }, 4000, GAP)).toBeNull();
    expect(toGroupDueIn(BURST_START, 4000, GAP)).toBeNull();
  });

  it("après la phrase groupée, le follow suivant est nominatif s'il arrive 10 s après le dernier nominatif", () => {
    const first = toBurstAfterFollow(BURST_START, 0, GAP);
    const waiting = toBurstAfterFollow(first.burst, 500, GAP);
    const group = toBurstAfterGap(waiting.burst);
    expect(group.say).toBe("group");
    expect(toBurstAfterFollow(group.burst, 10_500, GAP).say).toBe("named");
    expect(toBurstAfterFollow(group.burst, 5000, GAP).say).toBeNull();
  });
});

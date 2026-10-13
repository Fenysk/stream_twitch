// Contre les rafales de follows (des bots) : au plus un remerciement nominatif toutes les `gap` ms. Les follows qui arrivent
// pendant ce délai sont comptés, puis regroupés en une seule phrase sans pseudo à la fin du délai.
export type FollowBurst = {
  // L'instant du dernier remerciement nominatif ; `null` : aucun encore.
  namedAt: number | null;
  // Les follows arrivés depuis, pas encore remerciés.
  pending: number;
};

export const BURST_START: FollowBurst = { namedAt: null, pending: 0 };

// Ce que le renard dit après ce pas : le follow nominatif, la phrase groupée, ou rien.
export type BurstStep = { burst: FollowBurst; say: "named" | "group" | null };

// Un follow arrive : nominatif si le délai est écoulé depuis le dernier (ou s'il n'y en a pas eu), sinon il attend.
export function toBurstAfterFollow(burst: FollowBurst, now: number, gap: number): BurstStep {
  if (burst.namedAt === null || now - burst.namedAt >= gap) {
    return { burst: { namedAt: now, pending: burst.pending }, say: "named" };
  }
  return { burst: { ...burst, pending: burst.pending + 1 }, say: null };
}

// Le délai est écoulé : les follows en attente se regroupent en une phrase.
export function toBurstAfterGap(burst: FollowBurst): BurstStep {
  return burst.pending > 0 ? { burst: { ...burst, pending: 0 }, say: "group" } : { burst, say: null };
}

// Dans combien de ms la phrase groupée est due, ou `null` quand aucun follow n'attend.
export function toGroupDueIn(burst: FollowBurst, now: number, gap: number): number | null {
  if (burst.pending === 0 || burst.namedAt === null) return null;
  return Math.max(0, burst.namedAt + gap - now);
}

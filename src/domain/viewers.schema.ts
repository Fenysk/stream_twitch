import { z } from "zod";
import type { ViewersState } from "./viewers.types";

// Ce que GET /api/twitch/viewers répond, lu par la page et par la touche Stream Deck. `satisfies` : le schéma ne peut produire que
// des ViewersState ; le test vérifie l'autre sens.
export const ViewersStateSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("live"), count: z.number().int().nonnegative() }),
  z.object({ kind: z.literal("offline") }),
  z.object({ kind: z.literal("unknown") }),
]) satisfies z.ZodType<ViewersState>;

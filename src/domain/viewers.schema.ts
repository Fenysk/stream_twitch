import { z } from "zod";
import type { ViewersState } from "./viewers.types";

// Ce que `/api/twitch/viewers` répond, lu côté page : le même état que le serveur garde (viewers.types.ts).
export const ViewersStateSchema: z.ZodType<ViewersState> = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("live"), count: z.number().int().nonnegative() }),
  z.object({ kind: z.literal("offline") }),
  z.object({ kind: z.literal("unknown") }),
]);

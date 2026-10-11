import type { z } from "zod";

export function toIssuesMessage(error: z.ZodError): string {
  return error.issues.map((issue) => `${issue.path.join(".") || "(racine)"} : ${issue.message}`).join(" ; ");
}

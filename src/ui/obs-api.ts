// OBS côté page : ce que l'interface lui demande par le serveur. Chaque demande rend une réponse ou le refus à montrer, jamais une
// exception (même mécanique que les expressions).

import { ObsScenesSchema } from "../domain/obs-scenes.schema";
import { type Answer, ask } from "./expressions-api";

// Les noms des scènes d'OBS, dans son ordre.
export const listScenes = (): Promise<Answer<string[]>> =>
  ask("/api/obs/scenes", { method: "GET" }, (body) => {
    const parsed = ObsScenesSchema.safeParse(body);
    return parsed.success ? parsed.data.scenes : undefined;
  });

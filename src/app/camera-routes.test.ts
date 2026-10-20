import { createMemoryHistory, createRouter } from "@tanstack/react-router";
import { describe, expect, it } from "vitest";
import { routeTree } from "./routeTree.gen";

// La route que le routeur retient pour une adresse, sans rien afficher.
const toRouteOf = async (path: string) => {
  const router = createRouter({ routeTree, history: createMemoryHistory({ initialEntries: [path] }) });
  await router.load();
  const leaf = router.state.matches.at(-1);
  return { id: leaf?.routeId, params: leaf?.params };
};

describe("les routes d'une caméra", () => {
  it("Quand OBS ouvre /camera/<numéro>, le système doit servir la page image de ce numéro", async () => {
    expect(await toRouteOf("/camera/3")).toEqual({ id: "/camera/$number/", params: { number: "3" } });
    expect(await toRouteOf("/camera/12")).toEqual({ id: "/camera/$number/", params: { number: "12" } });
  });

  it("Quand OBS ouvre /camera/<numéro>/mic, le système doit servir la page mic de ce numéro, pas la page image", async () => {
    expect(await toRouteOf("/camera/3/mic")).toEqual({ id: "/camera/$number/mic", params: { number: "3" } });
    expect(await toRouteOf("/camera/12/mic")).toEqual({
      id: "/camera/$number/mic",
      params: { number: "12" },
    });
  });
});

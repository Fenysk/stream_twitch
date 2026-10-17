import { defineHandler } from "nitro";
import { json, refuse } from "./http";
import { getRuntime } from "./runtime";

// La liste des clips bruts du dossier d'OBS (la plus récente d'abord, avec leur durée) et le nombre de clips confirmés.
export default defineHandler(async (event) => {
  if (event.req.method !== "GET") return refuse(405, "méthode non permise");
  const listed = await getRuntime().clips.list();
  return listed.ok ? json(listed.value) : refuse(listed.status, listed.message);
});

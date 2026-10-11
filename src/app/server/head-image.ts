import { defineHandler } from "nitro";
import { HeadPartSchema } from "../../domain/head-view.schema";
import { getRuntime } from "./runtime";

export default defineHandler((event) => {
  const part = HeadPartSchema.safeParse(event.context.params?.part);
  if (!part.success) return new Response("Image inconnue.", { status: 404 });
  return new Response(getRuntime().images[part.data], {
    headers: { "content-type": "image/png", "cache-control": "no-cache" },
  });
});

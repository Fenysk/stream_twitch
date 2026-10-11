import { defineHandler } from "nitro";
import { ExpressionImagePartSchema } from "../../domain/head-view.schema";
import { getRuntime } from "./runtime";

// L'URL d'une image porte la version de l'expression (?v=) : une image servie sous une URL ne change plus, le cache peut la garder.
export default defineHandler((event) => {
  const part = ExpressionImagePartSchema.safeParse(event.context.params?.part);
  const bytes =
    part.success && getRuntime().expressions.getImage(String(event.context.params?.id ?? ""), part.data);
  if (!bytes) return new Response("Image inconnue.", { status: 404 });
  return new Response(Uint8Array.from(bytes), {
    headers: { "content-type": "image/png", "cache-control": "public, max-age=31536000, immutable" },
  });
});

import { createFileRoute } from "@tanstack/react-router";
import { Fox } from "../../ui/Fox";
import { useFox } from "../../ui/use-fox";

// Fond transparent et aucune marge : OBS superpose la page à la scène. Le design system n'est pas lié ici (son
// `html, body` a un fond opaque), comme sur `/head` : la page n'a que l'image du renard, ni texte ni surface à styler.
const FOX_PAGE_CSS = "html,body{margin:0;overflow:hidden;background:transparent}";

const FoxPage = () => {
  const { image, bodyRef } = useFox("screen");
  return image ? <Fox image={image} bodyRef={bodyRef} /> : null;
};

export const Route = createFileRoute("/fox")({
  head: () => ({ meta: [{ title: "Renard" }], styles: [{ children: FOX_PAGE_CSS }] }),
  component: FoxPage,
});

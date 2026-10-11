import { createFileRoute } from "@tanstack/react-router";
import { Head } from "../../ui/Head";
import { useHeadView } from "../../ui/use-head-view";

// Fond transparent et aucune marge : OBS superpose la page à la scène. Le design system n'est jamais lié ici :
// son `html, body` a un fond opaque.
const HEAD_PAGE_CSS = "html,body{margin:0;overflow:hidden;background:transparent}";

const HeadPage = () => {
  const shown = useHeadView();
  return shown ? <Head view={shown.view} images={shown.images} /> : null;
};

export const Route = createFileRoute("/head")({
  head: () => ({ meta: [{ title: "Tête" }], styles: [{ children: HEAD_PAGE_CSS }] }),
  component: HeadPage,
});

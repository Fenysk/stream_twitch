import { createFileRoute } from "@tanstack/react-router";
import { useSoundScreen } from "../../ui/use-sound-screen";

// Fond transparent et aucune marge : la source OBS n'a aucune image, elle ne fait que jouer les sons. Le design system n'est
// pas lié ici (son `html, body` a un fond opaque), comme sur `/head` et `/fox`.
const SOUNDS_PAGE_CSS = "html,body{margin:0;overflow:hidden;background:transparent}";

const SoundsPage = () => {
  useSoundScreen();
  return null;
};

export const Route = createFileRoute("/sounds")({
  head: () => ({ meta: [{ title: "Sons" }], styles: [{ children: SOUNDS_PAGE_CSS }] }),
  component: SoundsPage,
});

import { createFileRoute } from "@tanstack/react-router";
import chatCss from "../../ui/chat/chat.css?url";
import designSystemCss from "../../ui/design/design-system.css?url";
import { ShowStage } from "../../ui/show/show-stage";
import showStageCss from "../../ui/show/show-stage.css?url";

// Source OBS de 1920 × 1080 : aucune marge, transparente hors émission (le fond noir est celui du déroulé, `.show-backdrop`, qui
// s'efface). Le design system (le carton, le titre) est lié ici, sans son script d'apparence : la page reste sombre ; le fond opaque
// de son `html, body` est ramené à transparent.
const SHOW_PAGE_CSS = "html,body{margin:0;overflow:hidden;background:transparent}";

export const Route = createFileRoute("/show")({
  head: () => ({
    meta: [{ title: "Émission" }],
    links: [
      { rel: "stylesheet", href: designSystemCss },
      { rel: "stylesheet", href: chatCss },
      { rel: "stylesheet", href: showStageCss },
    ],
    styles: [{ children: SHOW_PAGE_CSS }],
  }),
  component: ShowStage,
});

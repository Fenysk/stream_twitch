import { createFileRoute } from "@tanstack/react-router";
import designSystemCss from "../../ui/design/design-system.css?url";
import { ShowCountdown } from "../../ui/show/show-countdown";
import showCountdownCss from "../../ui/show/show-countdown.css?url";

// Source OBS d'environ 800 × 100 : aucune marge, transparente hors émission. Le design system (la pill) est lié ici, sans son script
// d'apparence : la page reste sombre ; le fond opaque de son `html, body` est ramené à transparent.
const COUNTDOWN_PAGE_CSS = "html,body{margin:0;overflow:hidden;background:transparent}";

export const Route = createFileRoute("/countdown")({
  head: () => ({
    meta: [{ title: "Retour de Fenysk" }],
    links: [
      { rel: "stylesheet", href: designSystemCss },
      { rel: "stylesheet", href: showCountdownCss },
    ],
    styles: [{ children: COUNTDOWN_PAGE_CSS }],
  }),
  component: ShowCountdown,
});

import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { MobileSearchSchema } from "../../domain/phone.schema";
import chatCss from "../../ui/chat/chat.css?url";
import designSystemCss from "../../ui/design/design-system.css?url";
import controlRoleCss from "../../ui/mobile/control-role.css?url";
import { MobilePage } from "../../ui/mobile/mobile-page";
import mobilePageCss from "../../ui/mobile/mobile-page.css?url";
import selfieRoleCss from "../../ui/mobile/selfie-role.css?url";

// La page du téléphone est toujours sombre, comme le tchat affiché : `data-appearance="dark"` sur <html> avant la première peinture,
// sans lire le choix d'apparence du navigateur.
const DARK_APPEARANCE_SCRIPT = 'document.documentElement.dataset.appearance="dark"';

const MobileRoute = () => {
  const { role } = Route.useSearch();
  const navigate = useNavigate();
  return (
    <MobilePage
      urlRole={role}
      onLeaveUrlRole={() => void navigate({ to: "/mobile", search: {}, replace: true })}
    />
  );
};

export const Route = createFileRoute("/mobile")({
  validateSearch: MobileSearchSchema,
  head: () => ({
    meta: [{ title: "Téléphone · stream_twitch" }, { name: "color-scheme", content: "dark" }],
    links: [
      { rel: "stylesheet", href: designSystemCss },
      { rel: "stylesheet", href: chatCss },
      { rel: "stylesheet", href: mobilePageCss },
      { rel: "stylesheet", href: controlRoleCss },
      { rel: "stylesheet", href: selfieRoleCss },
    ],
    scripts: [{ children: DARK_APPEARANCE_SCRIPT }],
  }),
  component: MobileRoute,
});

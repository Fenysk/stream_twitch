import { createFileRoute, Outlet, useNavigate, useRouterState } from "@tanstack/react-router";
import { Smile } from "lucide-react";
import { APPEARANCE_SCRIPT } from "../../ui/design/appearance";
import designSystemCss from "../../ui/design/design-system.css?url";
import { SettingsShell } from "../../ui/settings/settings-shell";
import settingsShellCss from "../../ui/settings/settings-shell.css?url";

// Les sections du menu : l'identifiant, le libellé, l'icône, et la route qu'elles ouvrent.
const SECTIONS = [{ id: "head", label: "Tête South Park", icon: Smile }] as const;
const PATHS = { head: "/settings/head" } as const;

type SectionId = (typeof SECTIONS)[number]["id"];

const SettingsLayout = () => {
  const navigate = useNavigate();
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  const currentId: SectionId = SECTIONS.find(({ id }) => pathname.startsWith(PATHS[id]))?.id ?? "head";
  return (
    <SettingsShell
      sections={SECTIONS}
      currentId={currentId}
      onSelect={(id) => void navigate({ to: PATHS[id] })}
    >
      <Outlet />
    </SettingsShell>
  );
};

// Le design system est lié ici, et seulement ici : jamais sur `/head`, dont le fond doit rester transparent.
export const Route = createFileRoute("/settings")({
  head: () => ({
    meta: [{ title: "Réglages · stream_twitch" }],
    links: [
      { rel: "stylesheet", href: designSystemCss },
      { rel: "stylesheet", href: settingsShellCss },
    ],
    scripts: [{ children: APPEARANCE_SCRIPT }],
  }),
  component: SettingsLayout,
});

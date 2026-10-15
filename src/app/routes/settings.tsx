import { createFileRoute, Outlet, useNavigate, useRouterState } from "@tanstack/react-router";
import { APPEARANCE_SCRIPT } from "../../ui/design/appearance";
import designSystemCss from "../../ui/design/design-system.css?url";
import { SECTION_GROUPS, SECTIONS, toCurrentSectionId } from "../../ui/settings/settings-sections";
import { SettingsShell } from "../../ui/settings/settings-shell";
import settingsShellCss from "../../ui/settings/settings-shell.css?url";

const SettingsLayout = () => {
  const navigate = useNavigate();
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  const currentId = toCurrentSectionId(pathname);
  return (
    <SettingsShell
      groups={SECTION_GROUPS}
      currentId={currentId}
      onSelect={(id) => {
        const section = SECTIONS.find((candidate) => candidate.id === id);
        if (section && "path" in section) void navigate({ to: section.path });
      }}
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

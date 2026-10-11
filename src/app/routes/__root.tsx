import { createRootRoute, HeadContent, Outlet, Scripts } from "@tanstack/react-router";

// Aucun style ici : la page `/head` est une source OBS transparente, l'interface a le fond de son design system.
// Chaque famille de routes pose le sien (head.tsx, settings.tsx). `suppressHydrationWarning` : le script d'apparence
// de l'interface écrit `data-appearance` sur `<html>` avant React.
const RootDocument = () => (
  <html lang="fr" suppressHydrationWarning>
    <head>
      <HeadContent />
    </head>
    <body>
      <Outlet />
      <Scripts />
    </body>
  </html>
);

export const Route = createRootRoute({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      { title: "stream_twitch" },
    ],
  }),
  component: RootDocument,
});

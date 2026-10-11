import { createRootRoute, HeadContent, Outlet, Scripts } from "@tanstack/react-router";

// Fond transparent et aucune marge : OBS superpose la page à la scène.
const RootDocument = () => (
  <html lang="fr" style={{ background: "transparent" }}>
    <head>
      <HeadContent />
    </head>
    <body style={{ margin: 0, overflow: "hidden", background: "transparent" }}>
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
      { title: "Tête" },
    ],
  }),
  component: RootDocument,
});

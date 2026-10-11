import { createFileRoute, redirect } from "@tanstack/react-router";

// La page d'accueil est l'interface de réglages : son premier onglet.
export const Route = createFileRoute("/")({
  beforeLoad: () => {
    throw redirect({ to: "/settings/head" });
  },
});

import { definePlugin } from "nitro";
import { startRuntime } from "./runtime";
import { log } from "./server-log";

// Exécuté au lancement du serveur, avant qu'une page ne se connecte : le client OBS démarre sans attendre la page.
export default definePlugin(() => {
  try {
    startRuntime();
  } catch (error) {
    log(`Démarrage impossible : ${error instanceof Error ? error.message : String(error)}`);
    process.exit(1);
  }
});

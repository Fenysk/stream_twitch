import streamDeck from "@elgato/streamdeck";
import { ViewersAction } from "./viewers-action";

// Le port est celui de la construction (`pnpm streamdeck:build`), jamais lu à l'exécution.
streamDeck.actions.registerAction(
  new ViewersAction(`http://127.0.0.1:${serverPortAtBuild}/api/twitch/viewers`),
);

await streamDeck.connect();

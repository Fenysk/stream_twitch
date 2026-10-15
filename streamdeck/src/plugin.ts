import streamDeck from "@elgato/streamdeck";
import { CYCLE_BEHAVIOUR, PRESET_BEHAVIOUR, TOGGLE_BEHAVIOUR } from "./key-behaviours";
import { PhraseAction } from "./phrase-action";
import { SettingKeyAction } from "./setting-key-action";
import { SettingsFeed } from "./settings-feed";
import { ViewersAction } from "./viewers-action";

// Le port est celui de la construction (`pnpm streamdeck:build`), jamais lu à l'exécution.
const serverUrl = `http://127.0.0.1:${serverPortAtBuild}`;
const feed = new SettingsFeed(serverUrl);

streamDeck.actions.registerAction(new ViewersAction(`${serverUrl}/api/twitch/viewers`));
streamDeck.actions.registerAction(new SettingKeyAction(feed, TOGGLE_BEHAVIOUR));
streamDeck.actions.registerAction(new SettingKeyAction(feed, CYCLE_BEHAVIOUR));
streamDeck.actions.registerAction(new SettingKeyAction(feed, PRESET_BEHAVIOUR));
streamDeck.actions.registerAction(new PhraseAction(serverUrl));

await streamDeck.connect();

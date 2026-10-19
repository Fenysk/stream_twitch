import streamDeck from "@elgato/streamdeck";
import { END_LATER_ACTION_UUID, END_SOONER_ACTION_UUID } from "./action-ids";
import { EndTimeAction } from "./end-time-action";
import { EndTimeKeys } from "./end-time-keys";
import { CYCLE_BEHAVIOUR, PRESET_BEHAVIOUR, TOGGLE_BEHAVIOUR } from "./key-behaviours";
import { PhraseAction } from "./phrase-action";
import { PictureAction } from "./picture-action";
import { PictureFeed } from "./picture-feed";
import { SettingKeyAction } from "./setting-key-action";
import { SettingsFeed } from "./settings-feed";
import { ViewersAction } from "./viewers-action";

// Le port est celui de la construction (`pnpm streamdeck:build`), jamais lu à l'exécution.
const serverUrl = `http://127.0.0.1:${serverPortAtBuild}`;
// Les réglages arrivent par le flux du serveur, tout de suite ; la relecture toutes les 10 s reste en secours.
const feed = new SettingsFeed(serverUrl, fetch, {
  hasStream: true,
  log: (message) => streamDeck.logger.info(message),
});

streamDeck.actions.registerAction(new ViewersAction(`${serverUrl}/api/twitch/viewers`));
streamDeck.actions.registerAction(new SettingKeyAction(feed, TOGGLE_BEHAVIOUR));
streamDeck.actions.registerAction(new SettingKeyAction(feed, CYCLE_BEHAVIOUR));
streamDeck.actions.registerAction(new SettingKeyAction(feed, PRESET_BEHAVIOUR));
streamDeck.actions.registerAction(new PhraseAction(serverUrl));
const endKeys = new EndTimeKeys(feed, Date.now, streamDeck.logger);
streamDeck.actions.registerAction(new EndTimeAction(END_LATER_ACTION_UUID, "later", endKeys));
streamDeck.actions.registerAction(new EndTimeAction(END_SOONER_ACTION_UUID, "sooner", endKeys));
// L'image (qui est à l'image dans la place caméra d'OBS) arrive par son propre flux, tout de suite ; la touche « Image » passe au membre suivant.
const pictureFeed = new PictureFeed(serverUrl, fetch, (message) => streamDeck.logger.info(message));
streamDeck.actions.registerAction(new PictureAction(pictureFeed, serverUrl));

await streamDeck.connect();

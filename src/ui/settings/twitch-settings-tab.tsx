// L'onglet « Twitch » : la connexion d'Alexis à Twitch (l'état, se connecter, se déconnecter), sur une seule colonne.

import { SettingsPage } from "./settings-page";
import { toSectionLabel } from "./settings-sections";
import { TwitchBlock } from "./twitch-block";
import { useTwitch } from "./use-twitch";

export const TwitchSettingsTab = () => {
  const twitch = useTwitch();
  return (
    <SettingsPage title={toSectionLabel("twitch")}>
      <TwitchBlock
        status={twitch.status}
        error={twitch.error}
        isBusy={twitch.isBusy}
        onDisconnect={() => void twitch.disconnect()}
      />
    </SettingsPage>
  );
};

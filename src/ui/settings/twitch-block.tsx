// Le bloc « Connexion à Twitch » de l'onglet Twitch : l'état (connecté en tant que …, ou non connecté), « Se connecter à Twitch »
// (ouvre l'autorisation de Twitch dans un autre onglet), « Se reconnecter à Twitch » quand le jeton gardé ne couvre pas tout, et
// « Se déconnecter ». Les follows, les récompenses de points de chaîne et les prédictions ont besoin de cette connexion ; les
// subs, les cheers et les raids non.

import { TWITCH_REDIRECT_URI, toTopicsText } from "../../domain/twitch.rules";
import type { TwitchStatus } from "../../domain/twitch.schema";
import { Button } from "../design/button";
import { SettingsCard } from "./settings-page";
import { toTwitchStatusText } from "./twitch-status-text";

type TwitchBlockProps = {
  status: TwitchStatus | null;
  // Pourquoi l'état n'a pas pu être lu ou la déconnexion n'a pas marché.
  error: string | null;
  isBusy: boolean;
  onDisconnect: () => void;
};

export const TwitchBlock = ({ status, error, isBusy, onDisconnect }: TwitchBlockProps) => (
  <SettingsCard title="Connexion à Twitch">
    <p className="lp-type-body" role="status">
      {toTwitchStatusText(status)}
    </p>
    {status?.kind === "disconnected" && status.lastError && (
      <p role="alert" className="lp-type-caption lp-danger">
        {status.lastError}
      </p>
    )}
    {error && (
      <p role="alert" className="lp-type-caption lp-danger">
        {error}
      </p>
    )}
    {status?.kind === "disconnected" && (
      <>
        <div className="twitch-actions">
          <Button label="Se connecter à Twitch" href="/auth/twitch/start" isNewTab />
        </div>
        <p className="lp-type-caption lp-muted">
          Autorise l'application dans l'onglet Twitch qui s'ouvre, puis reviens ici : l'état change tout seul.
          L'adresse de retour {TWITCH_REDIRECT_URI} doit être enregistrée dans l'application Twitch.
        </p>
      </>
    )}
    {status?.kind === "connected" && status.missing.length > 0 && (
      <p role="alert" className="lp-type-caption lp-danger">
        Reconnecte-toi : l'autorisation actuelle ne couvre pas {toTopicsText(status.missing)}.
      </p>
    )}
    {status?.kind === "connected" && (
      <div className="twitch-actions">
        {status.missing.length > 0 && (
          <Button label="Se reconnecter à Twitch" href="/auth/twitch/start" isNewTab />
        )}
        <Button label="Se déconnecter" variant="danger" isDisabled={isBusy} onPress={onDisconnect} />
      </div>
    )}
    <p className="lp-type-caption lp-muted">
      Les follows, les récompenses de points de chaîne et les prédictions se lisent avec cette connexion. Les
      subs, les resubs, les subs offerts, les cheers et les raids n'en ont pas besoin.
    </p>
  </SettingsCard>
);

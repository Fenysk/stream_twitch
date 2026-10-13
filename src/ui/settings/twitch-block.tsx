// Le bloc « Connexion à Twitch » de l'onglet Renard : l'état (connecté en tant que …, ou non connecté), « Se connecter à Twitch »
// (ouvre l'autorisation de Twitch dans un autre onglet) et « Se déconnecter ». Les follows ont besoin de cette connexion ; les
// subs et les cheers non.

import { TWITCH_REDIRECT_URI } from "../../domain/twitch.rules";
import type { TwitchStatus } from "../../domain/twitch.schema";
import { Button } from "../design/button";
import { DESIGN_TEXTS } from "../design/design-texts";

type TwitchBlockProps = {
  status: TwitchStatus | null;
  // Pourquoi l'état n'a pas pu être lu ou la déconnexion n'a pas marché.
  error: string | null;
  isBusy: boolean;
  onDisconnect: () => void;
};

const toStatusText = (status: TwitchStatus | null): string => {
  if (status === null) return DESIGN_TEXTS.loading;
  switch (status.kind) {
    case "unavailable":
      return "Indisponible : TWITCH_CLIENT_ID et TWITCH_CLIENT_SECRET manquent dans .env.";
    case "connected":
      return `Connecté en tant que ${status.login}.`;
    case "disconnected":
      return "Non connecté.";
  }
};

export const TwitchBlock = ({ status, error, isBusy, onDisconnect }: TwitchBlockProps) => (
  <section className="fox-group">
    <h2 className="lp-type-heading">Connexion à Twitch</h2>
    <p className="lp-type-body" role="status">
      {toStatusText(status)}
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
    {status?.kind === "connected" && (
      <div className="twitch-actions">
        <Button label="Se déconnecter" variant="danger" isDisabled={isBusy} onPress={onDisconnect} />
      </div>
    )}
    <p className="lp-type-caption lp-muted">
      Les follows se lisent avec cette connexion. Les subs, les resubs, les subs offerts et les cheers n'en
      ont pas besoin.
    </p>
  </section>
);

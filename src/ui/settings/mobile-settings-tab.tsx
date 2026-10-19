// L'onglet « Mobile » : les QR codes qui ouvrent chaque rôle sur le téléphone, l'adresse de la source OBS de chaque caméra, et les
// téléphones connectés en direct. Le téléphone ne règle rien : tout se règle ici.

import { toCameraName, toRoleLabel, toRoleUrl } from "../../domain/camera.rules";
import { PHONE_ROLES, type PhoneSummary } from "../../domain/phone.schema";
import { Badge } from "../design/badge";
import { CameraSources } from "./camera-sources";
import { QrCode } from "./qr-code";
import { SettingsCard, SettingsLoading, SettingsPage } from "./settings-page";
import { toSectionLabel } from "./settings-sections";
import { useMobileState } from "./use-mobile-state";

// Le port du serveur du stream, quand l'onglet est ouvert par une adresse sans port (celle de Tailscale).
const STREAM_PORT = "4747";

const RoleCodes = ({ origin }: { origin: string | null }) => (
  <SettingsCard title="Ouvrir sur le téléphone">
    {origin === null ? (
      <p className="lp-type-body">
        Écris <code>mobileOrigin</code> dans settings.json (par exemple{" "}
        <code>https://pc.tail1234.ts.net</code>) et relance le serveur : les QR codes apparaissent ici.
      </p>
    ) : (
      <>
        <p className="lp-type-caption lp-muted">
          Scanne le QR code d'un rôle avec l'appareil photo du téléphone, qui doit être sur Tailscale : la
          page s'ouvre directement sur ce rôle.
        </p>
        <div className="mobile-qr-grid">
          {PHONE_ROLES.map((role) => (
            <figure key={role} className="mobile-qr">
              <QrCode text={toRoleUrl(origin, role)} label={`QR code du rôle ${toRoleLabel(role)}`} />
              <figcaption className="lp-type-title">{toRoleLabel(role)}</figcaption>
              <code className="lp-type-caption lp-muted mobile-qr-url">{toRoleUrl(origin, role)}</code>
            </figure>
          ))}
        </div>
      </>
    )}
  </SettingsCard>
);

const PhoneList = ({ phones }: { phones: readonly PhoneSummary[] }) => (
  <SettingsCard title="Téléphones connectés">
    {phones.length === 0 ? (
      <p className="lp-type-body lp-muted" role="status">
        Aucun téléphone connecté.
      </p>
    ) : (
      <ul className="mobile-list" aria-live="polite">
        {phones.map(({ id, role, number, hasScreen }) => (
          <li key={id} className="mobile-phone">
            <span className="lp-type-body">{number === null ? toRoleLabel(role) : toCameraName(number)}</span>
            <span className="lp-type-caption lp-muted">
              {toRoleLabel(role)} · téléphone {id.slice(0, 4)}
            </span>
            {number !== null && <Badge label={hasScreen ? "Source OBS connectée" : "Pas de source OBS"} />}
          </li>
        ))}
      </ul>
    )}
  </SettingsCard>
);

export const MobileSettingsTab = () => {
  const state = useMobileState();
  const title = toSectionLabel("mobile");
  if (!state) return <SettingsLoading title={title} />;
  return (
    <SettingsPage title={title}>
      <RoleCodes origin={state.origin} />
      <CameraSources phones={state.phones} port={window.location.port || STREAM_PORT} />
      <PhoneList phones={state.phones} />
    </SettingsPage>
  );
};

import { toCameraAddress, toCameraName, toNextNumber } from "../../domain/camera.rules";
import type { PhoneSummary } from "../../domain/phone.schema";
import { Badge } from "../design/badge";
import { CopyButton } from "./copy-button";
import { SettingsCard } from "./settings-page";

// Les numéros des caméras connectées, du plus petit au plus grand.
const toConnectedNumbers = (phones: readonly PhoneSummary[]): number[] =>
  phones.flatMap(({ number }) => (number === null ? [] : [number])).sort((a, b) => a - b);

type CameraSourcesProps = { phones: readonly PhoneSummary[]; port: string };

// L'adresse de la source navigateur d'OBS de chaque caméra connectée, et de la prochaine caméra libre : les sources se créent à la main
// dans OBS, une fois pour toutes, et retrouvent leur téléphone à chaque ouverture.
export const CameraSources = ({ phones, port }: CameraSourcesProps) => {
  const connected = toConnectedNumbers(phones);
  const next = toNextNumber(connected);
  const rows = [...connected.map((number) => ({ number, isNext: false })), { number: next, isNext: true }];
  return (
    <SettingsCard title="Sources navigateur d'OBS">
      <p className="lp-type-caption lp-muted">
        Une source par caméra : colle son adresse, largeur 1920 et hauteur 1080. Coche « Contrôler l'audio via
        OBS » sur ces sources seulement, et désactive le monitoring audio.
      </p>
      <ul className="mobile-list">
        {rows.map(({ number, isNext }) => {
          const address = toCameraAddress(number, port);
          return (
            <li key={number} className="mobile-address">
              <span className="lp-type-body mobile-address-name">
                {toCameraName(number)}
                {isNext && <Badge label="Prochaine libre" />}
              </span>
              <code className="lp-type-caption mobile-address-url">{address}</code>
              <CopyButton
                text={address}
                title={`Copier l'adresse de la ${toCameraName(number).toLowerCase()}`}
              />
            </li>
          );
        })}
      </ul>
    </SettingsCard>
  );
};

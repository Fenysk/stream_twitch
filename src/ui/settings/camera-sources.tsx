import { toCameraAddress, toCameraMicAddress, toCameraName, toNextNumber } from "../../domain/camera.rules";
import type { PhoneSummary, ScreenKind } from "../../domain/phone.schema";
import { Badge } from "../design/badge";
import { CopyButton } from "./copy-button";
import { SettingsCard } from "./settings-page";

// Les numéros des caméras connectées, du plus petit au plus grand.
const toConnectedNumbers = (phones: readonly PhoneSummary[]): number[] =>
  phones.flatMap(({ number }) => (number === null ? [] : [number])).sort((a, b) => a - b);

// Les deux sources d'une caméra : l'image, puis le mic. `owner` complète « Copier l'adresse … la caméra 1 ».
const SOURCES: readonly {
  kind: ScreenKind;
  label: string;
  owner: string;
  toAddress: (number: number, port: string) => string;
}[] = [
  { kind: "image", label: "Image", owner: "de l'image de", toAddress: toCameraAddress },
  { kind: "mic", label: "Mic", owner: "du mic de", toAddress: toCameraMicAddress },
];

type CameraSourcesProps = { phones: readonly PhoneSummary[]; port: string };

// L'adresse des deux sources navigateur d'OBS de chaque caméra connectée, et de la prochaine caméra libre : les sources se créent à la main
// dans OBS, une fois pour toutes, et retrouvent leur téléphone à chaque ouverture. Le mic a sa propre source parce qu'OBS ne mixe pas le son
// d'une source cachée ou d'une scène absente du programme : posée dans une scène présente partout, elle s'entend dans toutes les scènes.
export const CameraSources = ({ phones, port }: CameraSourcesProps) => {
  const connected = toConnectedNumbers(phones);
  const next = toNextNumber(connected);
  const cameras = [...connected.map((number) => ({ number, isNext: false })), { number: next, isNext: true }];
  return (
    <SettingsCard title="Sources navigateur d'OBS">
      <p className="lp-type-caption lp-muted">
        Deux sources par caméra. L'image : colle son adresse dans « Master - Webcam », largeur 1920 et hauteur
        1080 ; elle ne joue aucun son, inutile de cocher « Contrôler l'audio via OBS ».
      </p>
      <p className="lp-type-caption lp-muted">
        Le mic : colle son adresse dans une scène « Master - Micros » que tu ajoutes à chaque scène, coche «
        Contrôler l'audio via OBS » et désactive le monitoring audio. Le mic s'entend alors dans toutes les
        scènes, caméra visible ou cachée.
      </p>
      <ul className="mobile-list">
        {cameras.flatMap(({ number, isNext }) =>
          SOURCES.map(({ kind, label, owner, toAddress }) => {
            const address = toAddress(number, port);
            return (
              <li key={`${number}-${kind}`} className="mobile-address">
                <span className="lp-type-body mobile-address-name">
                  {toCameraName(number)} · {label}
                  {isNext && kind === "image" && <Badge label="Prochaine libre" />}
                </span>
                <code className="lp-type-caption mobile-address-url">{address}</code>
                <CopyButton
                  text={address}
                  title={`Copier l'adresse ${owner} la ${toCameraName(number).toLowerCase()}`}
                />
              </li>
            );
          }),
        )}
      </ul>
    </SettingsCard>
  );
};

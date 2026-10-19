import { Video } from "lucide-react";
import type { ReactNode } from "react";
import { Button } from "../design/button";
import { AlertLine } from "./alert-line";
import { BannerMenus } from "./banner-menus";
import { CameraControls } from "./camera-controls";
import { ControlBanner } from "./control-banner";
import { ControlChat } from "./control-chat";
import { ControlDock } from "./control-dock";
import { CutCameraButton } from "./cut-camera-button";
import { FilmPreview } from "./film-preview";
import { MicButton } from "./mic-button";
import { MonitorThumbnail } from "./monitor-thumbnail";
import { RoleCorner } from "./role-corner";
import type { PhoneScreenModel } from "./use-phone-screen";

type BodyProps = { model: PhoneScreenModel; onUpdateRole: () => void };

// L'aperçu du téléphone qui filme, avec les commandes que la disposition lui pose.
const Preview = ({ model, onUpdateRole, controls }: BodyProps & { controls: ReactNode }) => (
  <FilmPreview
    camera={model.camera}
    link={model.link}
    isBadgeOpen={model.menu.openMenu === "camera"}
    onOpenCamera={() => model.menu.onOpenMenu("camera")}
    onUpdateRole={onUpdateRole}
    controls={controls}
  />
);

const toCutButton = ({ camera, link, cutCamera }: PhoneScreenModel) => (
  <CutCameraButton standing={link.standing} isDisabled={camera.status !== "live"} onPress={cutCamera} />
);

// Ne filme pas, ou filme en portrait : de haut en bas, l'aperçu (seulement quand il filme), le bandeau avec l'alerte dessous, le chat, et la
// barre du bas [Micro : X] [Filmer ou Montrer·Cacher] [Sons] avec les feuilles.
export const StackBody = ({ model, onUpdateRole }: BodyProps) => {
  const { layout, isFilming, camera, link, menu, alert, toast } = model;
  const { state } = link.control;
  return (
    <>
      {layout === "film-portrait" && (
        <section className="selfie-preview" aria-label="Aperçu de la caméra" data-on-air={link.isOnAir}>
          <Preview
            model={model}
            onUpdateRole={onUpdateRole}
            controls={
              <CameraControls isDisabled={camera.status !== "live"} onSwitchCamera={camera.switchCamera} />
            }
          />
        </section>
      )}
      <div className="control-top">
        <ControlBanner
          view={link.control}
          openMenu={menu.openMenu}
          onOpenMenu={menu.onOpenMenu}
          lead={
            <MonitorThumbnail
              url={menu.monitorUrl}
              isLinked={state.isLinked}
              isExpanded={menu.openMenu === "monitor"}
              onPress={() => menu.onOpenMenu("monitor")}
            />
          }
        >
          {!isFilming && <RoleCorner onPress={onUpdateRole} />}
        </ControlBanner>
        {alert && <AlertLine alert={alert} />}
      </div>
      <ControlChat />
      <ControlDock
        state={state}
        menu={menu}
        ownNumber={link.number}
        middle={
          isFilming ? toCutButton(model) : <Button label="Filmer" icon={Video} onPress={model.onStartFilm} />
        }
        onToast={toast.show}
      />
    </>
  );
};

// Filme en paysage : l'aperçu plein écran avec toute la barre [Micro : X] [Montrer·Cacher] [Objectif] [Écran noir], l'alerte en haut, et
// les feuilles (seule la feuille Micro s'ouvre d'ici).
export const LandscapeBody = ({ model, onUpdateRole }: BodyProps) => {
  const { camera, link, menu, alert, toast } = model;
  const { state } = link.control;
  return (
    <>
      <Preview
        model={model}
        onUpdateRole={onUpdateRole}
        controls={
          <CameraControls
            isDisabled={camera.status !== "live"}
            mic={
              <MicButton
                state={state}
                ownNumber={link.number}
                isExpanded={menu.openMenu === "mics"}
                onPress={() => menu.onOpenMenu("mics")}
              />
            }
            cut={toCutButton(model)}
            onSwitchCamera={camera.switchCamera}
            onBlackout={model.onBlackout}
          />
        }
      />
      {alert && <AlertLine alert={alert} />}
      <BannerMenus
        state={state}
        ownNumber={link.number}
        openMenu={menu.openMenu}
        monitorUrl={menu.monitorUrl}
        onOpenMenu={menu.onOpenMenu}
        onClose={menu.onCloseMenu}
        onToast={toast.show}
      />
    </>
  );
};

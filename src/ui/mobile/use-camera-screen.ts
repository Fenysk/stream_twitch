// La page OBS d'une caméra, image ou mic : une seule connexion au serveur (son flux), qui lui dit quand son téléphone est là et lui passe ses
// signaux. Le flux reçu est celui du téléphone (sa piste vidéo pour la page image, sa piste audio pour la page mic) ; il disparaît quand le
// téléphone part, et revient quand un téléphone se (re)connecte. La page dit au serveur (`POST /api/mobile/link`) si sa liaison avec le
// téléphone est vive.

import { useEffect, useState } from "react";
import type { ScreenKind } from "../../domain/phone.schema";
import { createLinkReporter, createSignalSender, watchScreen } from "../mobile-api";
import { createCameraReceiver } from "./camera-receiver";
import { openReceiverPeer } from "./peer";
import { createRandomId } from "./random-id";

export const useCameraScreen = (number: number, kind: ScreenKind): MediaStream | null => {
  const [stream, setStream] = useState<MediaStream | null>(null);

  useEffect(() => {
    const id = createRandomId();
    const receiver = createCameraReceiver<MediaStream>({
      openPeer: openReceiverPeer,
      send: createSignalSender({ from: "screen", screenId: id }),
      onStream: setStream,
      // Le serveur n'offre l'image (ou n'entend le mic) de cette caméra que si la liaison avec son téléphone est vive.
      onLink: createLinkReporter(id),
      log: (message) => console.warn(message),
    });
    const stop = watchScreen(id, number, kind, (event) => {
      if (event.kind === "phone") receiver.setPhonePresent(event.isPresent);
      else receiver.receive(event.signal);
    });
    return () => {
      stop();
      receiver.close();
    };
  }, [number, kind]);

  return stream;
};

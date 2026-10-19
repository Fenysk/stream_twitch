// La liaison d'un téléphone avec le serveur : son flux (numéro, page OBS, signaux, et l'état de la régie pour le Selfie) et l'envoi de sa
// caméra à la page OBS de son numéro. Le numéro pris est gardé sur le téléphone pour le retrouver à la prochaine ouverture.

import { useCallback, useEffect, useRef, useState } from "react";
import type { PhoneEvent, PhoneRole } from "../../domain/phone.schema";
import { IDLE_STANDING, type PictureStanding } from "../../domain/picture.schema";
import { createLinkReporter, createSignalSender, updatePhoneNumber, watchPhone } from "../mobile-api";
import { type CameraSender, createCameraSender, type LinkStatus } from "./camera-sender";
import { getPhoneId, getSavedNumber, updateSavedNumber } from "./mobile-storage";
import { openSenderPeer } from "./peer";
import { createRandomId } from "./random-id";
import { type ControlView, IDLE_VIEW } from "./use-control-state";

export type PhoneLink = {
  // `null` tant que le serveur n'a pas donné de numéro.
  number: number | null;
  status: LinkStatus;
  // Prend ce numéro de caméra : rend le refus du serveur à montrer, ou `null` quand c'est fait.
  updateNumber: (number: number) => Promise<string | null>;
  // L'état de la régie que le serveur donne au téléphone qui l'a (le Selfie) ; vide pour une Caméra, à qui il n'en envoie pas.
  control: ControlView;
  // La caméra de ce téléphone est à l'antenne : une de ses sources est visible dans la scène du programme d'OBS.
  isOnAir: boolean;
  // Le mic de ce téléphone est celui du live : l'entrée de sa source est ouverte dans OBS, et aucun mic avant lui. Le serveur le redit à
  // chaque changement, d'où qu'il vienne (le menu d'un autre téléphone, OBS à la main).
  isLiveMic: boolean;
  // Où en est l'image pour ce téléphone : OBS a une place caméra, il est à l'image, et qui l'est. Le serveur le redit à chaque changement,
  // d'où qu'il vienne (le menu de la régie, OBS à la main, le repli).
  standing: PictureStanding;
};

const schedule = (callback: () => void, ms: number): (() => void) => {
  const timer = setTimeout(callback, ms);
  return () => clearTimeout(timer);
};

type EventTargets = {
  link: CameraSender<MediaStream>;
  setNumber: (number: number | null) => void;
  setControl: (view: ControlView) => void;
  setOnAir: (isOnAir: boolean) => void;
  setLiveMic: (isLiveMic: boolean) => void;
  setStanding: (standing: PictureStanding) => void;
};

// Ce que le serveur dit à un téléphone qui filme : son numéro (gardé), la page OBS de ce numéro, les signaux de cette page, si sa caméra
// est à l'antenne, si son mic est celui du live et, au Selfie, l'état de la régie.
const applyEvent = (
  event: PhoneEvent,
  { link, setNumber, setControl, setOnAir, setLiveMic, setStanding }: EventTargets,
): void => {
  switch (event.kind) {
    case "number":
      setNumber(event.number);
      if (event.number !== null) updateSavedNumber(event.number);
      return;
    case "screen":
      link.setScreen(event.screenId);
      return;
    case "signal":
      link.receive(event.signal);
      return;
    case "control":
      setControl({ state: event.state, receivedAt: Date.now() });
      return;
    case "air":
      setOnAir(event.isOnAir);
      return;
    case "mic":
      setLiveMic(event.isLive);
      return;
    case "picture":
      setStanding(event.standing);
      return;
  }
};

// Ce que le téléphone dit au serveur de sa caméra : elle filme ou elle est arrêtée (Safari en arrière-plan, un appel). Le serveur ne connaît
// le téléphone qu'une fois son flux ouvert (`isOpen`) : avant, rien ne part ; à l'ouverture, et à chaque réouverture, le téléphone redit où
// il en est.
type FilmingReport = { isOpen: boolean; isFilming: boolean; send: ((isFilming: boolean) => void) | null };

const tellFilming = ({ isOpen, isFilming, send }: FilmingReport): void => {
  if (isOpen) send?.(isFilming);
};

export const usePhoneLink = (role: PhoneRole, stream: MediaStream | null): PhoneLink => {
  const [number, setNumber] = useState<number | null>(null);
  const [status, setStatus] = useState<LinkStatus>("waiting");
  const [control, setControl] = useState<ControlView>(IDLE_VIEW);
  const [isOnAir, setOnAir] = useState(false);
  const [isLiveMic, setLiveMic] = useState(false);
  const [standing, setStanding] = useState<PictureStanding>(IDLE_STANDING);
  const sender = useRef<CameraSender<MediaStream> | null>(null);
  const phoneId = useRef("");
  const filming = useRef<FilmingReport>({ isOpen: false, isFilming: false, send: null });

  useEffect(() => {
    const id = getPhoneId();
    phoneId.current = id;
    filming.current.send = createLinkReporter({ from: "phone", phoneId: id });
    const link = createCameraSender<MediaStream>({
      openPeer: openSenderPeer,
      send: createSignalSender({ from: "phone", phoneId: id }),
      schedule,
      createId: createRandomId,
      onStatus: setStatus,
      log: (message) => console.warn(message),
    });
    sender.current = link;
    const stop = watchPhone({
      id,
      role,
      getNumber: getSavedNumber,
      // Le flux se rouvre : la page OBS a lâché la liaison quand il s'est fermé, le serveur redira sa page et la liaison repart.
      onOpen: () => {
        filming.current.isOpen = true;
        link.setScreen(null);
        tellFilming(filming.current);
      },
      onEvent: (event) =>
        applyEvent(event, { link, setNumber, setControl, setOnAir, setLiveMic, setStanding }),
    });
    return () => {
      stop();
      link.close();
      sender.current = null;
      filming.current.isOpen = false;
      filming.current.send = null;
    };
  }, [role]);

  useEffect(() => {
    filming.current.isFilming = stream !== null;
    sender.current?.setStream(stream);
    tellFilming(filming.current);
  }, [stream]);

  const updateNumber = useCallback(async (wanted: number): Promise<string | null> => {
    const answer = await updatePhoneNumber(phoneId.current, wanted);
    if (!answer.ok) return answer.message;
    setNumber(answer.value);
    updateSavedNumber(answer.value);
    return null;
  }, []);

  return { number, status, updateNumber, control, isOnAir, isLiveMic, standing };
};

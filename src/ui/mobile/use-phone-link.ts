// La liaison d'un téléphone avec le serveur : son flux, ouvert une fois qu'il filme ou non (l'état de la régie, puis, quand il filme, son
// numéro, les pages OBS de ce numéro et leurs signaux) et l'envoi de sa caméra à OBS en deux liaisons WebRTC : la piste vidéo à la page image
// de son numéro, la piste audio à sa page mic (OBS ne mixe pas le son d'une source cachée : le mic a sa propre source). Le numéro pris est
// gardé sur le téléphone pour le retrouver à la prochaine ouverture.

import { useCallback, useEffect, useRef, useState } from "react";
import type { PhoneEvent, ScreenKind } from "../../domain/phone.schema";
import { IDLE_STANDING, type PictureStanding } from "../../domain/picture.schema";
import {
  createFilmReporter,
  createSignalSender,
  type FilmReport,
  updatePhoneNumber,
  watchPhone,
} from "../mobile-api";
import { type CameraSender, createCameraSender, type LinkStatus } from "./camera-sender";
import { type ControlView, IDLE_VIEW, toStaleView } from "./control-view";
import { getPhoneId, getSavedNumber, updateSavedNumber } from "./mobile-storage";
import { openSenderPeer } from "./peer";
import { createRandomId } from "./random-id";
import { createTrackStreams } from "./track-streams";

export type PhoneLink = {
  // `null` tant que le serveur n'a pas donné de numéro : il en donne un au premier Filmer, et le reprend quand le téléphone arrête de filmer.
  number: number | null;
  // Où en est la liaison de l'image avec OBS (celle que la pastille du numéro montre).
  status: LinkStatus;
  // Prend ce numéro de caméra : rend le refus du serveur à montrer, ou `null` quand c'est fait.
  updateNumber: (number: number) => Promise<string | null>;
  // L'état de la régie que le serveur donne à tout téléphone, qu'il filme ou non, avec ce que dit le flux de sa fraîcheur (`staleAt`).
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

// Une liaison par sorte de page OBS : l'image et le mic.
type Links = Record<ScreenKind, CameraSender<MediaStream>>;

const ignoreStatus = (): void => undefined;

const createLink = (
  phoneId: string,
  screenKind: ScreenKind,
  onStatus: (status: LinkStatus) => void,
): CameraSender<MediaStream> =>
  createCameraSender<MediaStream>({
    openPeer: openSenderPeer,
    send: createSignalSender({ from: "phone", phoneId, screenKind }),
    schedule,
    createId: createRandomId,
    onStatus,
    log: (message) => console.warn(message),
  });

type EventTargets = {
  links: Links;
  setNumber: (number: number | null) => void;
  setControl: (view: ControlView) => void;
  setOnAir: (isOnAir: boolean) => void;
  setLiveMic: (isLiveMic: boolean) => void;
  setStanding: (standing: PictureStanding) => void;
};

// Ce que le serveur dit à un téléphone : l'état de la régie, et, quand il filme, son numéro (gardé), la page OBS de ce numéro pour chaque
// sorte, les signaux de ces pages, si sa caméra est à l'antenne et si son mic est celui du live.
const applyEvent = (
  event: PhoneEvent,
  { links, setNumber, setControl, setOnAir, setLiveMic, setStanding }: EventTargets,
): void => {
  switch (event.kind) {
    case "number":
      setNumber(event.number);
      if (event.number !== null) updateSavedNumber(event.number);
      return;
    case "screen":
      links[event.screenKind].setScreen(event.screenId);
      return;
    case "signal":
      links[event.screenKind].receive(event.signal);
      return;
    case "control":
      setControl({ state: event.state, receivedAt: Date.now(), staleAt: null });
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

// Ce que le téléphone dit au serveur de sa caméra : Filmer est appuyé ou non (`isCamera`), et elle envoie une image ou elle est arrêtée
// (Safari en arrière-plan, un appel). Le serveur ne connaît le téléphone qu'une fois son flux ouvert (`isOpen`) : avant, rien ne part ; à
// l'ouverture, et à chaque réouverture, le téléphone redit où il en est. Le flux ne se rouvre jamais pour cela.
type FilmingReport = FilmReport & { isOpen: boolean; send: ((report: FilmReport) => void) | null };

const tellFilming = ({ isOpen, isCamera, isFilming, send }: FilmingReport): void => {
  if (isOpen) send?.({ isCamera, isFilming });
};

export const usePhoneLink = (isCamera: boolean, stream: MediaStream | null): PhoneLink => {
  const [number, setNumber] = useState<number | null>(null);
  const [status, setStatus] = useState<LinkStatus>("waiting");
  const [control, setControl] = useState<ControlView>(IDLE_VIEW);
  const [isOnAir, setOnAir] = useState(false);
  const [isLiveMic, setLiveMic] = useState(false);
  const [standing, setStanding] = useState<PictureStanding>(IDLE_STANDING);
  const links = useRef<Links | null>(null);
  const phoneId = useRef("");
  const filming = useRef<FilmingReport>({ isOpen: false, isCamera, isFilming: false, send: null });
  // La vidéo seule pour l'image et l'audio seul pour le mic : le même flux tant que la piste ne change pas, pour ne pas relancer une liaison.
  const [toTrackStreams] = useState(() =>
    createTrackStreams((track: MediaStreamTrack) => new MediaStream([track])),
  );
  const { image, mic } = toTrackStreams(
    stream?.getVideoTracks()[0] ?? null,
    stream?.getAudioTracks()[0] ?? null,
  );

  useEffect(() => {
    const id = getPhoneId();
    phoneId.current = id;
    filming.current.send = createFilmReporter(id);
    const opened: Links = {
      image: createLink(id, "image", setStatus),
      mic: createLink(id, "mic", ignoreStatus),
    };
    links.current = opened;
    const stop = watchPhone({
      id,
      getNumber: getSavedNumber,
      // Le flux se rouvre : les pages OBS ont lâché la liaison quand il s'est fermé, le serveur redira leurs identifiants et les liaisons
      // repartent.
      onOpen: () => {
        filming.current.isOpen = true;
        for (const link of Object.values(opened)) link.setScreen(null);
        tellFilming(filming.current);
      },
      onStale: (isStale) => setControl((previous) => toStaleView(previous, isStale, Date.now())),
      onEvent: (event) =>
        applyEvent(event, { links: opened, setNumber, setControl, setOnAir, setLiveMic, setStanding }),
    });
    return () => {
      stop();
      for (const link of Object.values(opened)) link.close();
      links.current = null;
      filming.current.isOpen = false;
      filming.current.send = null;
    };
  }, []);

  useEffect(() => {
    filming.current.isCamera = isCamera;
    filming.current.isFilming = isCamera && stream !== null;
    tellFilming(filming.current);
  }, [isCamera, stream]);

  useEffect(() => {
    links.current?.image.setStream(image);
  }, [image]);

  useEffect(() => {
    links.current?.mic.setStream(mic);
  }, [mic]);

  // Arrêter de filmer : ce que le serveur disait de la caméra (à l'antenne, micro, plan) ne vaut plus ; il le redit au prochain Filmer.
  useEffect(() => {
    if (isCamera) return;
    setOnAir(false);
    setLiveMic(false);
    setStanding(IDLE_STANDING);
  }, [isCamera]);

  const updateNumber = useCallback(async (wanted: number): Promise<string | null> => {
    const answer = await updatePhoneNumber(phoneId.current, wanted);
    if (!answer.ok) return answer.message;
    setNumber(answer.value);
    updateSavedNumber(answer.value);
    return null;
  }, []);

  return { number, status, updateNumber, control, isOnAir, isLiveMic, standing };
};

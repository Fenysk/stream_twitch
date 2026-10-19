// Les deux bouts d'une liaison WebRTC, branchés sur le navigateur : le téléphone qui envoie sa caméra, la page OBS qui la reçoit. Pas de
// serveur STUN ni TURN (`iceServers: []`) : l'image et le son restent sur le réseau local, et les candidats arrivent au fil de l'eau.
// Le WebRTC ne se teste pas sous node : toute la logique est dans camera-sender.ts et camera-receiver.ts, qui n'en voient que ce port.

import type { Candidate } from "../../domain/phone.schema";
import { toPreferredCodecs, VIDEO_MAX_BITRATE } from "./camera-media";
import type { ReceiverListener, ReceiverPeer } from "./camera-receiver";
import type { SenderListener, SenderPeer } from "./camera-sender";

const NO_ICE_SERVERS: RTCConfiguration = { iceServers: [] };

const toCandidate = ({ candidate, sdpMid, sdpMLineIndex }: RTCIceCandidate): Candidate => ({
  candidate,
  sdpMid,
  sdpMLineIndex,
});

const toDescription = (connection: RTCPeerConnection): string => {
  const description = connection.localDescription?.sdp;
  if (!description) throw new Error("la description locale est vide");
  return description;
};

// Dit à chaque transceiver vidéo de préférer H.264 ; un navigateur qui refuse garde son ordre.
const preferH264 = (connection: RTCPeerConnection): void => {
  const codecs = RTCRtpSender.getCapabilities("video")?.codecs;
  if (!codecs) return;
  for (const transceiver of connection.getTransceivers()) {
    if (transceiver.sender.track?.kind !== "video") continue;
    try {
      transceiver.setCodecPreferences(toPreferredCodecs(codecs));
    } catch (error) {
      console.warn("Caméra : le navigateur garde son ordre de codecs", error);
    }
  }
};

// Plafonne le débit de l'image une fois l'offre posée (c'est alors que les encodages existent).
const limitBitrate = async (connection: RTCPeerConnection): Promise<void> => {
  for (const sender of connection.getSenders()) {
    if (sender.track?.kind !== "video") continue;
    const parameters = sender.getParameters();
    const [first, ...others] = parameters.encodings;
    if (!first) continue;
    try {
      await sender.setParameters({
        ...parameters,
        encodings: [{ ...first, maxBitrate: VIDEO_MAX_BITRATE }, ...others],
      });
    } catch (error) {
      console.warn("Caméra : le débit de l'image n'est pas plafonné", error);
    }
  }
};

const replaceTracks = async (connection: RTCPeerConnection, stream: MediaStream): Promise<void> => {
  await Promise.all(
    connection
      .getSenders()
      .map((sender) =>
        sender.replaceTrack(stream.getTracks().find((track) => track.kind === sender.track?.kind) ?? null),
      ),
  );
};

export const openSenderPeer = (
  stream: MediaStream,
  { onCandidate, onState }: SenderListener,
): SenderPeer<MediaStream> => {
  const connection = new RTCPeerConnection(NO_ICE_SERVERS);
  for (const track of stream.getTracks()) connection.addTrack(track, stream);
  preferH264(connection);
  connection.onicecandidate = ({ candidate }) => {
    if (candidate) onCandidate(toCandidate(candidate));
  };
  connection.onconnectionstatechange = () => onState(connection.connectionState);
  return {
    async offer() {
      await connection.setLocalDescription(await connection.createOffer());
      await limitBitrate(connection);
      return toDescription(connection);
    },
    accept: (description) => connection.setRemoteDescription({ type: "answer", sdp: description }),
    addCandidate: (candidate) => connection.addIceCandidate(candidate),
    replaceStream: (next) => replaceTracks(connection, next),
    close: () => connection.close(),
  };
};

export const openReceiverPeer = ({
  onCandidate,
  onStream,
  onState,
}: ReceiverListener<MediaStream>): ReceiverPeer => {
  const connection = new RTCPeerConnection(NO_ICE_SERVERS);
  connection.ontrack = ({ streams }) => {
    const [stream] = streams;
    if (stream) onStream(stream);
  };
  connection.onicecandidate = ({ candidate }) => {
    if (candidate) onCandidate(toCandidate(candidate));
  };
  connection.onconnectionstatechange = () => onState(connection.connectionState);
  return {
    async answer(offer) {
      await connection.setRemoteDescription({ type: "offer", sdp: offer });
      await connection.setLocalDescription(await connection.createAnswer());
      return toDescription(connection);
    },
    addCandidate: (candidate) => connection.addIceCandidate(candidate),
    close: () => connection.close(),
  };
};

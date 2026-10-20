// Un flux par sorte de piste, tiré de la caméra du téléphone : la piste vidéo seule vers la page image d'OBS, la piste audio seule vers sa
// page mic (deux liaisons WebRTC). `Track` est une piste (un MediaStreamTrack dans le navigateur), `Stream` le flux qui n'en porte qu'une.

export type TrackStreams<Stream> = { image: Stream | null; mic: Stream | null };

// Un flux dérivé est le même objet tant que sa piste ne change pas : le rendre à chaque rendu relancerait la liaison. Changer de caméra
// remplace la piste vidéo sans toucher à celle du mic, dont la liaison reste donc intacte.
const createTrackStream = <Track, Stream>(open: (track: Track) => Stream) => {
  let last: { track: Track; stream: Stream } | null = null;
  return (track: Track | null): Stream | null => {
    if (track === null) {
      last = null;
      return null;
    }
    if (last?.track !== track) last = { track, stream: open(track) };
    return last.stream;
  };
};

export const createTrackStreams = <Track, Stream>(open: (track: Track) => Stream) => {
  const toImage = createTrackStream(open);
  const toMic = createTrackStream(open);
  return (video: Track | null, audio: Track | null): TrackStreams<Stream> => ({
    image: toImage(video),
    mic: toMic(audio),
  });
};

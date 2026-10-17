import { toByteRange } from "../../domain/video-range.rules";
import type { ClipKind, ClipVideoSource } from "../../usecase/clip.usecase";
import { refuse } from "./http";
import { getRuntime } from "./runtime";

// Sert une vidéo en flux depuis le disque : tout le fichier (200), ou l'intervalle demandé par `Range` (206). Sans cela, un
// lecteur ne peut pas se déplacer dans un fichier de 250 Mo. Le fichier n'est jamais lu en entier en mémoire.
export const toVideoResponse = (
  video: ClipVideoSource & { mime: string },
  rangeHeader: string | null,
): Response => {
  const headers = { "content-type": video.mime, "accept-ranges": "bytes", "cache-control": "no-store" };
  const range = toByteRange(rangeHeader, video.size);
  if (range.kind === "unsatisfiable") {
    return new Response(null, {
      status: 416,
      headers: { ...headers, "content-range": `bytes */${video.size}` },
    });
  }
  if (range.kind === "partial") {
    return new Response(video.read(range.start, range.end), {
      status: 206,
      headers: {
        ...headers,
        "content-length": String(range.end - range.start + 1),
        "content-range": `bytes ${range.start}-${range.end}/${video.size}`,
      },
    });
  }
  const body = video.size === 0 ? null : video.read(0, video.size - 1);
  return new Response(body, { headers: { ...headers, "content-length": String(video.size) } });
};

// La vidéo d'un clip du dossier brut, de Confirmés ou de Traités, désigné par son nom de fichier (`?name=`) : le serveur ne sert que
// des fichiers vidéo directs de ce dossier. `?v=` : la version reçue avec le clip ; une vidéo remplacée depuis n'est pas servie.
export const serveClipVideo = (kind: ClipKind, request: Request): Response => {
  if (request.method !== "GET") return refuse(405, "méthode non permise");
  const name = new URL(request.url, "http://localhost").searchParams.get("name") ?? "";
  const version = new URL(request.url, "http://localhost").searchParams.get("v") ?? undefined;
  const video = getRuntime().clips.getVideo(kind, name, version);
  return video.ok
    ? toVideoResponse(video.value, request.headers.get("range"))
    : refuse(video.status, video.message);
};

import { SoundInputSchema } from "../../domain/sound.schema";
import { fromBase64 } from "../../shared/base64";
import { toIssuesMessage } from "../../shared/zod-issues";
import type { SoundDraft } from "../../usecase/sound.usecase";
import { getBodyJson, isJson, refuse } from "./http";

// 5 Mo d'audio pèsent 6,7 Mo en base64 : au-delà de 8 Mo, la demande est refusée avant d'être lue.
const MAX_BODY_BYTES = 8 * 1024 * 1024;

// Un fichier illisible (pas du base64) reste vide : la bibliothèque le refuse comme « pas un mp3, un wav ou un ogg ».
const NOT_AUDIO = new Uint8Array(0);

// Lit la demande de création ou de modification : le son à enregistrer, ou la réponse qui la refuse.
export async function getSoundDraft(request: Request): Promise<SoundDraft | Response> {
  if (!isJson(request)) return refuse(415, "le corps doit être du JSON (content-type: application/json)");
  if (Number(request.headers.get("content-length") ?? 0) > MAX_BODY_BYTES) {
    return refuse(413, "demande trop lourde");
  }
  const parsed = SoundInputSchema.safeParse(await getBodyJson(request));
  if (!parsed.success) return refuse(400, toIssuesMessage(parsed.error));
  const { file, rewardId, ...fields } = parsed.data;
  return {
    ...fields,
    ...(file === undefined ? {} : { file: fromBase64(file) ?? NOT_AUDIO }),
    ...(rewardId === undefined ? {} : { rewardId }),
  };
}

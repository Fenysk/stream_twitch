import {
  type ClipFile,
  type ConfirmChoice,
  isClipName,
  isSameTrim,
  toClipMime,
  toConfirmChoice,
  toRawClips,
  toStoredConfirmation,
} from "../domain/clip.rules";
import type {
  ClipChat,
  ClipConfirmation,
  ClipDone,
  ClipList,
  ClipSummary,
  ConfirmRequest,
} from "../domain/clip.schema";
import type { Settings } from "../domain/settings.schema";
import type { ShowCues } from "../domain/show.schema";

// Un fichier vidéo du dossier et son chemin complet (de quoi le sonder).
export type ClipEntry = ClipFile & { path: string };

// Un clip confirmé : le nom de sa vidéo (dans Confirmés), ce que son JSON dit, la version de sa vidéo (date et taille du fichier),
// et le nom de son clip brut dans Traités (`null` : il n'y est plus).
export type ConfirmedClip = Omit<ClipConfirmation, "processedName"> & {
  name: string;
  version: string;
  processedName: string | null;
};

// Un fichier vidéo ouvert : sa taille, sa version, et de quoi lire un intervalle d'octets (bornes comprises) sans le charger en mémoire.
export type ClipVideoSource = {
  size: number;
  version: string;
  read(start: number, end: number): ReadableStream<Uint8Array>;
};

// Le dossier brut, Confirmés, ou Traités.
export type ClipKind = "raw" | "confirmed" | "processed";

// Ce que valider (ou recoder) un clip va écrire : le clip brut à lire, le fichier partiel du recodage (dans Confirmés), et le nom que
// le clip confirmé portera une fois fini (libre dans Confirmés pour une validation : rien n'est écrasé).
export type ConfirmPlan = { inputPath: string; outputPath: string; name: string };

// Le disque vu du usecase : infra l'implémente. Ces appels peuvent lever (dossier introuvable, disque illisible).
export type ClipStore = {
  // Les fichiers directement dans le dossier, pas ceux de ses sous-dossiers.
  listRaw(folder: string): ClipEntry[];
  // Les clips de Confirmés dont la vidéo et le JSON sont là.
  listConfirmed(folder: string): ConfirmedClip[];
  // La vidéo `name` du dossier brut, de Confirmés ou de Traités ; rien si elle n'y est pas.
  openVideo(folder: string, kind: ClipKind, name: string): ClipVideoSource | undefined;
  // Prépare Confirmés (créé s'il manque) pour le clip brut `rawName` ; rien s'il n'est pas dans le dossier.
  planConfirm(folder: string, rawName: string): ConfirmPlan | undefined;
  // Le recodage a réussi : le fichier partiel devient le clip confirmé, son JSON s'écrit à côté (avec le nom que le clip brut prend
  // dans Traités, et le chat du clip brut s'il existe), puis le clip brut passe dans Traités. Si une étape échoue, ce qui vient
  // d'être créé part et le clip brut reste.
  commitConfirm(folder: string, rawName: string, plan: ConfirmPlan, confirmation: ClipConfirmation): void;
  // Le recodage a échoué : le fichier partiel part.
  cancelConfirm(plan: ConfirmPlan): void;
  // Jeter : le clip brut (et son chat) passe dans Traités. Rend son nom là-bas ; rien s'il n'est pas dans le dossier.
  moveToProcessed(folder: string, rawName: string): string | undefined;
  // Le JSON du clip confirmé `name` se réécrit ; sa vidéo ne bouge pas.
  updateConfirmation(folder: string, name: string, confirmation: ClipConfirmation): void;
  // Prépare un nouveau recodage du clip confirmé `name` depuis son clip brut `processedName` de Traités ; rien si l'un des deux manque.
  planReplace(folder: string, name: string, processedName: string): ConfirmPlan | undefined;
  // Le recodage a réussi : la vidéo remplacée passe dans Traités (Windows refuse de l'écraser quand `/show` la lit), le fichier
  // partiel prend sa place et le JSON se réécrit. Si une étape échoue, l'ancienne vidéo revient.
  commitReplace(folder: string, plan: ConfirmPlan, confirmation: ClipConfirmation): Promise<void>;
  // Retirer de l'émission : la vidéo confirmée, son JSON et son chat passent dans Traités. Rend le nom de la vidéo là-bas ; rien si
  // le clip confirmé n'existe pas.
  withdraw(folder: string, name: string): Promise<string | undefined>;
  // Le chemin de la vidéo `name` du dossier brut, de Confirmés ou de Traités ; rien si elle n'y est pas.
  pathOf(folder: string, kind: ClipKind, name: string): string | undefined;
  // Le tchat gardé à côté du clip confirmé `name` ; rien s'il n'y en a pas, ou s'il est illisible.
  getChat(folder: string, name: string): ClipChat | undefined;
};

// ffprobe vu du usecase : la durée d'un fichier en secondes, rien s'il ne la lit pas.
export type ClipProbe = { probe(path: string): Promise<number | undefined> };

// ffmpeg vu du usecase : le level (dB, le pic) de chaque fenêtre de 50 ms du premier son d'un fichier, rien s'il ne le mesure pas.
export type ClipLevels = { listLevels(path: string): Promise<number[] | undefined> };

// La partie `start` à `end` (secondes) du clip `inputPath`, recodée vers `outputPath`.
export type TrimRequest = { inputPath: string; outputPath: string; start: number; end: number };
export type EncodeResult = { ok: true; encoder: string } | { ok: false; message: string };

// ffmpeg vu du usecase : le recodage ne lève pas, il dit pourquoi il a échoué.
export type ClipEncoder = { trim(request: TrimRequest): Promise<EncodeResult> };

export type ClipFailure = { ok: false; status: 400 | 404 | 409 | 502 | 503; message: string };
export type ClipListResult = { ok: true; value: ClipList } | ClipFailure;
export type ClipVideoResult = { ok: true; value: ClipVideoSource & { mime: string } } | ClipFailure;
export type ClipDoneResult = { ok: true; value: ClipDone } | ClipFailure;
export type ConfirmedListResult = { ok: true; value: ConfirmedClip[] } | ClipFailure;
export type ShowCuesResult = { ok: true; value: ShowCues } | ClipFailure;

// Les réglages que la bibliothèque des clips applique : le dossier, les règles du sursaut (les spikes du son d'un clip), la durée d'un
// sursaut, et l'avance du tchat.
export type ClipSettings = Pick<
  Settings,
  | "showClipsFolder"
  | "foxStartleRise"
  | "foxStartleWithin"
  | "foxStartleLevel"
  | "foxStartleGap"
  | "foxReactionDuration"
  | "showChatLead"
>;

// Ce que la page `/show` demande d'un clip avant de le jouer : les spikes de son son (mesurés une fois avec ffmpeg, gardés dans son JSON)
// et son tchat placé sur le clip.
export type ClipAnalysis = {
  update(settings: ClipSettings): void;
  // Mesure le son du clip confirmé `name` et garde ses spikes dans son JSON. Ne lève jamais : le journal dit l'échec.
  refreshSpikes(folder: string, name: string): Promise<void>;
  // `version` : celle que la page a reçue avec le clip ; une vidéo remplacée depuis n'est pas analysée à sa place.
  getShowCues(folder: string, name: string, version?: string): Promise<ShowCuesResult>;
};

export type ClipLibraryDeps = {
  store: ClipStore;
  probe: ClipProbe;
  encoder: ClipEncoder;
  analysis: ClipAnalysis;
  clock: () => number;
  log: (message: string) => void;
};

export type ClipLibrary = {
  // Le réglage du dossier, appliqué aussitôt.
  update(settings: ClipSettings): void;
  list(): Promise<ClipListResult>;
  // `version` : celle que la page a reçue avec le clip ; une vidéo remplacée depuis n'est pas servie à sa place.
  getVideo(kind: ClipKind, name: string, version?: string): ClipVideoResult;
  // Les clips confirmés (vidéo et JSON dans Confirmés) : ceux que la page `/show` passe.
  listConfirmed(): ConfirmedListResult;
  // Valider : recode la partie choisie vers Confirmés avec son JSON, puis range le clip brut dans Traités. Un clip à la fois.
  confirm(request: ConfirmRequest): Promise<ClipDoneResult>;
  // Jeter : le clip brut passe dans Traités, sans clip confirmé.
  discard(name: string): Promise<ClipDoneResult>;
  // Modifier un clip confirmé : titre et phrase seuls réécrivent son JSON ; un autre début ou une autre fin le recodent depuis son
  // clip brut de Traités. `request.name` est le nom de sa vidéo dans Confirmés.
  revise(request: ConfirmRequest): Promise<ClipDoneResult>;
  // Retirer un clip confirmé de l'émission : sa vidéo, son JSON et son chat passent dans Traités.
  withdraw(name: string): Promise<ClipDoneResult>;
  // L'émission passe ce clip confirmé : son nombre de passages (dans son JSON) monte de un. Ne lève jamais, le journal dit l'échec.
  notePlayed(name: string): void;
  // Ce que la page `/show` demande d'un clip confirmé avant de le jouer : son tchat placé sur le clip, les instants où son son fait
  // sursauter Jean-Renard (mesurés à la demande pour un clip d'avant), et la durée d'un sursaut.
  getShowCues(name: string, version?: string): Promise<ShowCuesResult>;
};

// ffprobe démarre un processus par fichier : quatre à la fois, pas un par clip du dossier.
const PROBE_PARALLEL = 4;

const NO_FOLDER: ClipFailure = {
  ok: false,
  status: 503,
  message: "le dossier des clips n'est pas réglé (showClipsFolder dans settings.json)",
};
const toFolderMissing = (clipsFolder: string): ClipFailure => ({
  ok: false,
  status: 404,
  message: `le dossier des clips est introuvable : ${clipsFolder}`,
});
const NOT_A_CLIP: ClipFailure = { ok: false, status: 400, message: "ce n'est pas un nom de clip" };
const NOT_FOUND: ClipFailure = { ok: false, status: 404, message: "clip introuvable" };
const BUSY: ClipFailure = { ok: false, status: 409, message: "un clip est déjà en cours de traitement" };
const STALE: ClipFailure = { ok: false, status: 404, message: "cette version du clip n'existe plus" };
const RAW_MISSING: ClipFailure = {
  ok: false,
  status: 409,
  message: "le clip brut d'origine n'est plus dans Traités : seuls le titre et la phrase se modifient",
};

const toMessage = (error: unknown): string => (error instanceof Error ? error.message : String(error));

const toStoreFailure = (error: unknown): ClipFailure => ({
  ok: false,
  status: 502,
  message: `le clip n'a pas pu être rangé : ${toMessage(error)}`,
});

// Ce que le JSON d'un clip confirmé garde : ce qu'Alexis vient de choisir (ses rires compris : sans eux, plus de rires), et le reste tel
// quel (date de validation, clip brut, nombre de passages, spikes).
const toConfirmation = (clip: ConfirmedClip, choice: ConfirmChoice): ClipConfirmation => {
  const { laughs, ...stored } = toStoredConfirmation(clip);
  return { ...stored, ...choice };
};

// Le clip confirmé tel que son JSON le dit maintenant, ou celui qu'on a si le disque ne le retrouve pas.
const toLatest = (store: ClipStore, folder: string, clip: ConfirmedClip): ConfirmedClip =>
  store.listConfirmed(folder).find(({ name }) => name === clip.name) ?? clip;

// Un passage de plus dans le JSON du clip confirmé `name` ; une panne du disque se dit, elle ne lève pas.
const countPlay = (store: ClipStore, folder: string, name: string, log: (message: string) => void): void => {
  try {
    const clip = store.listConfirmed(folder).find((candidate) => candidate.name === name);
    if (!clip) return;
    store.updateConfirmation(folder, name, {
      ...toStoredConfirmation(clip),
      playCount: (clip.playCount ?? 0) + 1,
    });
  } catch (error) {
    log(`Clips : « ${name} » : passage non compté, ${toMessage(error)}`);
  }
};

// La durée du clip brut se garde dans le JSON, de quoi placer son tchat sur le clip : une durée nulle n'est pas une durée.
const toRawDuration = (duration: number): { rawDuration?: number } =>
  duration > 0 ? { rawDuration: duration } : {};

export function createClipLibrary({
  store,
  probe,
  encoder,
  analysis,
  clock,
  log,
}: ClipLibraryDeps): ClipLibrary {
  let folder: string | undefined;
  // Valider, jeter, modifier ou retirer un clip occupe le disque (et le GPU) : un seul à la fois.
  let isBusy = false;
  // La durée d'un fichier ne change pas tant que son nom, sa taille et sa date ne changent pas.
  const durations = new Map<string, number>();

  const toKey = ({ name, size, modifiedAt }: ClipEntry): string => `${name}|${size}|${modifiedAt}`;

  const toSummary = async (file: ClipEntry): Promise<ClipSummary> => {
    const key = toKey(file);
    const known = durations.get(key);
    if (known !== undefined) return { name: file.name, modifiedAt: file.modifiedAt, duration: known };
    const duration = await probe.probe(file.path);
    if (duration === undefined) log(`Clips : durée de « ${file.name} » illisible (ffprobe).`);
    else durations.set(key, duration);
    return { name: file.name, modifiedAt: file.modifiedAt, duration: duration ?? null };
  };

  const toSummaries = async (files: readonly ClipEntry[]): Promise<ClipSummary[]> => {
    const waiting = [...files.entries()];
    const summaries: ClipSummary[] = [];
    const work = async (): Promise<void> => {
      for (let next = waiting.shift(); next; next = waiting.shift()) {
        const [index, file] = next;
        summaries[index] = await toSummary(file);
      }
    };
    await Promise.all(Array.from({ length: PROBE_PARALLEL }, work));
    return summaries;
  };

  // Un seul travail à la fois, et le verrou se rend quoi qu'il arrive. Une panne du disque se dit, elle ne fait pas planter la route.
  const alone = async (
    name: string,
    work: (clipsFolder: string) => Promise<ClipDoneResult>,
  ): Promise<ClipDoneResult> => {
    if (folder === undefined) return NO_FOLDER;
    if (isBusy) return BUSY;
    if (!isClipName(name)) return NOT_A_CLIP;
    isBusy = true;
    try {
      return await work(folder);
    } catch (error) {
      log(`Clips : « ${name} » : ${toMessage(error)}`);
      return toStoreFailure(error);
    } finally {
      isBusy = false;
    }
  };

  // Recode la partie `start` à `end` vers le fichier partiel du plan ; un échec retire ce fichier partiel et se dit.
  const recode = async (
    plan: ConfirmPlan,
    label: string,
    { start, end }: { start: number; end: number },
  ): Promise<{ ok: true; encoder: string; ms: number } | ClipFailure> => {
    log(`Clips : « ${label} » : recodage de ${start} s à ${end} s…`);
    const startedAt = clock();
    const encoded = await encoder.trim({
      inputPath: plan.inputPath,
      outputPath: plan.outputPath,
      start,
      end,
    });
    if (encoded.ok) return { ...encoded, ms: clock() - startedAt };
    store.cancelConfirm(plan);
    log(`Clips : « ${label} » : recodage raté, rien ne bouge : ${encoded.message}`);
    return { ok: false, status: 502, message: encoded.message };
  };

  // Recode, puis range : tout ce qui est créé avant un échec est retiré, le clip brut ne bouge qu'à la toute fin.
  const confirmIn = async (clipsFolder: string, request: ConfirmRequest): Promise<ClipDoneResult> => {
    const plan = store.planConfirm(clipsFolder, request.name);
    if (!plan) return NOT_FOUND;
    const duration = await probe.probe(plan.inputPath);
    if (duration === undefined) {
      return { ok: false, status: 502, message: "la durée du clip est illisible (ffprobe)" };
    }
    const choice = toConfirmChoice(request, duration);
    if (!choice.ok) return { ok: false, status: 400, message: choice.message };
    const encoded = await recode(plan, request.name, choice.value);
    if (!encoded.ok) return encoded;
    try {
      const confirmedAt = new Date(clock()).toISOString();
      store.commitConfirm(clipsFolder, request.name, plan, {
        ...choice.value,
        ...toRawDuration(duration),
        rawName: request.name,
        confirmedAt,
      });
    } catch (error) {
      store.cancelConfirm(plan);
      log(`Clips : « ${request.name} » : rangement impossible, ${toMessage(error)}`);
      return toStoreFailure(error);
    }
    log(`Clips : « ${request.name} » confirmé en « ${plan.name} » (${encoded.encoder}, ${encoded.ms} ms).`);
    await analysis.refreshSpikes(clipsFolder, plan.name);
    return { ok: true, value: { name: plan.name } };
  };

  // Un autre début ou une autre fin : nouveau recodage depuis le clip brut de Traités, qui remplace la vidéo confirmée.
  const recodeIn = async (
    clipsFolder: string,
    clip: ConfirmedClip,
    request: ConfirmRequest,
  ): Promise<ClipDoneResult> => {
    const plan =
      clip.processedName === null ? undefined : store.planReplace(clipsFolder, clip.name, clip.processedName);
    if (!plan) return RAW_MISSING;
    const duration = await probe.probe(plan.inputPath);
    if (duration === undefined) {
      return { ok: false, status: 502, message: "la durée du clip brut est illisible (ffprobe)" };
    }
    const choice = toConfirmChoice(request, duration);
    if (!choice.ok) return { ok: false, status: 400, message: choice.message };
    const encoded = await recode(plan, clip.name, choice.value);
    if (!encoded.ok) return encoded;
    try {
      // Le recodage dure : un passage compté pendant ce temps reste dans le JSON réécrit. Les spikes de l'ancienne vidéo n'y sont plus.
      const { spikes, ...confirmation } = toConfirmation(toLatest(store, clipsFolder, clip), choice.value);
      await store.commitReplace(clipsFolder, plan, { ...confirmation, ...toRawDuration(duration) });
    } catch (error) {
      store.cancelConfirm(plan);
      log(`Clips : « ${clip.name} » : remplacement impossible, ${toMessage(error)}`);
      return toStoreFailure(error);
    }
    log(
      `Clips : « ${clip.name} » recodé de ${choice.value.start} s à ${choice.value.end} s (${encoded.encoder}, ${encoded.ms} ms).`,
    );
    await analysis.refreshSpikes(clipsFolder, clip.name);
    return { ok: true, value: { name: clip.name } };
  };

  // Titre et phrase seuls : le JSON se réécrit, la vidéo ne bouge pas (début et fin restent ceux du JSON).
  const reviseTextIn = (
    clipsFolder: string,
    clip: ConfirmedClip,
    request: ConfirmRequest,
  ): ClipDoneResult => {
    const choice = toConfirmChoice({ ...request, start: clip.start, end: clip.end }, clip.end);
    if (!choice.ok) return { ok: false, status: 400, message: choice.message };
    store.updateConfirmation(clipsFolder, clip.name, toConfirmation(clip, choice.value));
    log(`Clips : « ${clip.name} » : titre et phrase mis à jour.`);
    return { ok: true, value: { name: clip.name } };
  };

  const reviseIn = async (clipsFolder: string, request: ConfirmRequest): Promise<ClipDoneResult> => {
    const clip = store.listConfirmed(clipsFolder).find(({ name }) => name === request.name);
    if (!clip) return NOT_FOUND;
    return isSameTrim(request, clip)
      ? reviseTextIn(clipsFolder, clip, request)
      : recodeIn(clipsFolder, clip, request);
  };

  const withdrawIn = async (clipsFolder: string, name: string): Promise<ClipDoneResult> => {
    if (!store.listConfirmed(clipsFolder).some((clip) => clip.name === name)) return NOT_FOUND;
    const movedName = await store.withdraw(clipsFolder, name);
    if (movedName === undefined) return NOT_FOUND;
    log(`Clips : « ${name} » retiré de l'émission, rangé dans Traités.`);
    return { ok: true, value: { name: movedName } };
  };

  return {
    update(settings) {
      analysis.update(settings);
      if (settings.showClipsFolder === folder) return;
      folder = settings.showClipsFolder;
      log(`Clips : dossier « ${folder ?? "non réglé"} ».`);
    },
    getShowCues(name, version) {
      if (folder === undefined) return Promise.resolve(NO_FOLDER);
      if (!isClipName(name)) return Promise.resolve(NOT_A_CLIP);
      return analysis.getShowCues(folder, name, version);
    },
    async list() {
      if (folder === undefined) return NO_FOLDER;
      try {
        const files = toRawClips(store.listRaw(folder));
        const confirmed = store
          .listConfirmed(folder)
          .sort((a, b) => b.confirmedAt.localeCompare(a.confirmedAt));
        return {
          ok: true,
          value: { clips: await toSummaries(files), confirmedCount: confirmed.length, confirmed },
        };
      } catch (error) {
        log(`Clips : dossier illisible, ${toMessage(error)}`);
        return toFolderMissing(folder);
      }
    },
    listConfirmed() {
      if (folder === undefined) return NO_FOLDER;
      try {
        return { ok: true, value: store.listConfirmed(folder) };
      } catch (error) {
        log(`Clips : clips confirmés illisibles, ${toMessage(error)}`);
        return toFolderMissing(folder);
      }
    },
    getVideo(kind, name, version) {
      if (folder === undefined) return NO_FOLDER;
      if (!isClipName(name)) return NOT_A_CLIP;
      try {
        const source = store.openVideo(folder, kind, name);
        if (source && version !== undefined && source.version !== version) return STALE;
        if (source) return { ok: true, value: { ...source, mime: toClipMime(name) } };
      } catch (error) {
        log(`Clips : « ${name} » illisible, ${toMessage(error)}`);
      }
      return NOT_FOUND;
    },
    confirm: (request) => alone(request.name, (clipsFolder) => confirmIn(clipsFolder, request)),
    discard: (name) =>
      alone(name, async (clipsFolder) => {
        const processedName = store.moveToProcessed(clipsFolder, name);
        if (processedName === undefined) return NOT_FOUND;
        log(`Clips : « ${name} » jeté, rangé dans Traités.`);
        return { ok: true, value: { name: processedName } };
      }),
    revise: (request) => alone(request.name, (clipsFolder) => reviseIn(clipsFolder, request)),
    withdraw: (name) => alone(name, (clipsFolder) => withdrawIn(clipsFolder, name)),
    notePlayed(name) {
      if (folder !== undefined) countPlay(store, folder, name, log);
    },
  };
}

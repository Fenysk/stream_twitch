import { RegularsFileSchema } from "../domain/regulars.schema";
import type { RegularsPort } from "../usecase/fox-regulars.usecase";
import { createJsonFileStore } from "./json-file.gateway";

// Les viewers connus dans un fichier (data/viewers.json, hors de git).
export const createRegularsStore = (path: string, log: (message: string) => void): RegularsPort =>
  createJsonFileStore({ path, schema: RegularsFileSchema, empty: undefined, label: "Habitués" }, log);

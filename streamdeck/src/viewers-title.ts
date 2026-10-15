import { toViewersTitle } from "../../src/domain/viewers.rules";
import { ViewersStateSchema } from "../../src/domain/viewers.schema";
import { type FetchFn, readJson, SERVER_DOWN_TITLE, SERVER_TO_RESTART_TITLE } from "./server-request";

export type { FetchFn };

export const readViewersTitle = async (url: string, fetchFn: FetchFn = fetch): Promise<string> => {
  const read = await readJson(url, fetchFn);
  if (read.kind === "down") return SERVER_DOWN_TITLE;
  if (read.kind === "to-restart") return SERVER_TO_RESTART_TITLE;
  const state = ViewersStateSchema.safeParse(read.body);
  return state.success ? toViewersTitle(state.data) : SERVER_TO_RESTART_TITLE;
};

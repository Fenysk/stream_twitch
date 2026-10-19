import type { PictureSnapshot } from "./picture-feed";
import { SERVER_DOWN_TITLE, SERVER_TO_RESTART_TITLE } from "./server-request";

// Avant le premier message du flux, et quand OBS n'a pas de place caméra (pas de membre) ou aucun membre à l'image.
export const PICTURE_PENDING_TITLE = "Image\n…";
export const PICTURE_NO_PLACE_TITLE = "Place\ninconnue";
export const PICTURE_NONE_TITLE = "Image\n–";

// Ce que la touche « Image » écrit : le nom du membre à l'image (« PC », « Caméra 1 », « Tête »), ou pourquoi le serveur ne le donne pas.
export const toPictureTitle = (snapshot: PictureSnapshot): string => {
  switch (snapshot.status) {
    case "pending":
      return PICTURE_PENDING_TITLE;
    case "down":
      return SERVER_DOWN_TITLE;
    case "to-restart":
      return SERVER_TO_RESTART_TITLE;
    case "ready": {
      const { members, currentId } = snapshot.picture;
      if (members.length === 0) return PICTURE_NO_PLACE_TITLE;
      return members.find(({ id }) => id === currentId)?.label ?? PICTURE_NONE_TITLE;
    }
  }
};

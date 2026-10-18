import type { HeadView } from "../domain/head.types";
import { HeadViewSchema } from "../domain/head-view.schema";

// Un message du serveur qui porte la vue de la tête, que ce soit le flux de `/head` ou l'évènement `head` du flux de l'émission : sa
// vue part à `onView` ; un message illisible est dit dans la console.
export const toHeadListener =
  (onView: (view: HeadView) => void) =>
  (message: MessageEvent<string>): void => {
    const parsed = HeadViewSchema.safeParse(JSON.parse(message.data));
    if (parsed.success) onView(parsed.data);
    else console.error("Message du serveur illisible :", parsed.error.message);
  };

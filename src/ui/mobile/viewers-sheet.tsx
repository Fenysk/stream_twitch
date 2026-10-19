import { ChatViewersPanel } from "./chat-viewers-panel";
import { ControlDrawer } from "./control-drawer";
import { useChatViewers } from "./use-chat-viewers";

type ViewersSheetProps = { isOpen: boolean; onClose: () => void };

// La liste des viewers, ouverte par la pastille du nombre de viewers du bandeau : les personnes connectées au chat, lues chez Twitch à chaque
// ouverture. Une feuille comme les menus du bandeau, sœur du tiroir, après lui dans la page.
export const ViewersSheet = ({ isOpen, onClose }: ViewersSheetProps) => {
  const { view, refresh } = useChatViewers(isOpen);
  return (
    <ControlDrawer
      isOpen={isOpen}
      label="Viewers du tchat"
      closeLabel="Fermer la liste des viewers"
      onClose={onClose}
    >
      <ChatViewersPanel view={view} onRefresh={() => void refresh()} />
    </ControlDrawer>
  );
};

import { createFileRoute } from "@tanstack/react-router";
import { ChatColumn } from "../../ui/chat/chat-column";
import chatPageCss from "../../ui/chat/chat-page.css?url";
import { useChatView } from "../../ui/chat/use-chat-view";

// Fond transparent et aucune marge (chat-page.css) : OBS superpose la page à la scène. Rien tant que le serveur n'a pas envoyé l'allure.
const ChatPage = () => {
  const { messages, look } = useChatView();
  return look ? <ChatColumn messages={messages} look={look} layout="screen" /> : null;
};

export const Route = createFileRoute("/chat")({
  head: () => ({
    meta: [{ title: "Tchat" }],
    links: [{ rel: "stylesheet", href: chatPageCss }],
  }),
  component: ChatPage,
});

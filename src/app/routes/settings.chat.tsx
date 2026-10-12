import { createFileRoute } from "@tanstack/react-router";
import { ChatSettingsTab } from "../../ui/settings/chat-settings-tab";

export const Route = createFileRoute("/settings/chat")({ component: ChatSettingsTab });

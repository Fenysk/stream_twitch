import { createFileRoute } from "@tanstack/react-router";
import { TwitchSettingsTab } from "../../ui/settings/twitch-settings-tab";

export const Route = createFileRoute("/settings/twitch")({ component: TwitchSettingsTab });

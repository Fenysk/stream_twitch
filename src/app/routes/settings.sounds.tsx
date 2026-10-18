import { createFileRoute } from "@tanstack/react-router";
import { SoundsSettingsTab } from "../../ui/settings/sounds-settings-tab";

export const Route = createFileRoute("/settings/sounds")({ component: SoundsSettingsTab });

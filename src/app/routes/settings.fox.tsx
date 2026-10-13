import { createFileRoute } from "@tanstack/react-router";
import { FoxSettingsTab } from "../../ui/settings/fox-settings-tab";

export const Route = createFileRoute("/settings/fox")({ component: FoxSettingsTab });

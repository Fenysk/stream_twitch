import { createFileRoute } from "@tanstack/react-router";
import { ShowSettingsTab } from "../../ui/settings/show-settings-tab";

export const Route = createFileRoute("/settings/show")({ component: ShowSettingsTab });

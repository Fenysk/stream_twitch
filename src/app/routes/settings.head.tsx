import { createFileRoute } from "@tanstack/react-router";
import { HeadSettingsTab } from "../../ui/settings/head-settings-tab";

export const Route = createFileRoute("/settings/head")({ component: HeadSettingsTab });

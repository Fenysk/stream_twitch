import { createFileRoute } from "@tanstack/react-router";
import { MobileSettingsTab } from "../../ui/settings/mobile-settings-tab";

export const Route = createFileRoute("/settings/mobile")({ component: MobileSettingsTab });

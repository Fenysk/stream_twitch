import { createFileRoute } from "@tanstack/react-router";
import { RewardsSettingsTab } from "../../ui/settings/rewards-settings-tab";

export const Route = createFileRoute("/settings/rewards")({ component: RewardsSettingsTab });

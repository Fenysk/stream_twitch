import { createFileRoute } from "@tanstack/react-router";
import { CutTab } from "../../ui/settings/cut-tab";

export const Route = createFileRoute("/settings/cut")({ component: CutTab });

import { createFileRoute } from "@tanstack/react-router";
import { Head } from "../../ui/Head";
import { useHeadView } from "../../ui/use-head-view";

const HeadPage = () => {
  const view = useHeadView();
  return view ? <Head view={view} /> : null;
};

export const Route = createFileRoute("/head")({ component: HeadPage });

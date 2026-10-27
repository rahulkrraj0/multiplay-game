import { createFileRoute } from "@tanstack/react-router";
import { SeoPage, seoHead } from "../../playora/seo-pages";

export const Route = createFileRoute("/games/chess")({
  head: () => seoHead("chess"),
  component: () => <SeoPage page="chess" />,
});

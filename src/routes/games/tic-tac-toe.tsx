import { createFileRoute } from "@tanstack/react-router";
import { SeoPage, seoHead } from "../../playora/seo-pages";

export const Route = createFileRoute("/games/tic-tac-toe")({
  head: () => seoHead("tic-tac-toe"),
  component: () => <SeoPage page="tic-tac-toe" />,
});

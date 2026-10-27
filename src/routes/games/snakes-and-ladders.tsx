import { createFileRoute } from "@tanstack/react-router";
import { SeoPage, seoHead } from "../../playora/seo-pages";

export const Route = createFileRoute("/games/snakes-and-ladders")({
  head: () => seoHead("snakes-and-ladders"),
  component: () => <SeoPage page="snakes-and-ladders" />,
});

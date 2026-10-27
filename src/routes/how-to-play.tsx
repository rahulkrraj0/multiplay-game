import { createFileRoute } from "@tanstack/react-router";
import { SeoPage, seoHead } from "../playora/seo-pages";

export const Route = createFileRoute("/how-to-play")({
  head: () => seoHead("how-to-play"),
  component: () => <SeoPage page="how-to-play" />,
});

import { createFileRoute, notFound } from "@tanstack/react-router";
import { isGameSeoPage, SeoPage, seoHead } from "../../playora/seo-pages";

export const Route = createFileRoute("/games/$game")({
  loader: ({ params }) => {
    if (!isGameSeoPage(params.game)) throw notFound();
    return { page: params.game };
  },
  head: ({ loaderData }) => (loaderData ? seoHead(loaderData.page) : {}),
  component: GameGuideRoute,
});

function GameGuideRoute() {
  const { page } = Route.useLoaderData();
  return <SeoPage page={page} />;
}

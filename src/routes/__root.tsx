import { createRootRoute, HeadContent, Outlet, Scripts } from "@tanstack/react-router";
import { AuthProvider } from "@/lib/auth/provider";
import { AppNotFoundComponent } from "@/lib/error-component";
import { PreviewHostBridge } from "@/components/preview-host-bridge";
import appCss from "../styles.css?url";

const googleSiteVerification = import.meta.env.VITE_GOOGLE_SITE_VERIFICATION?.trim();
const bingSiteVerification = import.meta.env.VITE_BING_SITE_VERIFICATION?.trim();
export const Route = createRootRoute({
  notFoundComponent: AppNotFoundComponent,
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1, viewport-fit=cover" },
      { title: "GamesLord | Free Online Multiplayer Games" },
      {
        name: "description",
        content:
          "Play free online games on GamesLord with friends. Enjoy multiplayer with free audio and video—no sign-up or download required.",
      },
      { name: "application-name", content: "GamesLord" },
      { property: "og:site_name", content: "GamesLord" },
      { property: "og:title", content: "GamesLord | Free Online Multiplayer Games" },
      {
        property: "og:description",
        content: "Free online multiplayer games with audio and video. No sign-up required.",
      },
      {
        property: "og:image",
        content: "https://gameslord.online/playora/logo/gameslord-social-preview.png",
      },
      { property: "og:image:type", content: "image/png" },
      { property: "og:image:width", content: "1200" },
      { property: "og:image:height", content: "630" },
      { property: "og:image:alt", content: "GamesLord - online multiplayer games, made for fun" },
      { name: "twitter:card", content: "summary_large_image" },
      {
        name: "twitter:image",
        content: "https://gameslord.online/playora/logo/gameslord-social-preview.png",
      },
      { name: "twitter:image:alt", content: "GamesLord - online multiplayer games, made for fun" },
      ...(googleSiteVerification
        ? [{ name: "google-site-verification", content: googleSiteVerification }]
        : []),
      ...(bingSiteVerification
        ? [{ name: "msvalidate.01", content: bingSiteVerification }]
        : []),
      { name: "theme-color", content: "#0b1020" },
    ],
    links: [
      { rel: "icon", type: "image/svg+xml", href: "/playora/logo/gameslord-icon.svg" },
      { rel: "stylesheet", href: appCss },
      { rel: "manifest", href: "/__grok/manifest.webmanifest" },
      { rel: "apple-touch-icon", href: "/__grok/icon-180.png" },
    ],
  }),
  component: () => (
    <html lang="en" suppressHydrationWarning>
      <head>
        <HeadContent />
      </head>
      <body>
        <PreviewHostBridge />
        <AuthProvider>
          <Outlet />
        </AuthProvider>
        <Scripts />
      </body>
    </html>
  ),
});

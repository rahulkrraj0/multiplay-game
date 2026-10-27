import { createRootRoute, HeadContent, Outlet, Scripts } from "@tanstack/react-router";
import { AuthProvider } from "@/lib/auth/provider";
import { PreviewHostBridge } from "@/components/preview-host-bridge";
import appCss from "../styles.css?url";

const googleSiteVerification = import.meta.env.VITE_GOOGLE_SITE_VERIFICATION?.trim();
const bingSiteVerification = import.meta.env.VITE_BING_SITE_VERIFICATION?.trim();
export const Route = createRootRoute({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1, viewport-fit=cover" },
      { title: "Free Online Board Games | Playora" },
      {
        name: "description",
        content:
          "Play free browser games on Playora. Challenge the computer, take turns with a friend on one device, or invite friends to an online lobby.",
      },
      ...(googleSiteVerification
        ? [{ name: "google-site-verification", content: googleSiteVerification }]
        : []),
      ...(bingSiteVerification
        ? [{ name: "msvalidate.01", content: bingSiteVerification }]
        : []),
      { name: "theme-color", content: "#0b1020" },
    ],
    links: [
      { rel: "icon", type: "image/svg+xml", href: "/favicon.svg" },
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

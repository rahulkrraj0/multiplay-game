export type AdSensePlacement = "home" | "guide";

const adsEnabledFlag = import.meta.env.VITE_ADSENSE_ENABLED?.trim().toLowerCase() === "true";
const consentConfigured =
  import.meta.env.VITE_ADSENSE_CONSENT_CONFIGURED?.trim().toLowerCase() === "true";
const siteOperator = import.meta.env.VITE_PUBLIC_SITE_OPERATOR?.trim() ?? "";
const privacyEmail = import.meta.env.VITE_PUBLIC_PRIVACY_EMAIL?.trim() ?? "";

export const adsenseEnabled =
  adsEnabledFlag &&
  consentConfigured &&
  Boolean(siteOperator) &&
  /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(privacyEmail);
const publisherId = import.meta.env.VITE_ADSENSE_PUBLISHER_ID?.trim() ?? "";
const adSlots: Record<AdSensePlacement, string> = {
  home: import.meta.env.VITE_ADSENSE_HOME_SLOT_ID?.trim() ?? "",
  guide: import.meta.env.VITE_ADSENSE_GUIDE_SLOT_ID?.trim() ?? "",
};

const globalRef = globalThis as typeof globalThis & {
  __playoraAdSenseScript__?: HTMLScriptElement;
};

function isValidConfiguration(placement: AdSensePlacement): boolean {
  if (!publisherId) return false;
  if (!/^ca-pub-\d{16}$/.test(publisherId)) {
    console.error("[adsense] VITE_ADSENSE_PUBLISHER_ID must use the ca-pub- followed by 16 digits.");
    return false;
  }
  const slotId = adSlots[placement];
  if (!slotId) return false;
  if (!/^\d+$/.test(slotId)) {
    console.error(`[adsense] VITE_ADSENSE_${placement.toUpperCase()}_SLOT_ID must contain digits only.`);
    return false;
  }
  return true;
}

function loadAdSense(): void {
  if (globalRef.__playoraAdSenseScript__) return;

  const existing = document.getElementById("playora-adsense-script");
  if (existing instanceof HTMLScriptElement) {
    globalRef.__playoraAdSenseScript__ = existing;
    return;
  }

  const script = document.createElement("script");
  script.id = "playora-adsense-script";
  script.async = true;
  script.crossOrigin = "anonymous";
  script.src = `https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=${publisherId}`;
  script.onerror = () => {
    console.error("[adsense] Could not load the AdSense library.");
    delete globalRef.__playoraAdSenseScript__;
  };
  globalRef.__playoraAdSenseScript__ = script;
  document.head.appendChild(script);
}

export function initializeAdSenseSlot(
  container: HTMLElement,
  placement: AdSensePlacement,
): void {
  if (!adsenseEnabled || !isValidConfiguration(placement)) {
    container.hidden = true;
    return;
  }
  if (container.dataset.adsenseInitialized === "true") return;

  const ad = document.createElement("ins");
  ad.className = "adsbygoogle";
  ad.style.display = "block";
  ad.dataset.adClient = publisherId;
  ad.dataset.adSlot = adSlots[placement];
  ad.dataset.adFormat = "auto";
  ad.dataset.fullWidthResponsive = "true";
  container.replaceChildren(ad);
  container.hidden = false;
  container.dataset.adsenseInitialized = "true";

  loadAdSense();
  const adsWindow = window as Window & { adsbygoogle?: unknown[] };
  (adsWindow.adsbygoogle ??= []).push({});
}

export function initializeStaticAdSenseSlots(root: ParentNode = document): void {
  for (const container of root.querySelectorAll<HTMLElement>("[data-adsense-placement]")) {
    const placement = container.dataset.adsensePlacement;
    if (placement === "home" || placement === "guide") {
      initializeAdSenseSlot(container, placement);
    }
  }
}

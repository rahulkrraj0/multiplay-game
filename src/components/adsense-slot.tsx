import { useEffect, useRef } from "react";
import {
  initializeAdSenseSlot,
  type AdSensePlacement,
} from "@/lib/adsense";

export function AdSenseSlot({ placement }: { placement: AdSensePlacement }) {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (containerRef.current) initializeAdSenseSlot(containerRef.current, placement);
  }, [placement]);

  return (
    <aside
      ref={containerRef}
      className="adsense-placement"
      data-adsense-placement={placement}
      aria-label="Advertisement"
      hidden
    />
  );
}

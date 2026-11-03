import { useEffect } from "react";
import { RidePhoto, RoadArt, StartSticker } from "./Signs";

export function Splash({ onStart }: { onStart: () => void }) {
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if (e.key === "Escape" || e.key === "Enter") onStart();
    };
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, [onStart]);

  return (
    <div className="grain-yellow fixed inset-0 z-50 flex flex-col overflow-y-auto text-black md:flex-row md:overflow-hidden">
      <div className="flex flex-1 flex-col justify-center gap-5 p-6 md:p-14">
        <h1 className="extrude-yellow text-5xl leading-none font-black tracking-tight md:text-8xl">NAKABANDI</h1>
        <p className="max-w-md text-lg font-semibold md:text-xl">
          Traffic intelligence for India&apos;s roads. Measured speeds, honest gaps, no cameras.
        </p>
        <button
          onClick={onStart}
          aria-label="Start: open the map"
          className="w-fit cursor-pointer transition-transform hover:scale-105 hover:-rotate-3 motion-reduce:transition-none"
        >
          <StartSticker />
        </button>
      </div>
      <div className="splash-road relative flex-1 min-h-[420px]">
        <RoadArt className="absolute inset-0 h-full w-full" />
        <RidePhoto className="absolute bottom-6 left-6 w-44 -rotate-6 md:w-56" />
      </div>
    </div>
  );
}

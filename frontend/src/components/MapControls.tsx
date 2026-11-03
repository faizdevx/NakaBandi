import type { Toggles } from "../types";

const ITEMS: { key: keyof Toggles; short: string; label: string }[] = [
  { key: "hybrid", short: "HYB", label: "Hybrid labels and boundaries over satellite" },
  { key: "traffic", short: "TRF", label: "Traffic overlay" },
  { key: "roads", short: "RDS", label: "Road network" },
  { key: "hotspots", short: "HOT", label: "Hotspots" },
  { key: "threeD", short: "3D", label: "Tilted 3D view" },
  { key: "particles", short: "SIM", label: "Illustrative flow animation, not real vehicles" },
];

export function MapControls(props: {
  toggles: Toggles;
  canSimulate: boolean;
  onToggle: (key: keyof Toggles) => void;
  onReset: () => void;
}) {
  return (
    <div className="panel absolute top-28 right-3 z-20 flex flex-col gap-1 p-1 md:top-20" role="group" aria-label="Map layers">
      {ITEMS.filter((i) => i.key !== "particles" || props.canSimulate).map((i) => {
        const on = props.toggles[i.key];
        return (
          <button
            key={i.key}
            title={i.label}
            aria-label={i.label}
            aria-pressed={on}
            onClick={() => props.onToggle(i.key)}
            className={`font-pixel h-8 w-10 cursor-pointer rounded-sm text-[11px] ${on ? "bg-sign text-black" : "text-line hover:bg-white/15"}`}
          >
            {i.short}
          </button>
        );
      })}
      <button
        title="Reset to India view"
        aria-label="Reset to India view"
        onClick={props.onReset}
        className="font-pixel bg-stop hover:bg-severe h-8 w-10 cursor-pointer rounded-sm text-[11px]"
      >
        IND
      </button>
    </div>
  );
}

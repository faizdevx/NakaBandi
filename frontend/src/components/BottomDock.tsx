import { fmtPct, fmtTime } from "../format";
import { Diamond, Octagon, Yield } from "./Signs";

export function BottomDock(props: {
  observedAt: string | null;
  retrievedAt: string | null;
  coverage: number | null;
  stale: boolean;
  notice: string | null;
  particles: boolean;
  canReport: boolean;
  onReportView: () => void;
}) {
  return (
    <div className="panel absolute bottom-20 left-3 z-10 md:bottom-6 flex max-w-[calc(100%-1.5rem)] flex-wrap items-center gap-x-4 gap-y-1 px-3 py-1.5 text-xs md:left-1/2 md:max-w-[60%] md:-translate-x-1/2">
      <div className="flex items-center gap-2.5" aria-label="Congestion legend">
        <span className="flex items-center gap-1">
          <Diamond size={15} color="#22c55e" /> Free
        </span>
        <span className="flex items-center gap-1">
          <Yield size={15} /> Moderate
        </span>
        <span className="flex items-center gap-1">
          <Diamond size={15} color="#f97316" /> Heavy
        </span>
        <span className="flex items-center gap-1">
          <Octagon size={15} /> Severe
        </span>
        <span className="flex items-center gap-1">
          <span className="bg-nodata inline-block h-3 w-3" /> No data
        </span>
      </div>
      <div className="hidden items-center gap-3 font-mono md:flex">
        <span title="When the provider last updated this data">Obs {fmtTime(props.observedAt)}</span>
        <span title="When Nakabandi retrieved it">Ret {fmtTime(props.retrievedAt)}</span>
        {props.coverage !== null && <span title="Share of returned road length with live measurements">Cov {fmtPct(props.coverage)}</span>}
      </div>
      {props.stale && <span className="text-heavy font-bold">STALE: no fresh data, showing last good data</span>}
      {props.notice && <span className="text-sign">{props.notice}</span>}
      {props.particles && (
        <span className="font-pixel border border-white px-1.5 text-white">SIMULATED DOTS, NOT VEHICLES</span>
      )}
      {props.canReport && (
        <button className="btn" onClick={props.onReportView}>
          Report this view
        </button>
      )}
    </div>
  );
}

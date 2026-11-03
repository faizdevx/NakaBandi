import { useEffect, useState } from "react";
import { fmtPct, fmtTime, fmtVehicleRange, LEVEL_COLOR, LEVEL_LABEL, providerName, roadName } from "../format";
import type { Brief, Report } from "../types";
import { AskBox } from "./AskBox";
import { Aura } from "./Signs";

function Roads({ rows, onRoad }: { rows: Brief[]; onRoad: (b: Brief) => void }) {
  return (
    <table className="mt-2 w-full text-left text-xs">
      <thead className="text-muted">
        <tr>
          <th className="font-normal">Road</th>
          <th className="font-normal">Speed / free km/h</th>
          <th className="font-normal" title="Modelled from speed, not measured">Modelled vehicles</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((r) => (
          <tr key={r.id}>
            <td className="py-0.5">
              <button className="hover:text-sign cursor-pointer text-left font-bold" onClick={() => onRoad(r)}>
                {roadName(r.road_name)} {r.direction && <span className="text-muted font-normal">{r.direction}</span>}
              </button>
            </td>
            <td className="font-mono" style={{ color: LEVEL_COLOR[r.congestion_level] }}>
              {r.speed_kmh ?? "n/a"} / {r.free_flow_speed_kmh ?? "n/a"}
            </td>
            <td className="font-mono">
              {r.modelled_vehicles_low !== null && r.modelled_vehicles_high !== null
                ? fmtVehicleRange(r.modelled_vehicles_low, r.modelled_vehicles_high)
                : r.modelled_status === "light"
                  ? "light"
                  : "n/a"}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

export function ReportPanel({ report: r, aiReady, onRoad }: { report: Report; aiReady: boolean; onRoad: (b: Brief) => void }) {
  const [celebrate, setCelebrate] = useState(true);
  useEffect(() => {
    setCelebrate(true);
    const t = setTimeout(() => setCelebrate(false), 2200);
    return () => clearTimeout(t);
  }, [r.id]);
  const s = r.overall;
  const name = r.provenance.providers.map(providerName).join(", ");

  return (
    <div className="relative">
      {celebrate && (
        <div className="pop pointer-events-none absolute -top-1 right-0 z-10">
          <Aura className="text-xl" />
        </div>
      )}
      <h2 className="pr-16 text-xl leading-tight font-black">{r.area}</h2>
      <div className="mt-1 flex items-center gap-2 text-sm">
        <span className="inline-block h-3 w-3" style={{ background: LEVEL_COLOR[s.overall] }} />
        <span className="font-bold">Overall: {LEVEL_LABEL[s.overall]}</span>
      </div>
      <p className="mt-2 text-sm">
        {s.avg_speed_kmh !== null
          ? `Live roads average ${s.avg_speed_kmh} km/h against ${s.avg_free_flow_kmh} km/h free-flow, over ${s.measured_km} km measured.`
          : "No live speed measurements in this area."}{" "}
        Live coverage {fmtPct(s.coverage)} of {s.total_km} km returned.
      </p>

      <hr className="lane" />
      <span className="plate">Hotspots</span>
      {r.hotspots.length ? <Roads rows={r.hotspots} onRoad={onRoad} /> : <p className="text-muted mt-2 text-sm">No severe segments measured.</p>}

      <hr className="lane" />
      <span className="plate">Most affected roads</span>
      {r.most_affected.length ? <Roads rows={r.most_affected} onRoad={onRoad} /> : <p className="text-muted mt-2 text-sm">No measured segments.</p>}

      <hr className="lane" />
      <span className="plate">Density and vehicle counts</span>
      {r.density_and_counts.available ? (
        <p className="mt-2 text-sm">{r.density_and_counts.estimates.length} segments have estimates. Click a road for its band.</p>
      ) : (
        <p className="text-muted mt-2 text-sm">Measured counts: not available. {r.density_and_counts.reason}</p>
      )}
      {r.density_and_counts.modelled.roads > 0 && (
        <p className="mt-2 text-sm">
          <strong>{fmtVehicleRange(r.density_and_counts.modelled.count_low, r.density_and_counts.modelled.count_high)} vehicles</strong> on the{" "}
          {r.density_and_counts.modelled.roads} slowed roads in this sample.{" "}
          <span className="text-sign font-bold">Modelled estimate, not measured.</span> Not a total for the area.
        </p>
      )}
      <p className="text-muted mt-1 text-xs">
        {r.density_and_counts.modelled.light_roads} roads near free flow, count unknown. {r.density_and_counts.modelled.unavailable_roads} without live data.
      </p>

      <hr className="lane" />
      <span className="plate">Incidents ({r.incident_count})</span>
      {!r.incidents_available ? (
        <p className="text-heavy mt-2 text-sm">Incident lookup failed, so incidents may exist that are not listed.</p>
      ) : r.incidents.length === 0 ? (
        <p className="text-muted mt-2 text-sm">None reported by {name}.</p>
      ) : (
        <ul className="mt-2 space-y-1 text-xs">
          {r.incidents.slice(0, 10).map((i) => (
            <li key={i.id}>
              <span className="font-bold">{i.type ?? "Incident"}</span> {i.road_closed && <span className="text-severe font-bold">CLOSED</span>} {i.description}
            </li>
          ))}
        </ul>
      )}

      <hr className="lane" />
      <span className="plate">Insufficient data</span>
      <p className="mt-2 text-sm">{r.insufficient_data.unmeasured_km} km without live measurement.</p>
      {r.insufficient_data.roads.length > 0 && (
        <ul className="text-muted mt-1 text-xs">
          {r.insufficient_data.roads.map((g) => (
            <li key={g.road_name}>
              {g.road_name}: {g.km} km
            </li>
          ))}
        </ul>
      )}

      <hr className="lane" />
      <span className="plate">Compared with history</span>
      <p className="mt-2 text-sm">
        {r.history.available
          ? `Same weekday and hour, past 28 days: ${r.history.avg_speed_kmh} km/h (${r.history.samples} samples).`
          : r.history.reason}
      </p>

      <hr className="lane" />
      <span className="plate">Recommendations</span>
      {r.recommendations.length === 0 ? (
        <p className="text-muted mt-2 text-sm">The observations do not support any specific recommendation.</p>
      ) : (
        <ul className="mt-2 list-disc space-y-1 pl-4 text-sm">
          {r.recommendations.map((x) => (
            <li key={x}>{x}</li>
          ))}
        </ul>
      )}

      {aiReady && (
        <>
          <hr className="lane" />
          <span className="plate">AI reading</span>
          <AskBox reportId={r.id} placeholder="Leave empty for a summary, or ask" />
        </>
      )}

      <hr className="lane" />
      <span className="plate">Provenance</span>
      <dl className="mt-2 space-y-0.5 text-xs">
        <div>Report generated: {fmtTime(r.provenance.generated_at)}</div>
        <div>Data retrieved: {fmtTime(r.provenance.retrieved_at)}</div>
        <div>Provider: {r.provenance.attribution}</div>
        <div className="font-mono">
          Area: {r.provenance.bbox.west.toFixed(3)}, {r.provenance.bbox.south.toFixed(3)} to {r.provenance.bbox.east.toFixed(3)},{" "}
          {r.provenance.bbox.north.toFixed(3)}
        </div>
      </dl>
      <ul className="text-muted mt-2 list-disc pl-4 text-xs">
        {r.provenance.limitations.map((l) => (
          <li key={l}>{l}</li>
        ))}
      </ul>
    </div>
  );
}

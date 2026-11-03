import { fmtDuration, fmtTime, fmtVehicleRange, LEVEL_COLOR, LEVEL_LABEL, providerName, roadName } from "../format";
import type { SegmentDetail } from "../types";
import { AskBox } from "./AskBox";
import { DeadEnd } from "./Signs";

const BASIS: Record<string, string> = {
  realtime: "Live data",
  historical: "Historical pattern only, not live",
  speed_limit: "Derived from speed limit, not measured",
  unknown: "Basis not stated by provider",
};

function Row({ k, v }: { k: string; v: React.ReactNode }) {
  return (
    <div className="flex justify-between gap-3 border-b border-white/10 py-1">
      <dt className="text-muted">{k}</dt>
      <dd className="text-right font-semibold">{v}</dd>
    </div>
  );
}

export function RoadPanel(props: {
  detail: SegmentDetail;
  pinned: SegmentDetail[];
  aiReady: boolean;
  onPin: () => void;
  onUnpin: (id: string) => void;
}) {
  const { segment: s, observation: o, estimate: e, modelled: m, provider } = props.detail;
  const name = providerName(o.provider);
  const missing = <span className="text-muted font-normal">Not provided by {name}</span>;
  const unit = (v: number | null, u: string) => (v === null ? missing : `${v.toFixed(1)} ${u}`);
  const isPinned = props.pinned.some((p) => p.segment.id === s.id);

  return (
    <div>
      <h2 className="text-xl leading-tight font-black">{roadName(s.road_name)}</h2>
      <div className="mt-1 flex items-center gap-2 text-sm">
        <span className="inline-block h-3 w-3" style={{ background: LEVEL_COLOR[o.congestion_level] }} />
        <span className="font-bold">{LEVEL_LABEL[o.congestion_level]}</span>
        <span className="text-muted text-xs">{BASIS[o.data_basis]}</span>
      </div>

      {o.speed_kmh === o.free_flow_speed_kmh && /Minor|Local/.test(s.road_class ?? "") && (
        <p className="text-muted mt-2 text-xs">Speed equals free-flow exactly. On a small road, Nakabandi cannot tell whether vehicles were seen here recently.</p>
      )}

      <dl className="mt-3 text-sm">
        <Row k={o.data_basis === "realtime" ? "Observed speed" : "Reported speed (not live)"} v={unit(o.speed_kmh, "km/h")} />
        <Row k="Free-flow speed" v={unit(o.free_flow_speed_kmh, "km/h")} />
        <Row k="Traffic flow" v={o.flow_vehicles_per_hour === null ? missing : `${Math.round(o.flow_vehicles_per_hour)} veh/h`} />
        <Row k="Travel-time delay" v={props.detail.delay_seconds === null ? "n/a" : `${fmtDuration(props.detail.delay_seconds)} (derived)`} />
        <Row k="Category" v={s.road_class ?? missing} />
        <Row k="Length" v={`${s.length_km.toFixed(2)} km`} />
        <Row k="Heading" v={s.direction ?? missing} />
        <Row k="Provider confidence" v={o.confidence === null ? missing : o.confidence.toFixed(2)} />
        <Row k="Source" v={provider.attribution} />
        {o.incident_status === "part_closed" && <Row k="Closure" v="Part of this stretch is reported closed" />}
        <Row k="Observed" v={o.observed_at ? fmtTime(o.observed_at) : missing} />
        <Row k="Retrieved" v={fmtTime(o.retrieved_at)} />
      </dl>

      <hr className="lane" />
      <span className="plate">Estimated vehicles</span>
      {e.status !== "unavailable" ? (
        <div className="mt-2">
          <div className="text-3xl font-black">≈ {Math.round(e.estimated_vehicle_count!)} vehicles</div>
          {e.count_low !== null && e.count_high !== null && (
            <div className="font-mono text-sm">
              band {Math.round(e.count_low)} to {Math.round(e.count_high)}
            </div>
          )}
          <div className="text-sm">≈ {e.estimated_density!.toFixed(1)} veh/km (q = k × v)</div>
          {e.status === "unreliable" && <div className="text-heavy mt-1 text-sm font-bold">Flagged unreliable</div>}
          <ul className="text-muted mt-1 list-disc pl-4 text-xs">
            {e.notes.map((n) => (
              <li key={n}>{n}</li>
            ))}
          </ul>
        </div>
      ) : m?.status === "ok" ? (
        <div className="mt-2">
          <div className="text-3xl font-black">{fmtVehicleRange(m.count_low!, m.count_high!)} vehicles</div>
          <div className="text-sign mt-1 text-sm font-bold">Modelled estimate, not measured</div>
          <div className="mt-1 text-sm">
            {m.density_low!.toFixed(0)} to {m.density_high!.toFixed(0)} vehicles/km per lane,{" "}
            {m.lanes_low === m.lanes_high ? m.lanes_low : `${m.lanes_low} to ${m.lanes_high}`} lane(s) this way{" "}
            {m.lanes_source === "openstreetmap" ? "(from OpenStreetMap)" : "(assumed from road type)"}
          </div>
          <ul className="text-muted mt-1 list-disc pl-4 text-xs">
            {m.notes.map((n) => (
              <li key={n}>{n}</li>
            ))}
          </ul>
        </div>
      ) : m?.status === "light" ? (
        <div className="mt-2 text-sm">
          <strong>Light traffic, count unknown.</strong> {m.notes.join(" ")}
        </div>
      ) : (
        <div className="mt-2 flex items-center gap-3 [&>svg]:shrink-0">
          <DeadEnd size={64} />
          <p className="text-sm">
            <strong>Cannot estimate.</strong> {(m?.notes ?? e.notes).join(" ")} Nakabandi does not invent volume.
          </p>
        </div>
      )}

      <hr className="lane" />
      <span className="plate">Incidents nearby</span>
      {props.detail.incidents_error ? (
        <p className="text-heavy mt-2 text-sm">Incident lookup failed: {props.detail.incidents_error}</p>
      ) : props.detail.incidents.length === 0 ? (
        <p className="text-muted mt-2 text-sm">None reported by {name} within about 300 m.</p>
      ) : (
        <ul className="mt-2 space-y-2 text-sm">
          {props.detail.incidents.map((i) => (
            <li key={i.id}>
              <span className="font-bold">{i.type ?? "Incident"}</span> {i.criticality && `(${i.criticality})`}{" "}
              {i.road_closed && <span className="text-severe font-bold">ROAD CLOSED</span>}
              <div className="text-muted text-xs">{i.description}</div>
            </li>
          ))}
        </ul>
      )}

      <hr className="lane" />
      <div className="flex items-center justify-between">
        <span className="plate">Compare</span>
        <button className="btn" disabled={isPinned || props.pinned.length >= 5} onClick={props.onPin}>
          {isPinned ? "Pinned" : "Pin this road"}
        </button>
      </div>
      {props.pinned.length > 0 && (
        <table className="mt-2 w-full text-left text-xs">
          <thead className="text-muted">
            <tr>
              <th className="font-normal">Road</th>
              <th className="font-normal">Speed</th>
              <th className="font-normal">Free</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {props.pinned.map((p) => (
              <tr key={p.segment.id}>
                <td className="py-0.5 font-bold">{roadName(p.segment.road_name)}</td>
                <td style={{ color: LEVEL_COLOR[p.observation.congestion_level] }}>{p.observation.speed_kmh?.toFixed(0) ?? "n/a"}</td>
                <td>{p.observation.free_flow_speed_kmh?.toFixed(0) ?? "n/a"}</td>
                <td className="text-right">
                  <button className="cursor-pointer underline" onClick={() => props.onUnpin(p.segment.id)}>
                    remove
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {props.aiReady && (
        <AskBox
          segmentIds={props.pinned.length ? props.pinned.map((p) => p.segment.id) : [s.id]}
          placeholder={props.pinned.length > 1 ? "Compare these pinned roads" : "Ask about this road"}
        />
      )}
    </div>
  );
}

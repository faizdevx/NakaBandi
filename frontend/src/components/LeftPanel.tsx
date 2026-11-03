import { useState } from "react";
import { Bar, BarChart, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { fmtPct, LEVEL_COLOR, LEVEL_LABEL, providerName, roadName } from "../format";
import type { Level, National } from "../types";
import { DeadEnd, GameOver, PanelNotice } from "./Signs";

const ORDER: Level[] = ["free", "moderate", "heavy", "severe", "unavailable"];

export function LeftPanel(props: {
  national: National | null;
  loading: boolean;
  error: { code: string; message: string } | null;
  noProvider: boolean;
  onRetry: () => void;
  onHotspot: (lon: number, lat: number, id: string) => void;
  onCity: (name: string, lon: number, lat: number) => void;
}) {
  const [open, setOpen] = useState(window.innerWidth >= 768);
  const { national: n, loading, error, noProvider } = props;

  if (!open) {
    return (
      <button className="btn panel absolute top-28 left-3 z-10 md:top-20" onClick={() => setOpen(true)}>
        Overview
      </button>
    );
  }

  const chart = n ? ORDER.map((l) => ({ level: l, label: LEVEL_LABEL[l], km: n.km_by_level[l] })) : [];

  return (
    <aside className="panel scroll-thin absolute top-28 bottom-25 left-3 z-10 w-[calc(100%-1.5rem)] overflow-y-auto p-3 md:top-20 md:w-80">
      <div className="flex items-center justify-between">
        <span className="plate">National overview</span>
        <button className="btn" onClick={() => setOpen(false)} aria-label="Collapse overview">
          Hide
        </button>
      </div>

      {noProvider && (
        <PanelNotice sign={<DeadEnd />} title="No traffic feed">
          No provider key is set, so no traffic figures are shown. Add <code>HERE_API_KEY</code> to <code>.env</code> and restart
          the API. Map and search still work.
        </PanelNotice>
      )}

      {!noProvider && error && !n && (
        <PanelNotice sign={<GameOver />} title="Feed unavailable">
          {error.message}
          <div className="mt-3">
            <button className="btn" onClick={props.onRetry}>
              Try again
            </button>
          </div>
        </PanelNotice>
      )}

      {loading && !n && <div className="font-pixel text-sign py-6 text-center text-sm">SAMPLING CITIES…</div>}

      {n && (
        <>
          <dl className="mt-3 grid grid-cols-2 gap-2 text-sm">
            <div>
              <dt className="text-muted text-xs">Live coverage</dt>
              <dd className="text-2xl font-black">{fmtPct(n.coverage)}</dd>
            </div>
            <div>
              <dt className="text-muted text-xs">Road length sampled</dt>
              <dd className="text-2xl font-black">{Math.round(n.total_km).toLocaleString("en-IN")} km</dd>
            </div>
          </dl>
          <p className="text-muted mt-1 text-xs">
            {n.probes_ok} of {n.probes_total} city samples answered, major roads only, from {providerName(n.provider.name)}.
            This is a city sample, not all of India.
          </p>

          <hr className="lane" />
          <span className="plate">Congestion by road length</span>
          <div className="mt-2 h-36">
            <ResponsiveContainer>
              <BarChart data={chart} layout="vertical" margin={{ left: 0, right: 12 }}>
                <XAxis type="number" hide />
                <YAxis type="category" dataKey="label" width={82} tick={{ fill: "#f5f1e6", fontSize: 11 }} axisLine={false} tickLine={false} />
                <Tooltip
                  cursor={{ fill: "rgba(255,255,255,.08)" }}
                  contentStyle={{ background: "#141413", border: "1px solid #f5f1e6", fontSize: 12 }}
                  labelStyle={{ color: "#f5f1e6" }}
                  itemStyle={{ color: "#f5f1e6" }}
                  formatter={(v: number) => [`${Math.round(v)} km`, "Length"]}
                />
                <Bar dataKey="km" isAnimationActive={false}>
                  {chart.map((d) => (
                    <Cell key={d.level} fill={LEVEL_COLOR[d.level]} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>

          <hr className="lane" />
          <span className="plate">Most congested cities</span>
          {n.most_congested.length === 0 ? (
            <p className="text-muted mt-2 text-sm">No city has enough live coverage (20%) to compare.</p>
          ) : (
            <ol className="mt-2 space-y-1 text-sm">
              {n.most_congested.map((c) => {
                const city = n.cities.find((x) => x.name === c.name)!;
                return (
                  <li key={c.name}>
                    <button
                      className="hover:text-sign flex w-full cursor-pointer justify-between gap-2 text-left"
                      onClick={() => props.onCity(c.name, city.lon, city.lat)}
                    >
                      <span className="font-bold">{c.name}</span>
                      <span className="font-mono text-xs" style={{ color: LEVEL_COLOR[c.overall] }}>
                        {c.avg_speed_kmh} / {c.avg_free_flow_kmh} km/h
                      </span>
                    </button>
                  </li>
                );
              })}
            </ol>
          )}

          <hr className="lane" />
          <span className="plate">Severe hotspots</span>
          {n.hotspots.filter((h) => h.congestion_level === "severe").length === 0 ? (
            <p className="text-muted mt-2 text-sm">No severe segments in the current sample.</p>
          ) : (
            <ul className="mt-2 space-y-1 text-sm">
              {n.hotspots
                .filter((h) => h.congestion_level === "severe")
                .slice(0, 8)
                .map((h) => (
                  <li key={h.id}>
                    <button
                      className="hover:text-sign w-full cursor-pointer text-left"
                      onClick={() => props.onHotspot(h.lon, h.lat, h.id)}
                    >
                      <span className="font-bold">{roadName(h.road_name)}</span>{" "}
                      <span className="text-muted text-xs">
                        {h.city}, {h.speed_kmh ?? "n/a"} km/h
                      </span>
                    </button>
                  </li>
                ))}
            </ul>
          )}
        </>
      )}
    </aside>
  );
}

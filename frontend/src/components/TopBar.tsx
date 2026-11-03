import { useState } from "react";
import { api } from "../api";
import { fmtTime } from "../format";
import type { SearchResult } from "../types";
import { Octagon } from "./Signs";

type Feed = { label: string; tone: "live" | "warn" | "off" };

const TONE = { live: "bg-free", warn: "bg-heavy", off: "bg-nodata" };

export function TopBar(props: {
  feed: Feed;
  time: string | null;
  refreshing: boolean;
  onRefresh: () => void;
  onSettings: () => void;
  onLogo: () => void;
  onSelect: (r: SearchResult) => void;
}) {
  const [q, setQ] = useState("");
  const [results, setResults] = useState<SearchResult[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Submit-only on purpose: the Nominatim usage policy bans autocomplete.
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (q.trim().length < 2) return;
    setBusy(true);
    setError(null);
    try {
      setResults(await api.search(q.trim()));
    } catch (err) {
      setResults(null);
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <header className="panel absolute top-3 right-3 left-3 z-20 flex flex-wrap items-center gap-x-3 gap-y-2 px-3 py-2">
      <button onClick={props.onLogo} className="flex cursor-pointer items-center gap-2" title="About Nakabandi">
        <Octagon size={30} />
        <span className="text-lg font-black tracking-tight">NAKABANDI</span>
      </button>

      <form onSubmit={submit} className="relative order-last w-full md:order-none md:w-96" role="search">
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search city, locality, landmark or road, then Enter"
          aria-label="Search city, locality, landmark or road"
          className="bg-tar border-line/60 focus:border-sign w-full rounded border px-3 py-1.5 text-sm outline-none"
        />
        {busy && <span className="text-sign font-pixel absolute top-2 right-2 text-xs">LOOKING…</span>}
        {(results || error) && (
          <div className="panel scroll-thin absolute top-full right-0 left-0 mt-1 max-h-80 overflow-y-auto text-sm">
            {error && <div className="text-severe p-3">{error}</div>}
            {results?.length === 0 && <div className="text-muted p-3">No places found in India.</div>}
            {results?.map((r) => (
              <button
                key={r.id}
                type="button"
                onClick={() => {
                  props.onSelect(r);
                  setResults(null);
                  setQ(r.name);
                }}
                className="hover:bg-sign block w-full cursor-pointer border-b border-white/10 px-3 py-2 text-left hover:text-black"
              >
                <span className="font-bold">{r.name}</span> <span className="text-xs opacity-70">{r.kind}</span>
                <div className="truncate text-xs opacity-70">{r.display_name}</div>
              </button>
            ))}
            {results && (
              <button type="button" onClick={() => setResults(null)} className="text-muted w-full cursor-pointer p-2 text-xs">
                Close
              </button>
            )}
          </div>
        )}
      </form>

      <div className="ml-auto flex items-center gap-3">
        <div className="flex items-center gap-2 text-xs" aria-live="polite">
          <span className={`inline-block h-2.5 w-2.5 ${TONE[props.feed.tone]}`} />
          <span className="font-pixel">{props.feed.label}</span>
          {props.time && <span className="text-muted hidden font-mono lg:inline">{fmtTime(props.time)}</span>}
        </div>
        <button className="btn" onClick={props.onRefresh} disabled={props.refreshing}>
          {props.refreshing ? "Loading" : "Refresh"}
        </button>
        <button className="btn" onClick={props.onSettings}>
          Settings
        </button>
      </div>
    </header>
  );
}

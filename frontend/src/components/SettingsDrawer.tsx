import { useEffect, useState } from "react";
import { api } from "../api";
import { providerName } from "../format";
import type { AiSettings, Status } from "../types";
import { RidePhoto } from "./Signs";

const CAPABILITIES: Record<string, string> = {
  current_speed: "Current speed",
  free_flow_speed: "Free-flow speed",
  traffic_volume: "Traffic volume (vehicles/hour)",
  incidents: "Incidents",
  historical_api: "Historical data API",
};

export function SettingsDrawer({ status, onClose, onSaved }: { status: Status | null; onClose: () => void; onSaved: () => void }) {
  const [settings, setSettings] = useState<AiSettings | null>(null);
  const [provider, setProvider] = useState("");
  const [model, setModel] = useState("");
  const [token, setToken] = useState("");
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);

  useEffect(() => {
    api
      .aiSettings()
      .then((s) => {
        setSettings(s);
        setProvider(s.selection?.provider ?? "");
        setModel(s.selection?.model ?? "");
      })
      .catch((e) => setMessage({ ok: false, text: e.message }));
  }, []);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    try {
      setSettings(await api.saveAiSettings(provider || null, model || null, token));
      setMessage({ ok: true, text: "Saved." });
      onSaved();
    } catch (err) {
      setMessage({ ok: false, text: (err as Error).message });
    }
  }

  const chosen = settings?.providers.find((p) => p.id === provider);

  return (
    <aside className="panel tilt-right scroll-thin absolute top-3 right-3 bottom-3 z-30 w-[calc(100%-1.5rem)] overflow-y-auto p-4 md:w-96" aria-label="Settings">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-black">Settings</h2>
        <button className="btn" onClick={onClose}>
          Close
        </button>
      </div>
      <RidePhoto className="mx-auto mt-3 w-48 rotate-2" />

      <hr className="lane" />
      <span className="plate">AI provider</span>
      <p className="text-muted mt-2 text-xs">
        Used for reading reports and answering questions. All figures still come from the calculation engine. Keys stay on the
        server, set through environment variables.
      </p>
      <form onSubmit={save} className="mt-2 space-y-2 text-sm">
        <label className="block">
          Provider
          <select
            value={provider}
            onChange={(e) => setProvider(e.target.value)}
            className="bg-tar border-line/60 mt-1 w-full rounded border px-2 py-1.5"
          >
            <option value="">None: statistical reports only</option>
            {settings?.providers.map((p) => (
              <option key={p.id} value={p.id}>
                {p.id} {p.configured ? "" : "(no key on server)"}
              </option>
            ))}
          </select>
        </label>
        <label className="block">
          Model
          <input
            value={model}
            onChange={(e) => setModel(e.target.value)}
            placeholder={chosen?.default_model ?? "Default"}
            className="bg-tar border-line/60 mt-1 w-full rounded border px-2 py-1.5"
          />
        </label>
        <label className="block">
          Admin token
          <input
            type="password"
            autoComplete="off"
            value={token}
            onChange={(e) => setToken(e.target.value)}
            className="bg-tar border-line/60 mt-1 w-full rounded border px-2 py-1.5"
          />
        </label>
        {settings && !settings.admin_enabled && (
          <p className="text-heavy text-xs">ADMIN_TOKEN is not set on the server, so changes are disabled.</p>
        )}
        <button className="btn" disabled={!settings?.admin_enabled}>
          Save
        </button>
        {message && <p className={message.ok ? "text-free" : "text-severe"}>{message.text}</p>}
      </form>

      <hr className="lane" />
      <span className="plate">Traffic data source</span>
      {status?.provider ? (
        <div className="mt-2 text-sm">
          <p className="font-bold">{providerName(status.provider.name)}</p>
          <ul className="mt-1 text-xs">
            {Object.entries(status.provider.capabilities)
              .filter(([k]) => k in CAPABILITIES)
              .map(([k, v]) => (
              <li key={k} className="flex justify-between border-b border-white/10 py-0.5">
                <span>{CAPABILITIES[k] ?? k}</span>
                <span className={v ? "text-free font-bold" : "text-severe font-bold"}>{v ? "Yes" : "No"}</span>
              </li>
            ))}
          </ul>
        </div>
      ) : (
        <p className="text-muted mt-2 text-sm">No provider configured. Set TOMTOM_API_KEY on the server.</p>
      )}
      <p className="text-muted mt-3 text-xs">
        Historical archive: {status?.history_enabled ? "on" : "off"}. Geocoding: OpenStreetMap Nominatim. Places: Overpass. Road names, where the provider has none: Nominatim. Base map:
        OpenFreeMap and Esri World Imagery.
      </p>
    </aside>
  );
}

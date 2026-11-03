import { useCallback, useEffect, useRef, useState } from "react";
import { api, ApiError } from "./api";
import { BottomDock } from "./components/BottomDock";
import { LeftPanel } from "./components/LeftPanel";
import { MapControls } from "./components/MapControls";
import { ReportPanel } from "./components/ReportPanel";
import { RoadPanel } from "./components/RoadPanel";
import { SettingsDrawer } from "./components/SettingsDrawer";
import { GameOver, PanelNotice } from "./components/Signs";
import { Splash } from "./components/Splash";
import { TopBar } from "./components/TopBar";
import { MapView, POINT_LOOKUP_MIN_ZOOM, SEGMENT_MIN_ZOOM, type MapHandle } from "./map/MapView";
import type { BBox, Brief, National, Place, Report, SearchResult, SegmentCollection, SegmentDetail, Status, Toggles } from "./types";

const SPLASH_KEY = "nakabandi.started";
const INDIA = { west: 66, south: 6, east: 99, north: 38 };

function splashSeen() {
  try {
    return localStorage.getItem(SPLASH_KEY) === "1";
  } catch {
    return false;
  }
}

const clampIndia = (b: BBox): BBox => ({
  west: Math.max(b.west, INDIA.west),
  south: Math.max(b.south, INDIA.south),
  east: Math.min(b.east, INDIA.east),
  north: Math.min(b.north, INDIA.north),
});

type Side = "road" | "report" | null;

export default function App() {
  const map = useRef<MapHandle>(null);
  const [splash, setSplash] = useState(!splashSeen());
  const [status, setStatus] = useState<Status | null>(null);
  const [apiDown, setApiDown] = useState(false);
  const [national, setNational] = useState<National | null>(null);
  const [nationalLoading, setNationalLoading] = useState(false);
  const [nationalError, setNationalError] = useState<{ code: string; message: string } | null>(null);
  const [segments, setSegments] = useState<SegmentCollection | null>(null);
  const [segmentsLoading, setSegmentsLoading] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [view, setView] = useState<{ bbox: BBox; zoom: number } | null>(null);
  const [toggles, setToggles] = useState<Toggles>({ hybrid: true, traffic: true, roads: true, hotspots: true, threeD: false, particles: false });
  const [boundary, setBoundary] = useState<SearchResult | null>(null);
  const [places, setPlaces] = useState<Place[]>([]);
  const [side, setSide] = useState<Side>(null);
  const [detail, setDetail] = useState<SegmentDetail | null>(null);
  const [report, setReport] = useState<Report | null>(null);
  const [sideBusy, setSideBusy] = useState(false);
  const [sideError, setSideError] = useState<string | null>(null);
  const [pinned, setPinned] = useState<SegmentDetail[]>([]);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const segmentAbort = useRef<AbortController | null>(null);

  const noProvider = status !== null && status.provider === null;
  const caps = status?.provider?.capabilities;
  const bboxFlow = !!caps?.bbox_flow;

  const loadStatus = useCallback(async () => {
    try {
      setStatus(await api.status());
      setApiDown(false);
    } catch {
      setApiDown(true);
    }
  }, []);

  const loadNational = useCallback(async () => {
    setNationalLoading(true);
    setNationalError(null);
    try {
      setNational(await api.national());
    } catch (e) {
      const err = e as ApiError;
      setNationalError({ code: err.code, message: err.message });
    } finally {
      setNationalLoading(false);
    }
  }, []);

  const loadSegments = useCallback(
    async (v: { bbox: BBox; zoom: number }) => {
      segmentAbort.current?.abort();
      if (!bboxFlow || v.zoom < SEGMENT_MIN_ZOOM) {
        setSegments(null);
        setNotice(null);
        return;
      }
      const ctl = new AbortController();
      segmentAbort.current = ctl;
      setSegmentsLoading(true);
      try {
        const fc = await api.segments(clampIndia(v.bbox), v.zoom, ctl.signal);
        setSegments(fc);
        setNotice(fc.features.length ? null : "Provider returned no road segments here.");
      } catch (e) {
        if (e instanceof DOMException && e.name === "AbortError") return;
        setNotice((e as ApiError).code === "provider_not_configured" ? null : (e as Error).message);
      } finally {
        if (segmentAbort.current === ctl) setSegmentsLoading(false);
      }
    },
    [bboxFlow],
  );

  useEffect(() => {
    void loadStatus();
  }, [loadStatus]);

  useEffect(() => {
    if (status?.provider) void loadNational();
  }, [status?.provider, loadNational]);

  const debounce = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const onMove = useCallback(
    (v: { bbox: BBox; zoom: number }) => {
      setView(v);
      clearTimeout(debounce.current);
      debounce.current = setTimeout(() => void loadSegments(v), 350);
    },
    [loadSegments],
  );

  const showRoad = useCallback(async (load: Promise<SegmentDetail>) => {
    setSide("road");
    setSideBusy(true);
    setSideError(null);
    try {
      setDetail(await load);
    } catch (e) {
      setDetail(null);
      setSideError((e as Error).message);
    } finally {
      setSideBusy(false);
    }
  }, []);

  const openSegment = useCallback((id: string) => void showRoad(api.segment(id)), [showRoad]);
  const openAt = useCallback(
    (lat: number, lon: number, zoom: number) => void showRoad(api.segmentAt(lat, lon, zoom)),
    [showRoad],
  );

  const runReport = useCallback(async (name: string, bbox: BBox) => {
    setSide("report");
    setSideBusy(true);
    setSideError(null);
    setReport(null);
    try {
      setReport(await api.report(name, bbox));
    } catch (e) {
      setSideError((e as Error).message);
    } finally {
      setSideBusy(false);
    }
  }, []);

  const selectPlace = useCallback(
    async (r: SearchResult) => {
      setBoundary(r);
      setPlaces([]);
      map.current?.fit(r.bbox);
      const w = r.bbox.east - r.bbox.west;
      const h = r.bbox.north - r.bbox.south;
      const cityScale = w <= 1.2 && h <= 1.2;
      if (status?.provider && cityScale) void runReport(r.name, r.bbox);
      else if (!cityScale) setNotice("Area is larger than one city: search a city for its report.");
      if (cityScale) {
        try {
          setPlaces(await api.places(clampIndia(r.bbox)));
        } catch {
          setNotice("Localities and landmarks are unavailable right now (Overpass).");
        }
      }
    },
    [status?.provider, runReport],
  );

  const refresh = useCallback(() => {
    void loadStatus();
    if (status?.provider) void loadNational();
    if (view) void loadSegments(view);
  }, [loadStatus, loadNational, loadSegments, status?.provider, view]);

  const onRoad = useCallback(
    (b: Brief) => {
      map.current?.flyTo(b.lon, b.lat);
      void openSegment(b.id);
    },
    [openSegment],
  );

  const start = useCallback(() => {
    setSplash(false);
    try {
      localStorage.setItem(SPLASH_KEY, "1");
    } catch {
      // Private window: splash just shows again next visit.
    }
  }, []);

  const meta = segments?.meta;
  const feed = apiDown
    ? ({ label: "API DOWN", tone: "off" } as const)
    : noProvider
      ? ({ label: "NO FEED", tone: "off" } as const)
      : meta?.stale || national?.stale
        ? ({ label: "STALE", tone: "warn" } as const)
        : national || meta
          ? ({ label: "LIVE", tone: "live" } as const)
          : nationalError
            ? ({ label: "FEED ERROR", tone: "warn" } as const)
            : ({ label: "CONNECTING", tone: "off" } as const);

  return (
    <main className="relative h-full w-full overflow-hidden">
      <MapView
        ref={map}
        toggles={toggles}
        national={national}
        segments={segments}
        boundary={boundary}
        places={places}
        selectedLine={side === "road" && detail ? detail.segment.geometry : null}
        trafficTiles={!!caps?.flow_tiles}
        onMapClick={caps?.point_lookup ? openAt : null}
        attribution={status?.provider?.attribution ?? null}
        onMove={onMove}
        onSegment={openSegment}
        onMapError={setNotice}
      />

      <TopBar
        feed={feed}
        time={meta?.observed_at ?? national?.observed_at ?? national?.retrieved_at ?? null}
        refreshing={nationalLoading || segmentsLoading}
        onRefresh={refresh}
        onSettings={() => setSettingsOpen(true)}
        onLogo={() => setSplash(true)}
        onSelect={selectPlace}
      />

      <LeftPanel
        national={national}
        loading={nationalLoading}
        error={apiDown ? { code: "network", message: "Nakabandi API is not reachable." } : nationalError}
        noProvider={noProvider}
        onRetry={refresh}
        onHotspot={(lon, lat, id) => {
          map.current?.flyTo(lon, lat);
          void openSegment(id);
        }}
        onCity={(_, lon, lat) => map.current?.flyTo(lon, lat, 12)}
      />

      <MapControls
        toggles={toggles}
        canSimulate={!!caps?.travel_direction}
        onToggle={(k) => setToggles((t) => ({ ...t, [k]: !t[k] }))}
        onReset={() => {
          map.current?.reset();
          setBoundary(null);
          setPlaces([]);
        }}
      />

      {side && (
        <aside className="panel scroll-thin absolute top-28 right-3 bottom-25 z-30 w-[calc(100%-1.5rem)] overflow-y-auto p-3 md:top-20 md:right-[4.25rem] md:z-10 md:w-96" aria-label="Inspection panel">
          <div className="mb-2 flex items-center justify-between">
            <span className="plate">{side === "road" ? "Road inspection" : "Traffic report"}</span>
            <div className="flex gap-1">
              {detail && report && (
                <button className="btn" onClick={() => setSide(side === "road" ? "report" : "road")}>
                  {side === "road" ? "Report" : "Road"}
                </button>
              )}
              <button
                className="btn"
                onClick={() => {
                  setSide(null);
                }}
              >
                Close
              </button>
            </div>
          </div>
          {sideBusy && <div className="font-pixel text-sign py-6 text-center text-sm">READING THE ROAD…</div>}
          {!sideBusy && sideError && (
            <PanelNotice sign={<GameOver className="text-3xl" />} title="Could not load">
              {sideError}
            </PanelNotice>
          )}
          {!sideBusy && !sideError && side === "road" && detail && (
            <RoadPanel
              detail={detail}
              pinned={pinned}
              aiReady={!!status?.ai_ready}
              onPin={() => setPinned((p) => [...p, detail])}
              onUnpin={(id) => setPinned((p) => p.filter((x) => x.segment.id !== id))}
            />
          )}
          {!sideBusy && !sideError && side === "report" && report && (
            <ReportPanel report={report} aiReady={!!status?.ai_ready} onRoad={onRoad} />
          )}
          {!sideBusy && !sideError && !status?.ai_ready && <p className="text-muted mt-3 text-xs">No AI provider configured: this is the statistical view. Choose one in Settings.</p>}
        </aside>
      )}

      <BottomDock
        observedAt={meta?.observed_at ?? national?.observed_at ?? null}
        retrievedAt={meta?.retrieved_at ?? national?.retrieved_at ?? null}
        coverage={meta?.summary.coverage ?? national?.coverage ?? null}
        stale={!!(meta?.stale || national?.stale)}
        notice={notice ?? (caps?.point_lookup && view && view.zoom >= POINT_LOOKUP_MIN_ZOOM ? "Click any road to inspect it" : null)}
        particles={toggles.particles}
        canReport={!!status?.provider && !!view && view.zoom >= SEGMENT_MIN_ZOOM}
        onReportView={() => view && void runReport("Current view", clampIndia(view.bbox))}
      />

      {settingsOpen && <SettingsDrawer status={status} onClose={() => setSettingsOpen(false)} onSaved={loadStatus} />}
      {splash && <Splash onStart={start} />}
    </main>
  );
}

import { useCallback, useEffect, useRef, useState } from "react";
import { api, ApiError } from "./api";
import { BottomDock } from "./components/BottomDock";
import { CardPreview } from "./components/CardPreview";
import { LeftPanel } from "./components/LeftPanel";
import { MapControls } from "./components/MapControls";
import { ReportPanel } from "./components/ReportPanel";
import { RoadPanel } from "./components/RoadPanel";
import { SettingsDrawer } from "./components/SettingsDrawer";
import { GameOver, PanelNotice } from "./components/Signs";
import { useLive } from "./live";
import { Splash } from "./components/Splash";
import { TopBar } from "./components/TopBar";
import { MapView, POINT_LOOKUP_MIN_ZOOM, SEGMENT_MIN_ZOOM, type MapHandle } from "./map/MapView";
import type { BBox, Brief, National, Place, Report, SearchResult, SegmentCollection, SegmentDetail, Status, Toggles } from "./types";

const SPLASH_KEY = "nakabandi.started";
const INDIA = { west: 66, south: 6, east: 99, north: 38 };
// Each tile refresh spends free quota, so colours poll slower. The rest polls the API cache and only spends on expiry.
const DATA_POLL_MS = 60_000;
const TILE_POLL_MS = 120_000;

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
  const [toggles, setToggles] = useState<Toggles>({ hybrid: true, traffic: true, roads: true, hotspots: true, threeD: true, particles: false });
  const [boundary, setBoundary] = useState<SearchResult | null>(null);
  const [places, setPlaces] = useState<Place[]>([]);
  const [side, setSide] = useState<Side>(null);
  const [detail, setDetail] = useState<SegmentDetail | null>(null);
  const [report, setReport] = useState<Report | null>(null);
  const [sideBusy, setSideBusy] = useState(false);
  const [sideError, setSideError] = useState<string | null>(null);
  const [pinned, setPinned] = useState<SegmentDetail[]>([]);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [locating, setLocating] = useState(false);
  const [card, setCard] = useState<Report | null>(null);
  const [trafficAt, setTrafficAt] = useState<number | null>(null);
  const [trafficStale, setTrafficStale] = useState(false);
  const segmentAbort = useRef<AbortController | null>(null);
  const reportAsked = useRef<{ name: string; bbox: BBox } | null>(null);
  const placesFor = useRef<SearchResult | null>(null);

  // Panels lean with the pointer. Skipped mid-drag so panning the map never pays for it.
  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const root = document.documentElement;
    const lean = (e: PointerEvent) => {
      if (e.buttons || e.pointerType !== "mouse") return;
      root.style.setProperty("--mx", (e.clientX / window.innerWidth - 0.5).toFixed(3));
      root.style.setProperty("--my", (e.clientY / window.innerHeight - 0.5).toFixed(3));
    };
    window.addEventListener("pointermove", lean);
    return () => window.removeEventListener("pointermove", lean);
  }, []);

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

  const loadNational = useCallback(async (silent = false) => {
    if (!silent) {
      setNationalLoading(true);
      setNationalError(null);
    }
    try {
      setNational(await api.national());
      setNationalError(null);
    } catch (e) {
      const err = e as ApiError;
      setNationalError({ code: err.code, message: err.message });
    } finally {
      if (!silent) setNationalLoading(false);
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
    // TomTom answers for inner roads at flow zoom 16, and often snaps to a main road at other zooms.
    (lat: number, lon: number, zoom: number) => void showRoad(api.segmentAt(lat, lon, zoom >= 14 ? 16 : zoom)),
    [showRoad],
  );

  const runReport = useCallback(async (name: string, bbox: BBox) => {
    const asked = { name, bbox };
    reportAsked.current = asked;
    setSide("report");
    setSideBusy(true);
    setSideError(null);
    setReport(null);
    try {
      const next = await api.report(name, bbox);
      if (reportAsked.current !== asked) return null;
      setReport(next);
      return next;
    } catch (e) {
      if (reportAsked.current === asked) setSideError((e as Error).message);
      return null;
    } finally {
      if (reportAsked.current === asked) setSideBusy(false);
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
      if (!cityScale) {
        setNotice("Area is larger than one city: search a city for its report.");
        return null;
      }
      placesFor.current = r;
      api.places(clampIndia(r.bbox)).then(
        (rows) => placesFor.current === r && setPlaces(rows),
        () => placesFor.current === r && setNotice("Localities and landmarks are unavailable right now (Overpass)."),
      );
      if (!status?.provider) return null;
      const found = await runReport(r.name, r.bbox);
      // The report reads the centre, so show that part: colours for inner roads only appear when this close.
      if (found) map.current?.fit(found.provenance.bbox);
      return found;
    },
    [status?.provider, runReport],
  );

  const nearMe = useCallback(() => {
    if (!navigator.geolocation) {
      setNotice("This browser cannot share location. Search your city instead.");
      return;
    }
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      async ({ coords }) => {
        try {
          const found = await selectPlace(await api.locate(coords.latitude, coords.longitude));
          if (found?.overall.measured_km) setCard(found);
          else if (found) setNotice("No live traffic near you right now, so no card.");
        } catch (e) {
          setNotice((e as Error).message);
        } finally {
          setLocating(false);
        }
      },
      (e) => {
        setLocating(false);
        setNotice(e.code === e.PERMISSION_DENIED ? "Location permission denied. Search your city instead." : "Could not get your location. Search your city instead.");
      },
      { timeout: 10000, maximumAge: 300000 },
    );
  }, [selectPlace]);

  const refresh = useCallback(() => {
    void loadStatus();
    if (status?.provider) void loadNational();
    if (view) void loadSegments(view);
    map.current?.refreshTraffic();
  }, [loadStatus, loadNational, loadSegments, status?.provider, view]);

  const onTraffic = useCallback((ok: boolean) => {
    setTrafficStale(!ok);
    if (ok) setTrafficAt(Date.now());
  }, []);

  useLive(() => {
    void loadStatus();
    if (status?.provider) void loadNational(true);
    if (bboxFlow && view) void loadSegments(view);
  }, DATA_POLL_MS);

  useLive(() => map.current?.refreshTraffic(), TILE_POLL_MS, !!caps?.flow_tiles && toggles.traffic);

  // The panels update in place: identity checks drop a late answer if the user has moved on.
  useLive(
    () => {
      if (side === "road" && detail) {
        api.segment(detail.segment.id).then((next) => setDetail((cur) => (cur === detail ? next : cur)), () => {});
      } else if (side === "report" && report && reportAsked.current) {
        api.report(reportAsked.current.name, reportAsked.current.bbox).then((next) => setReport((cur) => (cur === report ? next : cur)), () => {});
      }
    },
    DATA_POLL_MS,
    !sideBusy,
  );

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
      : meta?.stale || national?.stale || trafficStale
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
        reportArea={side === "report" && report ? report.provenance.bbox : null}
        places={places}
        selectedLine={side === "road" && detail ? detail.segment.geometry : null}
        trafficTiles={!!caps?.flow_tiles}
        onMapClick={caps?.point_lookup ? openAt : null}
        attribution={status?.provider?.attribution ?? null}
        onMove={onMove}
        onSegment={openSegment}
        onMapError={setNotice}
        onTraffic={onTraffic}
      />

      <TopBar
        feed={feed}
        updatedAt={trafficAt ?? (meta?.retrieved_at || national?.retrieved_at ? Date.parse((meta?.retrieved_at ?? national?.retrieved_at)!) : null)}
        refreshing={nationalLoading || segmentsLoading}
        onRefresh={refresh}
        locating={locating}
        onNearMe={nearMe}
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
        <aside className="panel tilt-right scroll-thin absolute top-28 right-3 bottom-25 z-30 w-[calc(100%-1.5rem)] overflow-y-auto p-3 md:top-20 md:right-[4.25rem] md:z-10 md:w-96" aria-label="Inspection panel">
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
        stale={!!(meta?.stale || national?.stale) || trafficStale}
        notice={notice ?? (caps?.point_lookup && view && view.zoom >= POINT_LOOKUP_MIN_ZOOM ? "Click any road to inspect it" : null)}
        particles={toggles.particles}
        columns={toggles.threeD && toggles.hotspots && !!view && view.zoom < SEGMENT_MIN_ZOOM}
        canReport={!!status?.provider && !!view && view.zoom >= SEGMENT_MIN_ZOOM}
        onReportView={() => view && void runReport("Current view", clampIndia(view.bbox))}
      />

      {card && <CardPreview report={card} onClose={() => setCard(null)} />}
      {settingsOpen && <SettingsDrawer status={status} onClose={() => setSettingsOpen(false)} onSaved={loadStatus} />}
      {splash && <Splash onStart={start} />}
    </main>
  );
}

import maplibregl, { type GeoJSONSource, type Map as MLMap } from "maplibre-gl";
import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from "react";
import { LEVEL_COLOR } from "../format";
import type { BBox, National, Place, SearchResult, SegmentCollection, Toggles } from "../types";
import { buildTracks, particleFrame } from "./particles";
import { baseStyle, INDIA_BOUNDS, LABEL_LAYERS, ROAD_LAYERS } from "./style";

export const SEGMENT_MIN_ZOOM = 9.5;
export const POINT_LOOKUP_MIN_ZOOM = 10;
const EMPTY: GeoJSON.FeatureCollection = { type: "FeatureCollection", features: [] };
const levelColor: maplibregl.ExpressionSpecification = [
  "match",
  ["get", "level"],
  "free",
  LEVEL_COLOR.free,
  "moderate",
  LEVEL_COLOR.moderate,
  "heavy",
  LEVEL_COLOR.heavy,
  "severe",
  LEVEL_COLOR.severe,
  LEVEL_COLOR.unavailable,
];
const severityColor = (prop: maplibregl.ExpressionSpecification): maplibregl.ExpressionSpecification => [
  "step",
  prop,
  LEVEL_COLOR.free,
  0.25,
  LEVEL_COLOR.moderate,
  0.5,
  LEVEL_COLOR.heavy,
  0.75,
  LEVEL_COLOR.severe,
];

// Keeps fly-to targets in the part of the map not covered by panels.
const clearArea = () =>
  window.innerWidth >= 768 ? { top: 90, bottom: 90, left: 350, right: 480 } : { top: 130, bottom: 90, left: 20, right: 60 };

export type MapHandle = {
  fit: (b: BBox) => void;
  flyTo: (lon: number, lat: number, zoom?: number) => void;
  reset: () => void;
  view: () => { bbox: BBox; zoom: number } | null;
};

type Props = {
  toggles: Toggles;
  national: National | null;
  segments: SegmentCollection | null;
  boundary: SearchResult | null;
  places: Place[];
  selectedLine: number[][] | null;
  trafficTiles: boolean;
  attribution: string | null;
  onMove: (view: { bbox: BBox; zoom: number }) => void;
  onSegment: (id: string) => void;
  onMapClick: ((lat: number, lon: number, zoom: number) => void) | null;
  onMapError: (message: string) => void;
};

function currentView(map: MLMap) {
  const b = map.getBounds();
  return {
    zoom: map.getZoom(),
    bbox: { west: b.getWest(), south: b.getSouth(), east: b.getEast(), north: b.getNorth() },
  };
}

function setData(map: MLMap, id: string, data: GeoJSON.GeoJSON) {
  (map.getSource(id) as GeoJSONSource | undefined)?.setData(data);
}

export const MapView = forwardRef<MapHandle, Props>(function MapView(props, ref) {
  const box = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MLMap | null>(null);
  const callbacks = useRef(props);
  const attrib = useRef<maplibregl.AttributionControl | null>(null);
  const [ready, setReady] = useState(false);
  const { toggles, national, segments, boundary, places, selectedLine, trafficTiles, attribution } = props;

  useEffect(() => {
    callbacks.current = props;
  });

  useImperativeHandle(ref, () => ({
    fit: (b) =>
      mapRef.current?.fitBounds(
        [
          [b.west, b.south],
          [b.east, b.north],
        ],
        { padding: clearArea(), maxZoom: 15, duration: 1800 },
      ),
    flyTo: (lon, lat, zoom = 14) => mapRef.current?.flyTo({ center: [lon, lat], zoom, padding: clearArea(), duration: 1600 }),
    reset: () => mapRef.current?.fitBounds(INDIA_BOUNDS, { padding: 30, pitch: 0, bearing: 0, duration: 1400 }),
    view: () => (mapRef.current ? currentView(mapRef.current) : null),
  }));

  useEffect(() => {
    const map = new maplibregl.Map({
      container: box.current!,
      style: baseStyle,
      bounds: INDIA_BOUNDS,
      fitBoundsOptions: { padding: 30 },
      maxPitch: 70,
      attributionControl: false,
      fadeDuration: 150,
    });
    mapRef.current = map;
    map.addControl(new maplibregl.NavigationControl({ visualizePitch: true }), "bottom-right");
    map.addControl(new maplibregl.ScaleControl({ maxWidth: 110 }), "bottom-right");

    map.on("error", (e) => {
      // Single tile failures recover by themselves; only report when a whole source is gone.
      if ((e as { sourceId?: string }).sourceId === undefined) callbacks.current.onMapError(e.error?.message ?? "Map error");
    });

    map.on("load", () => {
      for (const id of ["boundary", "segments", "selected-line", "places", "particles", "cities"]) {
        map.addSource(id, { type: "geojson", data: EMPTY });
      }
      map.addSource("hotspots", {
        type: "geojson",
        data: EMPTY,
        cluster: true,
        clusterRadius: 46,
        clusterMaxZoom: 9,
        clusterProperties: { maxSeverity: ["max", ["get", "severity"]] },
      });

      map.addLayer({ id: "boundary-fill", type: "fill", source: "boundary", paint: { "fill-color": "#fff", "fill-opacity": 0.06 } });
      map.addLayer({
        id: "boundary-line",
        type: "line",
        source: "boundary",
        paint: { "line-color": "#fff", "line-width": 2.5, "line-dasharray": [3, 2] },
      });
      map.addLayer({
        id: "segments-casing",
        type: "line",
        source: "segments",
        layout: { "line-cap": "round", "line-join": "round" },
        paint: {
          "line-color": "#111",
          "line-width": ["interpolate", ["linear"], ["zoom"], 9, 2.5, 16, 9],
          "line-offset": ["interpolate", ["linear"], ["zoom"], 9, 0.5, 16, 4],
        },
      });
      map.addLayer({
        id: "segments-line",
        type: "line",
        source: "segments",
        layout: { "line-cap": "round", "line-join": "round" },
        paint: {
          "line-color": levelColor,
          "line-width": ["interpolate", ["linear"], ["zoom"], 9, 1.6, 16, 6],
          // Offset to the driving side so opposite carriageways stay separately visible.
          "line-offset": ["interpolate", ["linear"], ["zoom"], 9, 0.5, 16, 4],
        },
      });
      map.addLayer({
        id: "segment-selected",
        type: "line",
        source: "selected-line",
        layout: { "line-cap": "round", "line-join": "round" },
        paint: {
          "line-color": "#fff",
          "line-width": ["interpolate", ["linear"], ["zoom"], 9, 3, 16, 7],
          "line-opacity": 0.9,
        },
      });
      map.addLayer({
        id: "segments-hit",
        type: "line",
        source: "segments",
        paint: { "line-color": "#000", "line-opacity": 0, "line-width": 14 },
      });
      map.addLayer({
        id: "particles",
        type: "circle",
        source: "particles",
        minzoom: SEGMENT_MIN_ZOOM,
        // Hollow on purpose: reads as a marker, not as a measured vehicle position.
        paint: { "circle-radius": 2.6, "circle-color": "rgba(0,0,0,0)", "circle-stroke-color": "#fff", "circle-stroke-width": 1.2 },
      });
      map.addLayer({
        id: "junctions",
        type: "circle",
        source: "places",
        filter: ["==", ["get", "kind"], "junction"],
        minzoom: 12,
        paint: { "circle-radius": 2.5, "circle-color": "#c8202a", "circle-stroke-color": "#fff", "circle-stroke-width": 1 },
      });
      map.addLayer({
        id: "place-points",
        type: "circle",
        source: "places",
        filter: ["==", ["get", "kind"], "landmark"],
        paint: { "circle-radius": 4, "circle-color": "#f9b013", "circle-stroke-color": "#111", "circle-stroke-width": 1.5 },
      });
      map.addLayer({
        id: "place-labels",
        type: "symbol",
        source: "places",
        filter: ["all", ["!=", ["get", "kind"], "junction"], ["has", "name"]],
        layout: {
          "text-field": ["get", "name"],
          "text-font": ["Noto Sans Bold"],
          "text-size": ["match", ["get", "kind"], "landmark", 12, 11],
          "text-offset": [0, 0.9],
          "text-anchor": "top",
          "text-optional": true,
        },
        paint: {
          "text-color": ["match", ["get", "kind"], "landmark", "#f9b013", "#fff"],
          "text-halo-color": "#111",
          "text-halo-width": 1.6,
        },
      });
      map.addLayer({
        id: "city-unavailable",
        type: "circle",
        source: "cities",
        maxzoom: SEGMENT_MIN_ZOOM,
        filter: ["==", ["get", "level"], "unavailable"],
        paint: { "circle-radius": 5, "circle-color": LEVEL_COLOR.unavailable, "circle-stroke-color": "#111", "circle-stroke-width": 1.5 },
      });
      map.addLayer({
        id: "hotspot-cluster",
        type: "circle",
        source: "hotspots",
        filter: ["has", "point_count"],
        maxzoom: SEGMENT_MIN_ZOOM,
        paint: {
          "circle-color": severityColor(["get", "maxSeverity"]),
          "circle-radius": ["step", ["get", "point_count"], 14, 5, 18, 15, 24],
          "circle-stroke-color": "#111",
          "circle-stroke-width": 2.5,
        },
      });
      map.addLayer({
        id: "hotspot-count",
        type: "symbol",
        source: "hotspots",
        filter: ["has", "point_count"],
        maxzoom: SEGMENT_MIN_ZOOM,
        layout: { "text-field": ["get", "point_count_abbreviated"], "text-font": ["Noto Sans Bold"], "text-size": 12 },
        paint: { "text-color": "#111" },
      });
      map.addLayer({
        id: "hotspot-point",
        type: "circle",
        source: "hotspots",
        filter: ["!", ["has", "point_count"]],
        maxzoom: SEGMENT_MIN_ZOOM,
        paint: {
          "circle-color": severityColor(["get", "severity"]),
          "circle-radius": ["interpolate", ["linear"], ["get", "severity"], 0, 5, 1, 10],
          "circle-stroke-color": "#111",
          "circle-stroke-width": 2,
        },
      });

      for (const layer of ["segments-hit", "hotspot-cluster", "hotspot-point"]) {
        map.on("mouseenter", layer, () => (map.getCanvas().style.cursor = "pointer"));
        map.on("mouseleave", layer, () => (map.getCanvas().style.cursor = ""));
      }
      map.on("click", "segments-hit", (e) => {
        const id = e.features?.[0]?.properties?.id;
        if (id) callbacks.current.onSegment(id);
      });
      map.on("click", "hotspot-cluster", async (e) => {
        const feature = e.features?.[0];
        if (!feature) return;
        const source = map.getSource("hotspots") as GeoJSONSource;
        const zoom = await source.getClusterExpansionZoom(feature.properties.cluster_id);
        map.easeTo({ center: (feature.geometry as GeoJSON.Point).coordinates as [number, number], zoom });
      });
      map.on("click", "hotspot-point", (e) => {
        const f = e.features?.[0];
        if (!f) return;
        map.flyTo({ center: (f.geometry as GeoJSON.Point).coordinates as [number, number], zoom: 14, padding: clearArea(), duration: 1600 });
        if (f.properties.id) callbacks.current.onSegment(f.properties.id);
      });
      map.on("click", (e) => {
        const click = callbacks.current.onMapClick;
        if (!click || map.getZoom() < POINT_LOOKUP_MIN_ZOOM) return;
        if (map.queryRenderedFeatures(e.point, { layers: ["hotspot-cluster", "hotspot-point"] }).length) return;
        click(e.lngLat.lat, e.lngLat.lng, map.getZoom());
      });
      map.on("moveend", () => callbacks.current.onMove(currentView(map)));
      callbacks.current.onMove(currentView(map));
      setReady(true);
    });

    const observer = new ResizeObserver(() => map.resize());
    observer.observe(box.current!);
    return () => {
      observer.disconnect();
      map.remove();
      mapRef.current = null;
      attrib.current = null;
      setReady(false);
    };
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    if (attrib.current) map.removeControl(attrib.current);
    // Imagery and OSM credits come from the sources themselves.
    attrib.current = new maplibregl.AttributionControl({ compact: window.innerWidth < 768, customAttribution: attribution ?? undefined });
    map.addControl(attrib.current, "bottom-left");
  }, [attribution]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready) return;
    const vis = (ids: string[], on: boolean) =>
      ids.forEach((id) => map.getLayer(id) && map.setLayoutProperty(id, "visibility", on ? "visible" : "none"));
    vis(LABEL_LAYERS, toggles.hybrid);
    vis(ROAD_LAYERS, toggles.roads);
    vis(["segments-casing", "segments-line", "segments-hit", "segment-selected"], toggles.traffic);
    vis(["hotspot-cluster", "hotspot-count", "hotspot-point", "city-unavailable"], toggles.hotspots);
    vis(["particles"], toggles.particles);
    vis(["flow-tiles"], toggles.traffic);
  }, [ready, trafficTiles, toggles.hybrid, toggles.roads, toggles.traffic, toggles.hotspots, toggles.particles]);

  useEffect(() => {
    const map = mapRef.current;
    if (!ready || !map || !trafficTiles || map.getSource("flow-tiles")) return;
    map.addSource("flow-tiles", {
      type: "raster",
      tiles: [`${window.location.origin}/api/traffic/tiles/{z}/{x}/{y}.png`],
      tileSize: 256,
    });
    map.addLayer({ id: "flow-tiles", type: "raster", source: "flow-tiles" }, "state-lines");
  }, [ready, trafficTiles]);

  useEffect(() => {
    if (ready) mapRef.current?.easeTo({ pitch: toggles.threeD ? 55 : 0, duration: 700 });
  }, [ready, toggles.threeD]);

  useEffect(() => {
    if (!ready) return;
    const map = mapRef.current!;
    const pointFc = <T,>(rows: T[], get: (r: T) => { lon: number; lat: number; props: object }): GeoJSON.FeatureCollection => ({
      type: "FeatureCollection",
      features: rows.map((r) => {
        const { lon, lat, props } = get(r);
        return { type: "Feature", properties: props, geometry: { type: "Point", coordinates: [lon, lat] } };
      }),
    });
    setData(map, "hotspots", pointFc(national?.hotspots ?? [], (h) => ({ lon: h.lon, lat: h.lat, props: h })));
    setData(
      map,
      "cities",
      pointFc(national?.cities ?? [], (c) => ({
        lon: c.lon,
        lat: c.lat,
        props: { name: c.name, level: c.summary && c.summary.coverage > 0 ? "measured" : "unavailable" },
      })),
    );
  }, [ready, national]);

  useEffect(() => {
    if (ready) setData(mapRef.current!, "segments", segments ?? EMPTY);
  }, [ready, segments]);

  useEffect(() => {
    if (!ready) return;
    const geom = boundary?.geojson;
    const area = geom && (geom.type === "Polygon" || geom.type === "MultiPolygon");
    setData(mapRef.current!, "boundary", area ? { type: "Feature", properties: {}, geometry: geom } : EMPTY);
  }, [ready, boundary]);

  useEffect(() => {
    if (!ready) return;
    setData(mapRef.current!, "places", {
      type: "FeatureCollection",
      features: places.map((p) => ({
        type: "Feature",
        properties: p.name ? { kind: p.kind, name: p.name } : { kind: p.kind },
        geometry: { type: "Point", coordinates: [p.lon, p.lat] },
      })),
    });
  }, [ready, places]);

  useEffect(() => {
    if (!ready) return;
    const data: GeoJSON.GeoJSON = selectedLine
      ? { type: "Feature", properties: {}, geometry: { type: "LineString", coordinates: selectedLine } }
      : EMPTY;
    setData(mapRef.current!, "selected-line", data);
  }, [ready, selectedLine]);

  useEffect(() => {
    const map = mapRef.current;
    if (!ready || !map) return;
    if (!toggles.particles || !toggles.traffic || !segments) {
      setData(map, "particles", EMPTY);
      return;
    }
    const tracks = buildTracks(segments);
    const start = performance.now();
    let last = 0;
    let frame = requestAnimationFrame(function tick(now) {
      if (now - last > 50) {
        last = now;
        setData(map, "particles", particleFrame(tracks, (now - start) / 1000));
      }
      frame = requestAnimationFrame(tick);
    });
    return () => cancelAnimationFrame(frame);
  }, [ready, segments, toggles.particles, toggles.traffic]);

  // Inline: maplibre.css sets position: relative on this node and would beat a utility class.
  return <div ref={box} style={{ position: "absolute", inset: 0 }} role="application" aria-label="Map of India with traffic layers" />;
});

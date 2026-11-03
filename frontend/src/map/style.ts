import type { ExpressionSpecification, StyleSpecification } from "maplibre-gl";

export const INDIA_BOUNDS: [[number, number], [number, number]] = [
  [68.0, 6.5],
  [97.5, 37.2],
];

const HALO = { "text-color": "#fff", "text-halo-color": "#111", "text-halo-width": 1.6 };
const FONT = ["Noto Sans Regular"];
const FONT_BOLD = ["Noto Sans Bold"];
const NAME = ["coalesce", ["get", "name:en"], ["get", "name_en"], ["get", "name"]] as ExpressionSpecification;

export const LABEL_LAYERS = ["state-lines", "country-lines", "city-labels", "town-labels", "suburb-labels", "road-labels", "highway-shields"];
export const ROAD_LAYERS = ["roads-major", "roads-minor"];

export const baseStyle: StyleSpecification = {
  version: 8,
  glyphs: "https://tiles.openfreemap.org/fonts/{fontstack}/{range}.pbf",
  sources: {
    imagery: {
      type: "raster",
      tiles: ["https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}"],
      tileSize: 256,
      // Esri coverage in rural India thins out above this: overzoom beats grey "no data" tiles.
      maxzoom: 17,
      attribution: "Imagery © Esri, Maxar, Earthstar Geographics, GIS User Community",
    },
    osm: {
      type: "vector",
      url: "https://tiles.openfreemap.org/planet",
    },
  },
  layers: [
    { id: "background", type: "background", paint: { "background-color": "#141413" } },
    { id: "imagery", type: "raster", source: "imagery", paint: { "raster-saturation": -0.25, "raster-brightness-max": 0.82 } },
    {
      id: "roads-minor",
      type: "line",
      source: "osm",
      "source-layer": "transportation",
      minzoom: 9,
      filter: ["in", ["get", "class"], ["literal", ["primary", "secondary", "tertiary"]]],
      paint: {
        "line-color": "#f5f1e6",
        "line-opacity": 0.45,
        "line-width": ["interpolate", ["linear"], ["zoom"], 9, 0.4, 14, 2],
      },
    },
    {
      id: "roads-major",
      type: "line",
      source: "osm",
      "source-layer": "transportation",
      minzoom: 4,
      filter: ["in", ["get", "class"], ["literal", ["motorway", "trunk"]]],
      paint: {
        "line-color": "#f9b013",
        "line-opacity": 0.8,
        "line-width": ["interpolate", ["linear"], ["zoom"], 4, 0.5, 8, 1.2, 14, 3.5],
      },
    },
    {
      id: "state-lines",
      type: "line",
      source: "osm",
      "source-layer": "boundary",
      filter: ["all", ["==", ["get", "admin_level"], 4], ["!=", ["get", "maritime"], 1]],
      paint: { "line-color": "#f5f1e6", "line-opacity": 0.6, "line-width": 1, "line-dasharray": [3, 2] },
    },
    {
      id: "country-lines",
      type: "line",
      source: "osm",
      "source-layer": "boundary",
      filter: ["all", ["==", ["get", "admin_level"], 2], ["!=", ["get", "maritime"], 1]],
      paint: { "line-color": "#f5f1e6", "line-width": 1.6 },
    },
    {
      id: "highway-shields",
      type: "symbol",
      source: "osm",
      "source-layer": "transportation_name",
      minzoom: 7,
      filter: ["all", ["in", ["get", "class"], ["literal", ["motorway", "trunk"]]], ["has", "ref"]],
      layout: {
        "symbol-placement": "line",
        "symbol-spacing": 400,
        "text-field": ["get", "ref"],
        "text-font": FONT_BOLD,
        "text-size": 11,
        "text-rotation-alignment": "viewport",
      },
      paint: { "text-color": "#111", "text-halo-color": "#f9b013", "text-halo-width": 2.5 },
    },
    {
      id: "road-labels",
      type: "symbol",
      source: "osm",
      "source-layer": "transportation_name",
      minzoom: 13,
      layout: { "symbol-placement": "line", "text-field": NAME, "text-font": FONT, "text-size": 11 },
      paint: HALO,
    },
    {
      id: "suburb-labels",
      type: "symbol",
      source: "osm",
      "source-layer": "place",
      minzoom: 11,
      filter: ["in", ["get", "class"], ["literal", ["suburb", "quarter", "neighbourhood"]]],
      layout: { "text-field": NAME, "text-font": FONT, "text-size": 11 },
      paint: HALO,
    },
    {
      id: "town-labels",
      type: "symbol",
      source: "osm",
      "source-layer": "place",
      minzoom: 7,
      filter: ["==", ["get", "class"], "town"],
      layout: { "text-field": NAME, "text-font": FONT, "text-size": 12 },
      paint: HALO,
    },
    {
      id: "city-labels",
      type: "symbol",
      source: "osm",
      "source-layer": "place",
      minzoom: 3,
      filter: ["==", ["get", "class"], "city"],
      layout: {
        "text-field": NAME,
        "text-font": FONT_BOLD,
        "text-size": ["interpolate", ["linear"], ["zoom"], 4, 11, 10, 17],
      },
      paint: HALO,
    },
  ],
};

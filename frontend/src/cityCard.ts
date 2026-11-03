import { fmtPct, fmtTime, fmtVehicleRange, LEVEL_COLOR, LEVEL_LABEL, roadName, roadSpeeds } from "./format";
import type { Level, Report } from "./types";

const SIZE = 1080;
const M = 56;
const OVERPASS = "Overpass, system-ui, sans-serif";
const MONO = "'Overpass Mono', ui-monospace, monospace";
const PIXEL = "Silkscreen, ui-monospace, monospace";
const LEVELS: Level[] = ["free", "moderate", "heavy", "severe", "unavailable"];

export type Sticker = "aura" | "game-over" | null;

/** The sticker follows the measured level, so a slowed city can never earn aura. */
export function cardSticker(level: Level): Sticker {
  if (level === "free") return "aura";
  return level === "heavy" || level === "severe" ? "game-over" : null;
}

export function levelShares(km: Record<Level, number>): { level: Level; share: number }[] {
  const total = LEVELS.reduce((sum, l) => sum + km[l], 0);
  return total > 0 ? LEVELS.filter((l) => km[l] > 0).map((level) => ({ level, share: km[level] / total })) : [];
}

export function cardFilename(area: string, retrievedAt: string): string {
  const slug = area.replace(/[^\p{L}\p{N}]+/gu, "-").replace(/^-+|-+$/g, "").toLowerCase();
  return `nakabandi-${slug || "city"}-${retrievedAt.slice(0, 10)}.png`;
}

function fit(ctx: CanvasRenderingContext2D, text: string, font: (px: number) => string, px: number, width: number) {
  ctx.font = font(px);
  while (px > 14 && ctx.measureText(text).width > width) ctx.font = font(--px);
}

function ellipsize(ctx: CanvasRenderingContext2D, text: string, width: number): string {
  if (ctx.measureText(text).width <= width) return text;
  let cut = text;
  while (cut && ctx.measureText(`${cut}...`).width > width) cut = cut.slice(0, -1);
  return `${cut.trimEnd()}...`;
}

/** Canvas twin of .pixel-sticker: black outline inside a white die-cut edge. */
function drawSticker(ctx: CanvasRenderingContext2D, sticker: Exclude<Sticker, null>, x: number, y: number, px: number) {
  const lines = sticker === "aura" ? [["+1000", "#fff"], ["AURA", "#f9b013"]] : [["GAME", "#e0202a"], ["OVER", "#e0202a"]];
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate((-8 * Math.PI) / 180);
  ctx.font = `700 ${px}px ${PIXEL}`;
  ctx.textAlign = "center";
  lines.forEach(([text], i) => {
    const ty = i * px;
    for (const [offset, colour] of [[7, "#fff"], [3, "#111"]] as const) {
      ctx.fillStyle = colour;
      for (const dx of [-offset, 0, offset]) for (const dy of [-offset, 0, offset]) ctx.fillText(text, dx, ty + dy);
    }
  });
  lines.forEach(([text, fill], i) => {
    ctx.fillStyle = fill;
    ctx.fillText(text, 0, i * px);
  });
  ctx.restore();
}

function draw(ctx: CanvasRenderingContext2D, r: Report) {
  const s = r.overall;
  const width = SIZE - M * 2;
  ctx.textBaseline = "alphabetic";

  ctx.fillStyle = "#f9b013";
  ctx.fillRect(0, 0, SIZE, 300);
  ctx.fillStyle = "#111";
  ctx.font = `900 28px ${OVERPASS}`;
  ctx.fillText("NAKABANDI", M, 72);
  fit(ctx, r.area, (px) => `900 ${px}px ${OVERPASS}`, 104, 660);
  ctx.fillText(r.area, M, 190);
  ctx.font = `800 26px ${OVERPASS}`;
  ctx.fillText(fmtTime(r.provenance.retrieved_at), M, 248);

  ctx.fillStyle = "#141413";
  ctx.fillRect(0, 300, SIZE, SIZE - 300);
  ctx.strokeStyle = "#f5f1e6";
  ctx.lineWidth = 6;
  ctx.setLineDash([46, 34]);
  ctx.beginPath();
  ctx.moveTo(0, 303);
  ctx.lineTo(SIZE, 303);
  ctx.stroke();
  ctx.setLineDash([]);

  const sticker = cardSticker(s.overall);
  if (sticker) drawSticker(ctx, sticker, 880, 130, 70);

  ctx.fillStyle = LEVEL_COLOR[s.overall];
  ctx.fillRect(M, 356, 44, 44);
  ctx.font = `900 54px ${OVERPASS}`;
  ctx.fillText(LEVEL_LABEL[s.overall], M + 64, 398);

  ctx.fillStyle = "#f5f1e6";
  if (s.avg_speed_kmh !== null) {
    const speed = `${s.avg_speed_kmh} km/h`;
    ctx.font = `900 96px ${OVERPASS}`;
    ctx.fillText(speed, M, 506);
    const end = M + ctx.measureText(speed).width + 28;
    ctx.fillStyle = "#a8a496";
    ctx.font = `600 28px ${OVERPASS}`;
    ctx.fillText("average on live roads", end, 468);
    ctx.fillText(`against ${s.avg_free_flow_kmh} km/h free-flow`, end, 504);
  }

  let x = M;
  for (const { level, share } of levelShares(s.km_by_level)) {
    ctx.fillStyle = LEVEL_COLOR[level];
    ctx.fillRect(x, 540, share * width, 34);
    x += share * width;
  }
  x = M;
  ctx.font = `600 22px ${OVERPASS}`;
  for (const { level, share } of levelShares(s.km_by_level)) {
    const label = `${LEVEL_LABEL[level]} ${fmtPct(share)}`;
    ctx.fillStyle = LEVEL_COLOR[level];
    ctx.fillRect(x, 593, 16, 16);
    ctx.fillStyle = "#f5f1e6";
    ctx.fillText(label, x + 22, 609);
    x += 22 + ctx.measureText(label).width + 26;
  }

  ctx.fillStyle = "#f9b013";
  ctx.font = `900 22px ${OVERPASS}`;
  ctx.fillText("MOST AFFECTED ROADS", M, 668);
  r.most_affected.slice(0, 3).forEach((road, i) => {
    const y = 712 + i * 44;
    const speeds = roadSpeeds(road, " km/h");
    ctx.font = `600 28px ${MONO}`;
    const speedsWidth = ctx.measureText(speeds).width;
    ctx.fillStyle = LEVEL_COLOR[road.congestion_level];
    ctx.fillText(speeds, SIZE - M - speedsWidth, y);
    ctx.fillStyle = "#f5f1e6";
    ctx.font = `800 30px ${OVERPASS}`;
    ctx.fillText(ellipsize(ctx, roadName(road.road_name), width - speedsWidth - 24), M, y);
  });

  const modelled = r.density_and_counts.modelled;
  if (modelled.roads > 0) {
    const line = `${fmtVehicleRange(modelled.count_low, modelled.count_high)} vehicles on ${modelled.roads} slowed roads in this area. Modelled estimate, not measured.`;
    ctx.fillStyle = "#f9b013";
    fit(ctx, line, (px) => `800 ${px}px ${OVERPASS}`, 28, width);
    ctx.fillText(line, M, 884);
  }

  const notes = [
    `${fmtPct(s.coverage)} of ${Math.round(s.total_km)} km returned had live data. A sample of central roads, not the whole city.`,
    `Data: ${r.provenance.attribution}${r.provenance.stale ? " (cached, may be out of date)" : ""}`,
    "github.com/faizdevx/NakaBandi",
  ];
  ctx.fillStyle = "#a8a496";
  notes.forEach((note, i) => {
    fit(ctx, note, (px) => `600 ${px}px ${OVERPASS}`, 24, width);
    ctx.fillText(note, M, 950 + i * 36);
  });
}

/** Draws from report fields only, so no map tiles or traffic images are copied into the file. */
export async function renderCityCard(r: Report): Promise<Blob> {
  await Promise.allSettled(
    [`900 40px Overpass`, `800 40px Overpass`, `600 40px Overpass`, `600 28px "Overpass Mono"`, `700 70px Silkscreen`].map((f) => document.fonts.load(f)),
  );
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = SIZE;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas is not available");
  draw(ctx, r);
  const blob = await new Promise<Blob | null>((done) => canvas.toBlob(done, "image/png"));
  if (!blob) throw new Error("Could not create the image");
  return blob;
}

export function downloadCard(blob: Blob, r: Report) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = cardFilename(r.area, r.provenance.retrieved_at);
  link.click();
  URL.revokeObjectURL(url);
}

export async function saveCityCard(r: Report): Promise<void> {
  downloadCard(await renderCityCard(r), r);
}

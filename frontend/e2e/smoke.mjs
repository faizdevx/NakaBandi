// Browser integration test: map, search, traffic layer, road inspection, report.
// Needs: `python -m tests.e2e_server` in backend/ and `npm run dev` here. Search uses live Nominatim.
import assert from "node:assert/strict";
import { mkdirSync } from "node:fs";
import { chromium } from "playwright-core";

const shots = process.env.E2E_SHOTS ?? "e2e/shots";
mkdirSync(shots, { recursive: true });

const browser = await chromium.launch({
  channel: process.env.E2E_CHANNEL ?? "msedge",
  args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"],
});
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
const errors = [];
page.on("pageerror", (e) => errors.push(e.message));
page.on("console", (m) => m.type() === "error" && !m.text().includes("Failed to load resource") && errors.push(m.text()));

const shot = (name) => page.screenshot({ path: `${shots}/${name}.png` });

await page.goto("http://localhost:5173");
await page.getByRole("button", { name: /Start: open the map/ }).waitFor();
await shot("1-splash");
await page.getByRole("button", { name: /Start: open the map/ }).click();

await page.locator(".maplibregl-canvas").waitFor();
await page.getByText("Live coverage").waitFor({ timeout: 30000 });
await page.waitForTimeout(6000);
await shot("2-india");
const canvas = await page.locator(".maplibregl-canvas").boundingBox();
assert.ok(canvas.height > 500 && canvas.width > 1000, "map must fill the screen");
const attribution = await page.locator(".maplibregl-ctrl-attrib-inner").innerText();
assert.match(attribution, /Esri/);
assert.match(attribution, /OpenStreetMap/);
assert.match(attribution, /FIXTURE TEST DATA/);

await page.getByRole("textbox", { name: /Search city/ }).fill("Lucknow");
await page.keyboard.press("Enter");
await page.getByRole("button", { name: /Lucknow.*Uttar Pradesh/ }).first().click({ timeout: 15000 });
await page.getByText("Provenance").waitFor({ timeout: 20000 });
await page.getByText("Report generated:").waitFor();
await page.getByText(/does not report traffic volume/).waitFor();
await page.waitForTimeout(6000);
await shot("3-city-report");

// Click a road on the map itself: the segment layer must be rendered and hit-testable.
await page.getByLabel("Inspection panel").getByRole("button", { name: "Close" }).click();
await page.waitForTimeout(500);
const box = await page.locator(".maplibregl-canvas").boundingBox();
let opened = false;
for (let y = box.y + 100; y < box.y + 780 && !opened; y += 14) {
  for (let x = box.x + 345; x < box.x + 980 && !opened; x += 14) {
    await page.mouse.click(x, y);
    await page.waitForTimeout(25);
    opened = await page.getByLabel("Inspection panel").isVisible();
  }
}
assert.ok(opened, "clicking a road on the map opens the inspection panel");
await page.getByText("Free-flow speed").waitFor({ timeout: 15000 });
await page.getByText(/Modelled estimate, not measured|Light traffic, count unknown|Cannot estimate/).first().waitFor();
await page.getByText(/Not provided by HERE/).first().waitFor();
await page.waitForTimeout(5000);
await shot("4-road");

await page.getByRole("button", { name: /Illustrative flow animation/ }).click();
await page.getByText(/SIMULATED DOTS/).waitFor();
await page.waitForTimeout(2000);
await shot("5-simulated");

await page.getByRole("button", { name: "Settings" }).click();
await page.getByText("Traffic data source").waitFor();
await shot("6-settings");
await page.getByLabel("Settings", { exact: true }).getByRole("button", { name: "Close" }).click();

await page.setViewportSize({ width: 390, height: 800 });
await page.waitForTimeout(1500);
await shot("7-mobile");

await browser.close();
assert.deepEqual(errors, []);
console.log("e2e ok");

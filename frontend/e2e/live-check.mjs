// Manual check against the real provider. Spends real quota (about 80 flow calls), so it is not part of `npm run e2e`.
// Needs the API running with a provider key, and `npm run dev`.
import assert from "node:assert/strict";
import { mkdirSync } from "node:fs";
import { chromium } from "playwright-core";

const shots = "e2e/shots";
mkdirSync(shots, { recursive: true });
const browser = await chromium.launch({
  channel: process.env.E2E_CHANNEL ?? "msedge",
  args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"],
});
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
const errors = [];
page.on("pageerror", (e) => errors.push(e.message));

await page.goto("http://localhost:5173");
await page.getByRole("button", { name: /Start: open the map/ }).click();
await page.getByText("Live coverage").waitFor({ timeout: 90000 });
await page.waitForTimeout(8000);
await page.screenshot({ path: `${shots}/live-1-india.png` });
console.log("status:", await page.locator("header").innerText());

await page.getByRole("textbox", { name: /Search city/ }).fill("Chandigarh");
await page.keyboard.press("Enter");
await page.getByRole("button", { name: /Chandigarh/ }).first().click({ timeout: 15000 });
await page.getByText("Provenance").waitFor({ timeout: 90000 });
await page.waitForTimeout(8000);
await page.screenshot({ path: `${shots}/live-2-city.png` });
console.log("report:", (await page.getByLabel("Inspection panel").innerText()).slice(0, 500));

await page.getByLabel("Inspection panel").getByRole("button", { name: "Close" }).click();
const box = await page.locator(".maplibregl-canvas").boundingBox();
await page.mouse.move(box.x + 650, box.y + 450);
for (let i = 0; i < 6; i++) {
  await page.mouse.wheel(0, -300);
  await page.waitForTimeout(400);
}
await page.waitForTimeout(6000);
await page.screenshot({ path: `${shots}/live-3-roads.png` });

await page.mouse.click(box.x + 650, box.y + 450);
await page.getByLabel("Inspection panel").waitFor({ timeout: 10000 });
await page.waitForTimeout(6000);
await page.screenshot({ path: `${shots}/live-4-road.png` });
console.log("road:", (await page.getByLabel("Inspection panel").innerText()).slice(0, 400));

await browser.close();
assert.deepEqual(errors, []);
console.log("live check ok");

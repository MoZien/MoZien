// Renders every app icon and splash image from the AutoHalle mark (a roof over a road):
// the web app's icons, the iPhone and Android app icons and splash screens, and the browser
// helper's icons. Run from frontend/: node scripts/render-icons.mjs (needs Playwright's Chromium).
import { chromium } from "@playwright/test";
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
const root = fileURLToPath(new URL("../..", import.meta.url));
const INK = "#16181b", ROAD = "#5b7fff";
// The mark in a 64 x 64 box, scaled around the centre.
const mark = (scale = 1, heavy = false) => `<g transform="translate(32 32) scale(${scale}) translate(-32 -32)">
  <path d="M15 41.5 L32 15.5 L49 41.5" fill="none" stroke="#fff" stroke-width="${heavy ? 8.5 : 7}" stroke-linecap="round" stroke-linejoin="round"/>
  <path d="M15 50 H49" stroke="${ROAD}" stroke-width="${heavy ? 7 : 5.5}" stroke-linecap="round"/></g>`;
const svg = (body, view = "0 0 64 64") => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${view}">${body}</svg>`;
const square = (scale = 0.8, heavy = false) => svg(`<rect width="64" height="64" fill="${INK}"/>${mark(scale, heavy)}`);
const rounded = (scale = 0.84, heavy = false) => svg(`<rect width="64" height="64" rx="14" fill="${INK}"/>${mark(scale, heavy)}`);
const round = svg(`<circle cx="32" cy="32" r="32" fill="${INK}"/>${mark(0.78)}`);
const foreground = svg(mark(0.62));
const splash = (w, h) => svg(`<rect x="${-w / 2}" y="${-h / 2}" width="${w}" height="${h}" fill="${INK}" transform="translate(32 32)"/>${mark(0.5 * 64 / Math.min(64, 64))}`,
  `${32 - w / 2} ${32 - h / 2} ${w} ${h}`);
const jobs = [
  ["frontend/public/icon-192.png", 192, 192, square()],
  ["frontend/public/icon-512.png", 512, 512, square()],
  ["frontend/ios/App/App/Assets.xcassets/AppIcon.appiconset/AppIcon-512@2x.png", 1024, 1024, square()],
  ["extension/icon-16.png", 16, 16, rounded(1.0, true), true],
  ["extension/icon-48.png", 48, 48, rounded(0.92, true), true],
  ["extension/icon-128.png", 128, 128, rounded(), true],
];
for (const [dir, size, fg] of [["mdpi", 48, 108], ["hdpi", 72, 162], ["xhdpi", 96, 216], ["xxhdpi", 144, 324], ["xxxhdpi", 192, 432]]) {
  const base = `frontend/android/app/src/main/res/mipmap-${dir}`;
  jobs.push([`${base}/ic_launcher.png`, size, size, rounded(), true]);
  jobs.push([`${base}/ic_launcher_round.png`, size, size, round, true]);
  jobs.push([`${base}/ic_launcher_foreground.png`, fg, fg, foreground, true]);
}
// Splash: the mark small in the middle of an ink screen (sizes as the existing files).
const splashes = [
  ["frontend/ios/App/App/Assets.xcassets/Splash.imageset/splash-2732x2732.png", 2732, 2732],
  ["frontend/ios/App/App/Assets.xcassets/Splash.imageset/splash-2732x2732-1.png", 2732, 2732],
  ["frontend/ios/App/App/Assets.xcassets/Splash.imageset/splash-2732x2732-2.png", 2732, 2732],
  ["frontend/android/app/src/main/res/drawable/splash.png", 480, 320],
  ["frontend/android/app/src/main/res/drawable-land-mdpi/splash.png", 480, 320],
  ["frontend/android/app/src/main/res/drawable-land-hdpi/splash.png", 800, 480],
  ["frontend/android/app/src/main/res/drawable-land-xhdpi/splash.png", 1280, 720],
  ["frontend/android/app/src/main/res/drawable-land-xxhdpi/splash.png", 1600, 960],
  ["frontend/android/app/src/main/res/drawable-land-xxxhdpi/splash.png", 1920, 1280],
  ["frontend/android/app/src/main/res/drawable-port-mdpi/splash.png", 320, 480],
  ["frontend/android/app/src/main/res/drawable-port-hdpi/splash.png", 480, 800],
  ["frontend/android/app/src/main/res/drawable-port-xhdpi/splash.png", 720, 1280],
  ["frontend/android/app/src/main/res/drawable-port-xxhdpi/splash.png", 960, 1600],
  ["frontend/android/app/src/main/res/drawable-port-xxxhdpi/splash.png", 1280, 1920],
];
for (const [path, w, h] of splashes) {
  const side = Math.min(w, h) * 0.22; // the mark's box on screen
  const body = `<rect width="${w}" height="${h}" fill="${INK}"/><g transform="translate(${(w - side) / 2} ${(h - side) / 2}) scale(${side / 64})">${mark()}</g>`;
  jobs.push([path, w, h, `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}">${body}</svg>`]);
}
const browser = await chromium.launch();
for (const [path, w, h, source, transparent] of jobs) {
  const page = await browser.newPage({ viewport: { width: w, height: h } });
  await page.setContent(`<html><body style="margin:0;background:transparent">${source.replace("<svg ", `<svg width="${w}" height="${h}" `)}</body></html>`);
  await page.screenshot({ path: `${root}/${path}`, omitBackground: Boolean(transparent) });
  await page.close();
}
await browser.close();
writeFileSync(`${root}/frontend/public/icon.svg`, `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">
  <rect width="64" height="64" rx="14" fill="${INK}"/>
  <path d="M15 41.5 L32 15.5 L49 41.5" fill="none" stroke="#fff" stroke-width="7" stroke-linecap="round" stroke-linejoin="round"/>
  <path d="M15 50 H49" stroke="${ROAD}" stroke-width="5.5" stroke-linecap="round"/>
</svg>
`);
console.log("rendered", jobs.length, "images");

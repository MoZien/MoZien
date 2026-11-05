// The ad's photos for the AI review, loaded on this device (like the ad itself, see device.ts) and
// made smaller here, so the server never contacts the platforms. The photo servers of the three
// platforms allow other sites to use their photos (CORS), so a plain <img> can load them and a
// canvas can turn them into a JPEG, in the app and in any browser.

export interface LoadedPhoto {
  url: string;
  data: string; // base64 JPEG, without the "data:" prefix
}

const PHOTO_URL = /^https:\/\/(?:img\.kleinanzeigen\.de|prod\.pictures\.autoscout24\.net|img-[a-z0-9-]+\.autohero\.com)\//i;
const MAX_PHOTOS = 6;
const MAX_SIDE = 1024; // px: details are visible and an image costs about 1,000 AI tokens
const QUALITY = 0.82;
const PHOTO_TIMEOUT_MS = 15_000;

/** The ad's first photos in a size of about 1000 px. The server picks the same ones
 *  (ai_photo_choice in src/cardeal/web/photos.py): keep the two alike. */
export function aiPhotoUrls(images: string[] | undefined, limit = MAX_PHOTOS): string[] {
  const urls: string[] = [];
  for (const image of images ?? []) {
    if (!PHOTO_URL.test(image || "")) continue;
    const url = image
      .replace(/rule=\$_\d+\.AUTO/, "rule=$_59.AUTO") // Kleinanzeigen: 960 px
      .replace(/\/\d+x\d+\.webp$/, "/1280x960.webp") // AutoScout24
      .replace(/\/\d+x\d+-([0-9a-f]+\.jpg)$/, "/1116x744-$1"); // Autohero
    if (!urls.includes(url)) urls.push(url);
    if (urls.length === limit) break;
  }
  return urls;
}

/** A copy of the URL the browser caches on its own: a copy cached for the ad's gallery (loaded
 *  without CORS) must not stand in for this one. */
const separateCopy = (url: string) => `${url}${url.includes("?") ? "&" : "?"}ah-ai=1`;

function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    const timer = setTimeout(() => {
      image.src = "";
      reject(new Error("timeout"));
    }, PHOTO_TIMEOUT_MS);
    image.crossOrigin = "anonymous";
    image.referrerPolicy = "no-referrer";
    image.decoding = "async";
    image.onload = () => {
      clearTimeout(timer);
      resolve(image);
    };
    image.onerror = () => {
      clearTimeout(timer);
      reject(new Error("photo not loaded"));
    };
    image.src = separateCopy(url);
  });
}

async function smallJpeg(url: string): Promise<string | null> {
  try {
    const image = await loadImage(url);
    const scale = Math.min(1, MAX_SIDE / Math.max(image.naturalWidth, image.naturalHeight, 1));
    const width = Math.max(1, Math.round(image.naturalWidth * scale));
    const height = Math.max(1, Math.round(image.naturalHeight * scale));
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext("2d");
    if (!context) return null;
    context.fillStyle = "#fff";
    context.fillRect(0, 0, width, height);
    context.drawImage(image, 0, 0, width, height);
    const dataUrl = canvas.toDataURL("image/jpeg", QUALITY); // throws if the photo server didn't allow it
    const comma = dataUrl.indexOf(",");
    return dataUrl.startsWith("data:image/jpeg") && comma > 0 ? dataUrl.slice(comma + 1) : null;
  } catch {
    return null;
  }
}

/** Loads the photos at the same time; ones that fail are left out. Never throws. */
export async function loadPhotos(urls: string[]): Promise<LoadedPhoto[]> {
  const wanted = urls.filter((url) => PHOTO_URL.test(url)).slice(0, MAX_PHOTOS);
  const loaded = await Promise.all(wanted.map(async (url) => ({ url, data: await smallJpeg(url) })));
  return loaded.filter((photo): photo is LoadedPhoto => Boolean(photo.data));
}

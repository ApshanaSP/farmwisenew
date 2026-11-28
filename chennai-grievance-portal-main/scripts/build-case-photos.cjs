#!/usr/bin/env node
/**
 * Makes the library of generated "after" photos for the daily generated resolutions (src/lib/cases/synthetic.ts), once: data/case-photos,
 * one JPEG per photo and index.json listing them IN A FIXED ORDER (a generated report folder names its photo by its place in the list,
 * src/lib/officer/photos.ts, so photos are only ever appended, never reordered). The site never calls an image model at run time.
 *
 * Tried in this order for each photo:
 *   1. Gemini's image model with GEMINI_API_KEY from .env (the key is never printed). On 27-28 Nov 2026 the key's free tier gave the image
 *      models a quota of 0 (HTTP 429), so this step is skipped after its first refusal.
 *   2. AI Horde (aihorde.net), the crowd-run open image generator, anonymously (its documented anonymous key 0000000000). Slow (minutes a
 *      photo in its queue) but keyless, and its images carry no watermark.
 *   3. Pollinations (image.pollinations.ai), keyless, only with --pollinations: it stamps its logo on anonymous images, and the logo is kept.
 *
 * Every photo's EXIF description says it is generated and by what; index.json says the same. Prompts ask for no people and no faces.
 *
 *   node scripts/build-case-photos.cjs [--only garbage,drain] [--per 2] [--workers 6] [--pollinations] [--no-gemini]
 *   node scripts/build-case-photos.cjs --no-gemini --redo garbage-1.jpg,road-1.jpg --redo-round 1   (a poor photo made
 *   again, kept at its place in index.json: a report names its photo by that place)
 *
 * Run from the portal folder. Behind Avast, set NODE_EXTRA_CA_CERTS to its certificate. Needs sharp (installed with Next.js).
 */
const fs = require("fs");
const path = require("path");
const sharp = require("sharp");

const root = path.resolve(__dirname, "..");
const out = path.join(root, "data", "case-photos");
const args = process.argv.slice(2);
const arg = (n, d) => { const k = args.indexOf(`--${n}`); return k >= 0 ? args[k + 1] : d; };
const per = Math.max(1, Math.min(4, Number(arg("per", "2")) || 2));
const only = arg("only", "") ? arg("only", "").split(",") : null;
const AGENT = "case-photos:1.0:anonymous";
/** another seed for a photo made again (--redo-round n) */
const redoRound = Math.max(0, Number(arg("redo-round", "0")) || 0);

const STYLE = "Realistic smartphone photo taken by a municipal field officer in Chennai, India, right after the work was finished. Daylight, eye level, natural colours, ordinary framing.";
const NEG = "people, person, man, woman, child, face, faces, crowd, hands, text, letters, signboard text, watermark, logo, cartoon, illustration, painting, render, blurry";
/** what an "after" photo of each set must not show (the problem the work removed) */
const AFTER_NEG = {
  garbage: "garbage, litter, trash, plastic bags, rubbish heap, puddle, standing water", streetlight: "broken lamp, dark street",
  waterlogging: "puddle, puddles, standing water, water reflection, flood, waterlogged road", drain: "garbage, litter, sludge, overflowing drain", road: "crack, cracks, pothole, damaged road, broken asphalt",
  toilet: "dirt, stains, broken tiles", tree: "fallen tree lying across the road, uprooted tree", footpath: "vendors, stalls, parked cars on footpath, garbage", junction: "crashed car, wreck, debris",
  wall: "", pipe: "leak, water gushing, flooded pit, standing water, canal, river", bund: "breach, flood",
  street: "garbage, litter, puddle, standing water, open drain, canal", barricade: "flood, standing water, puddle, empty road"
};
/** one scene per set; each set gets `per` photos (seeds differ) */
const SETS = {
  garbage: ["a clean dry street corner where a garbage heap was just cleared, swept tarmac, white lime powder sprinkled on the ground, an empty green municipal waste bin against a compound wall",
    "a cleared vacant plot beside a residential street, swept ground sprinkled with white bleaching powder, an empty blue municipal bin"],
  streetlight: ["a new LED street light glowing on a concrete pole over a quiet residential street at dusk",
    "LED street lights lit along a narrow residential lane in the early evening, houses with gates on both sides"],
  waterlogging: ["a dry city road after the flood water was drained, damp tarmac with no standing water, a cleaned storm-water drain grating at the kerb",
    "a dry sunny residential road after the rainwater was pumped out, no water on the road, a cleaned drain inlet grating at the kerb, a rolled hose at the roadside"],
  drain: ["an open concrete storm-water drain cleaned of silt beside a road, water flowing, removed silt heaped neatly at the side",
    "a cleaned roadside drain channel with new concrete slab covers placed over it"],
  road: ["a smooth city road with a fresh square patch of new black asphalt where a pothole was filled, the patch level with the road",
    "a smooth newly resurfaced stretch of city road with fresh black asphalt and a neatly finished kerb"],
  toilet: ["the outside of a clean public toilet block with tiled walls and freshly washed floor, doors open, small building",
    "a clean washbasin area of a public toilet with tiled walls, floor washed, daylight from a window"],
  barricade: ["orange and white striped plastic road barricades standing in a row around a rectangular excavated pit at the side of a city road, dry day",
    "a line of red and white metal barricades with reflective strips fencing off a roadside trench, a steel plate laid over the trench at a crossing"],
  tree: ["a fallen tree cut into logs and stacked at the roadside, the road clear, the footpath swept",
    "a road shoulder where a fallen tree was cut up and removed, a few cut logs stacked neatly, sawdust on the ground, the road clear"],
  footpath: ["a clear tiled pedestrian footpath along a commercial street after encroachments were removed",
    "a clear road shoulder and footpath with a no parking signpost, no vehicles parked"],
  junction: ["a road junction cleared after an accident, the road swept, traffic cones stacked at the edge",
    "a clear city road junction with a median and traffic signal, the road clean"],
  wall: ["an old damaged compound wall propped with wooden supports and fenced with red and white barricade tape",
    "a section of brick wall brought down safely with the bricks stacked neatly beside it"],
  pipe: ["a repaired water pipeline in a small dry pit at the roadside, a new blue pipe joint visible, a heap of sand ready to refill the pit",
    "a freshly refilled and levelled patch of dry earth beside a road where a water pipe was repaired, a new valve chamber cover in the ground"],
  bund: ["a lake bund strengthened with stacked sandbags along the water's edge",
    "a cleared sluice gate at a lake inlet, silt removed, water flowing through"],
  street: ["a quiet clean residential street in the morning, swept road, houses with gates",
    "a clean dry lane with concrete slabs covering the drains, the road swept, houses with gates, early morning light"]
};

function env(name) {
  try { const m = new RegExp(`^${name}=(.*)$`, "m").exec(fs.readFileSync(path.join(root, ".env"), "utf8")); return m ? m[1].trim().replace(/^["']|["']$/g, "") : ""; } catch { return ""; }
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let geminiOff = args.includes("--no-gemini");

async function gemini(prompt) {
  const key = env("GEMINI_API_KEY");
  if (geminiOff || !key) return null;
  const r = await fetch("https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-image:generateContent", {
    method: "POST", headers: { "x-goog-api-key": key, "content-type": "application/json" },
    body: JSON.stringify({ contents: [{ parts: [{ text: `${prompt} No people, no faces, no text.` }] }], generationConfig: { responseModalities: ["IMAGE", "TEXT"] } })
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) { console.log(`  Gemini refused (HTTP ${r.status}): not tried again this run`); geminiOff = true; return null; }
  const part = (j.candidates?.[0]?.content?.parts ?? []).find((p) => p.inlineData?.data);
  return part ? { buf: Buffer.from(part.inlineData.data, "base64"), source: "Gemini gemini-2.5-flash-image" } : null;
}

// AI Horde takes at most 2 requests a second from one client: submissions go out one at a time, 2 s apart, and a 429 waits and tries again
let lastSubmit = Promise.resolve();
function submitTurn() {
  const mine = lastSubmit.then(() => sleep(2000));
  lastSubmit = mine;
  return mine;
}

async function horde(prompt, seed, neg = NEG) {
  let sub, sj;
  for (let attempt = 0; attempt < 6; attempt++) {
    await submitTurn();
    sub = await fetch("https://aihorde.net/api/v2/generate/async", {
      method: "POST", headers: { apikey: "0000000000", "Client-Agent": AGENT, "content-type": "application/json" },
      body: JSON.stringify({ prompt: `${prompt} ### ${neg}`, params: { width: 768, height: 576, steps: 25, n: 1, sampler_name: "k_euler_a", cfg_scale: 7, seed: String(seed) },
        nsfw: false, censor_nsfw: true, r2: true, models: ["AlbedoBase XL (SDXL)"] })
    });
    sj = await sub.json().catch(() => ({}));
    if (sub.status !== 429) break;
    await sleep(5000 * (attempt + 1));
  }
  if (!sub.ok || !sj.id) { console.log(`  AI Horde refused: HTTP ${sub.status} ${JSON.stringify(sj).slice(0, 160)}`); return null; }
  const t0 = Date.now();
  for (;;) {
    await sleep(20_000);
    const c = await (await fetch(`https://aihorde.net/api/v2/generate/check/${sj.id}`, { headers: { "Client-Agent": AGENT } })).json().catch(() => ({}));
    if (c.faulted || c.is_possible === false) { console.log("  AI Horde could not make it"); return null; }
    if (c.done) break;
    if (Date.now() - t0 > 40 * 60_000) { console.log("  AI Horde: gave up after 40 minutes"); return null; }
  }
  const st = await (await fetch(`https://aihorde.net/api/v2/generate/status/${sj.id}`, { headers: { "Client-Agent": AGENT } })).json();
  const g = st.generations?.[0];
  if (!g?.img || g.censored) return null;
  const img = await fetch(g.img);
  return img.ok ? { buf: Buffer.from(await img.arrayBuffer()), source: `AI Horde (aihorde.net, anonymous), ${g.model ?? "SDXL"}` } : null;
}

async function pollinations(prompt, seed) {
  if (!args.includes("--pollinations")) return null;
  const r = await fetch(`https://image.pollinations.ai/prompt/${encodeURIComponent(`${prompt} No people.`)}?width=1024&height=768&seed=${seed}`);
  return r.ok ? { buf: Buffer.from(await r.arrayBuffer()), source: "Pollinations (image.pollinations.ai, keyless; its logo kept)" } : null;
}

async function one(set, k, scene) {
  const file = `${set}-${k + 1}.jpg`;
  const prompt = `${STYLE} ${scene}.`;
  const seed = 1000 + Object.keys(SETS).indexOf(set) * 10 + k;
  const neg = [NEG, AFTER_NEG[set]].filter(Boolean).join(", ");
  const got = (await gemini(prompt)) ?? (await horde(prompt, seed + 100 * redoRound, neg)) ?? (await pollinations(prompt, seed));
  if (!got) return null;
  const desc = `Generated image (${got.source}) for the District IQ demo's generated resolutions; not a real photograph. Scene: ${scene}`;
  await sharp(got.buf).rotate().resize({ width: 1280, height: 1280, fit: "inside", withoutEnlargement: true }).jpeg({ quality: 82, mozjpeg: true })
    .withExif({ IFD0: { ImageDescription: desc.slice(0, 400), Software: "District IQ case-photo builder" } }).toFile(path.join(out, file));
  return { file, group: set, source: got.source, made: new Date(Date.now() + 5.5 * 3600_000).toISOString().slice(0, 10), prompt: scene };
}

(async () => {
  fs.mkdirSync(out, { recursive: true });
  const idxFile = path.join(out, "index.json");
  const index = fs.existsSync(idxFile) ? JSON.parse(fs.readFileSync(idxFile, "utf8")) : { about: "", files: [] };
  index.about = "Generated photos (not real photographs) used as the 'after' photo of the daily generated resolutions (src/lib/cases/synthetic.ts). Append only: a report folder names its photo by its place in `files`. Made by scripts/build-case-photos.cjs.";
  // --redo a,b: makes those photos again (a poor result), each kept at its place in the list (a report names its photo by that place), so
  // a report made before shows the new photo
  const redo = arg("redo", "") ? arg("redo", "").split(",").map((f) => f.trim()).filter(Boolean) : [];
  const have = new Set(index.files.map((f) => f.file).filter((f) => !redo.includes(f)));
  const jobs = [];
  for (const [set, scenes] of Object.entries(SETS)) {
    if (only && !only.includes(set)) continue;
    for (let k = 0; k < per; k++) if (!have.has(`${set}-${k + 1}.jpg`)) jobs.push([set, k, scenes[k % scenes.length]]);
  }
  console.log(`${jobs.length} photos to make`);
  // a few at a time (AI Horde queues anonymous requests; each waits its turn there)
  const save = () => fs.writeFileSync(idxFile, JSON.stringify(index, null, 1) + "\n");
  let next = 0;
  const worker = async () => {
    while (next < jobs.length) {
      const [set, k, scene] = jobs[next++];
      try {
        const e = await one(set, k, scene);
        if (e) {
          const at = index.files.findIndex((f) => f.file === e.file);
          if (at >= 0) index.files[at] = e; else index.files.push(e);
          save();
          console.log(`made ${e.file} (${e.source})`);
        } else console.log(`could not make ${set}-${k + 1}.jpg`);
      } catch (err) { console.log(`failed ${set}-${k + 1}.jpg: ${err.message}`); }
    }
  };
  await Promise.all(Array.from({ length: Math.max(1, Math.min(8, Number(arg("workers", "6")) || 6)) }, worker));
  save();
  console.log(`library: ${index.files.length} photos in ${out}`);
})().catch((e) => { console.error(e); process.exit(1); });

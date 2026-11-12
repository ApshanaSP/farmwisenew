// makes a small real JPEG-like photo (a screenshot of a drawn page) for the upload step
import { chromium } from "playwright";
const br = await chromium.launch({ args: ["--mute-audio"] });
const p = await br.newPage({ viewport: { width: 800, height: 600 } });
await p.setContent('<body style="margin:0;background:linear-gradient(#9cc,#665)"><div style="position:absolute;left:250px;top:200px;width:300px;height:300px;background:#3a5;border-radius:20px"></div><h1 style="color:#fff">Overflowing bin</h1></body>');
await p.screenshot({ path: "../docs/qa/pass4/evidence/journeys/citizen-photo-fixture.jpg", type: "jpeg", quality: 80 });
await br.close();

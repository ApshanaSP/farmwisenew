import { snap } from "./snap.mjs";
console.log(JSON.stringify(await snap(process.argv[2], "pre"), null, 1));

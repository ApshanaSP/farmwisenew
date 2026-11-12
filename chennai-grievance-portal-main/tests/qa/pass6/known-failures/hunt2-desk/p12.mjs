import { track } from "./h.mjs";
console.log(JSON.stringify(await track(process.argv[2], process.argv[3])).slice(0, 2000));

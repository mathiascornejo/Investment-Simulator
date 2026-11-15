// Runs simulate() off the page's main thread so a big run doesn't freeze the tab.
import { simulate } from "./montecarlo.js";
onmessage = (e) => postMessage(simulate(e.data));

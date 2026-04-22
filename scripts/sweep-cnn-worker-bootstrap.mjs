import { register } from "tsx/esm/api";
import { pathToFileURL } from "node:url";
import path from "node:path";

register();

const target = pathToFileURL(
  path.resolve(import.meta.dirname, "sweep-cnn-feasibility.ts")
).href;

await import(target);

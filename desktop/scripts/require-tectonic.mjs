import { ensureTectonicAvailable } from "./tectonic.mjs";

try {
  const resolved = ensureTectonicAvailable();
  console.log(`Using tectonic from ${resolved.source}: ${resolved.path}`);
} catch (error) {
  console.error(String(error.message || error));
  process.exit(1);
}

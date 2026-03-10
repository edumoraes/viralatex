import { installManagedBinary, managedTectonicPath } from "./tectonic.mjs";

try {
  const sourcePath = process.argv[2];
  const destination = installManagedBinary({ sourcePath });
  console.log(`Installed tectonic at ${destination}`);
  if (destination === managedTectonicPath()) {
    console.log("The desktop app can now render resumes without setting TECTONIC_BIN.");
  }
} catch (error) {
  console.error(String(error.message || error));
  process.exit(1);
}

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DESKTOP_ROOT = path.resolve(__dirname, "..");
const REPO_ROOT = path.resolve(DESKTOP_ROOT, "..");
const MANAGED_TECTONIC_PATH = path.join(DESKTOP_ROOT, "src-tauri", "binaries", "tectonic");

export function tectonicErrorMessage() {
  return "Tectonic executable not found. Run 'bin/setup-tectonic' to install it, pass a path to the installer, or set TECTONIC_BIN.";
}

export function resolveTectonicBinary({
  env = process.env,
  managedPath = MANAGED_TECTONIC_PATH,
  pathLookup = lookupTectonicInPath
} = {}) {
  if (env.TECTONIC_BIN && fs.existsSync(env.TECTONIC_BIN)) {
    return { path: env.TECTONIC_BIN, source: "env" };
  }

  if (fs.existsSync(managedPath)) {
    return { path: managedPath, source: "managed" };
  }

  const pathBinary = pathLookup();
  if (pathBinary) {
    return { path: pathBinary, source: "path" };
  }

  return null;
}

export function ensureTectonicAvailable(options = {}) {
  const resolved = resolveTectonicBinary(options);
  if (!resolved) {
    throw new Error(tectonicErrorMessage());
  }
  return resolved;
}

export function installManagedBinary({
  sourcePath,
  destinationPath = MANAGED_TECTONIC_PATH,
  platform = process.platform,
  arch = process.arch,
  env = process.env,
  pathLookup = lookupTectonicInPath
} = {}) {
  const explicitSource = sourcePath || env.TECTONIC_BIN || pathLookup();
  if (explicitSource) {
    copyBinary(explicitSource, destinationPath);
    return destinationPath;
  }

  if (platform !== "linux" || arch !== "x64") {
    throw new Error(
      "Automatic tectonic download is currently supported only on Linux x64. Provide a binary path explicitly or set TECTONIC_BIN."
    );
  }

  downloadTectonicViaOfficialInstaller(destinationPath);
  return destinationPath;
}

export function managedTectonicPath() {
  return MANAGED_TECTONIC_PATH;
}

function lookupTectonicInPath() {
  const result = spawnSync("sh", ["-lc", "command -v tectonic"], {
    encoding: "utf-8"
  });
  if (result.status === 0) {
    const resolved = result.stdout.trim();
    return resolved || null;
  }
  return null;
}

function copyBinary(sourcePath, destinationPath) {
  if (!fs.existsSync(sourcePath)) {
    throw new Error(`tectonic binary not found at: ${sourcePath}`);
  }

  fs.mkdirSync(path.dirname(destinationPath), { recursive: true });
  fs.copyFileSync(sourcePath, destinationPath);
  fs.chmodSync(destinationPath, 0o755);
}

function downloadTectonicViaOfficialInstaller(destinationPath) {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "tectonic-download-"));

  try {
    const command = "curl --proto '=https' --tlsv1.2 -fsSL https://drop-sh.fullyjustified.net | sh";
    const result = spawnSync("sh", ["-lc", command], {
      cwd: tempRoot,
      encoding: "utf-8"
    });

    if (result.status !== 0) {
      throw new Error(result.stderr.trim() || "Failed to download tectonic.");
    }

    const downloadedBinary = path.join(tempRoot, "tectonic");
    copyBinary(downloadedBinary, destinationPath);
  } finally {
    fs.rmSync(tempRoot, { recursive: true, force: true });
  }
}

export { DESKTOP_ROOT, REPO_ROOT };

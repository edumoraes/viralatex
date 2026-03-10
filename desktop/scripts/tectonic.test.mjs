// @vitest-environment node

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import {
  ensureTectonicAvailable,
  installManagedBinary,
  resolveTectonicBinary
} from "./tectonic.mjs";

const tempRoots = [];

function makeTempRoot() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "tectonic-test-"));
  tempRoots.push(root);
  return root;
}

afterEach(() => {
  while (tempRoots.length > 0) {
    fs.rmSync(tempRoots.pop(), { recursive: true, force: true });
  }
});

describe("resolveTectonicBinary", () => {
  it("prefers env override, then managed binary, then PATH lookup", () => {
    const root = makeTempRoot();
    const envBinary = path.join(root, "env-tectonic");
    const managedBinary = path.join(root, "managed", "tectonic");
    const pathBinary = path.join(root, "path", "tectonic");

    fs.mkdirSync(path.dirname(managedBinary), { recursive: true });
    fs.mkdirSync(path.dirname(pathBinary), { recursive: true });
    fs.writeFileSync(envBinary, "env");
    fs.writeFileSync(managedBinary, "managed");
    fs.writeFileSync(pathBinary, "path");

    expect(
      resolveTectonicBinary({
        env: { TECTONIC_BIN: envBinary },
        managedPath: managedBinary,
        pathLookup: () => pathBinary
      })
    ).toEqual({ path: envBinary, source: "env" });

    fs.rmSync(envBinary);
    expect(
      resolveTectonicBinary({
        env: {},
        managedPath: managedBinary,
        pathLookup: () => pathBinary
      })
    ).toEqual({ path: managedBinary, source: "managed" });

    fs.rmSync(managedBinary);
    expect(
      resolveTectonicBinary({
        env: {},
        managedPath: managedBinary,
        pathLookup: () => pathBinary
      })
    ).toEqual({ path: pathBinary, source: "path" });
  });

  it("throws an actionable error when tectonic is unavailable", () => {
    expect(() =>
      ensureTectonicAvailable({
        env: {},
        managedPath: "/tmp/missing-tectonic",
        pathLookup: () => null
      })
    ).toThrow(/bin\/setup-tectonic/);
  });
});

describe("installManagedBinary", () => {
  it("copies a provided binary into the managed location", () => {
    const root = makeTempRoot();
    const sourceBinary = path.join(root, "source-tectonic");
    const managedBinary = path.join(root, "managed", "tectonic");

    fs.writeFileSync(sourceBinary, "#!/bin/sh\nexit 0\n", { mode: 0o755 });

    const destination = installManagedBinary({
      sourcePath: sourceBinary,
      destinationPath: managedBinary
    });

    expect(destination).toBe(managedBinary);
    expect(fs.existsSync(managedBinary)).toBe(true);
    expect(fs.statSync(managedBinary).mode & 0o111).not.toBe(0);
  });
});

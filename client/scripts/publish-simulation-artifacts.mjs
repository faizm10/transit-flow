#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import { createReadStream } from "node:fs";
import { access, readdir, stat } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { put } from "@vercel/blob";

const LARGE_FILE_BYTES = 64 * 1024 * 1024;
const CACHE_MAX_AGE_SECONDS = 300;

function parseArgs(argv) {
  const options = {
    dryRun: false,
    skipBuild: false,
    prefix: "simulation",
    feed: "gotransit",
    source: "gotransit",
    inputDir: null,
    outputDir: null,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--dry-run") {
      options.dryRun = true;
      continue;
    }
    if (arg === "--skip-build") {
      options.skipBuild = true;
      continue;
    }
    if (arg === "--prefix" && argv[index + 1]) {
      options.prefix = argv[index + 1];
      index += 1;
      continue;
    }
    if (arg === "--feed" && argv[index + 1]) {
      options.feed = argv[index + 1];
      index += 1;
      continue;
    }
    if (arg === "--source" && argv[index + 1]) {
      options.source = argv[index + 1];
      index += 1;
      continue;
    }
    if (arg === "--input-dir" && argv[index + 1]) {
      options.inputDir = argv[index + 1];
      index += 1;
      continue;
    }
    if (arg === "--output-dir" && argv[index + 1]) {
      options.outputDir = argv[index + 1];
      index += 1;
      continue;
    }
    throw new Error(`Unknown argument: ${arg}`);
  }

  return options;
}

function normalizePrefix(value) {
  return value.trim().replace(/^\/+|\/+$/g, "");
}

function formatBytes(bytes) {
  const units = ["B", "KB", "MB", "GB", "TB"];
  let value = bytes;
  let unitIndex = 0;
  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024;
    unitIndex += 1;
  }
  return `${value.toFixed(value >= 10 || unitIndex === 0 ? 0 : 1)} ${units[unitIndex]}`;
}

async function listJsonFiles(rootDir) {
  const entries = await readdir(rootDir, { withFileTypes: true });
  const files = [];

  for (const entry of entries) {
    const absolutePath = path.join(rootDir, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await listJsonFiles(absolutePath)));
      continue;
    }
    if (entry.isFile() && entry.name.endsWith(".json")) {
      files.push(absolutePath);
    }
  }

  return files;
}

function shouldIncludeArtifact(relativePath) {
  return (
    relativePath === "manifest.json" ||
    relativePath.startsWith("routes/") ||
    relativePath.startsWith("service-dates/")
  );
}

function ensureSuccessful(status, command) {
  if (status !== 0) {
    throw new Error(`${command} failed with exit code ${status ?? "unknown"}`);
  }
}

async function main() {
  const scriptDir = path.dirname(fileURLToPath(import.meta.url));
  const clientDir = path.resolve(scriptDir, "..");
  const repoDir = path.resolve(clientDir, "..");
  const options = parseArgs(process.argv.slice(2));
  const prefix = normalizePrefix(options.prefix);
  const inputDir = path.resolve(clientDir, options.inputDir ?? "./public/gotransit");
  const outputDir = path.resolve(
    clientDir,
    options.outputDir ?? `./public/${options.feed}/derived/simulation`,
  );
  const buildScriptPath = path.resolve(repoDir, "scripts/build_simulation_artifacts.py");
  const manifestPath = path.join(outputDir, "manifest.json");

  if (!options.skipBuild) {
    console.log(`Building simulation artifacts for ${options.feed}...`);
    const build = spawnSync(
      "python3",
      [
        buildScriptPath,
        "--input_dir",
        inputDir,
        "--output_dir",
        outputDir,
        "--source",
        options.source,
      ],
      {
        cwd: repoDir,
        stdio: "inherit",
      },
    );
    ensureSuccessful(build.status, "build_simulation_artifacts.py");
  }

  await access(manifestPath);
  const jsonFiles = (await listJsonFiles(outputDir))
    .map((absolutePath) => ({
      absolutePath,
      relativePath: path.relative(outputDir, absolutePath).replaceAll(path.sep, "/"),
    }))
    .filter((file) => shouldIncludeArtifact(file.relativePath))
    .sort((left, right) => left.relativePath.localeCompare(right.relativePath));

  if (jsonFiles.length === 0) {
    throw new Error(`No simulation artifacts found under ${outputDir}`);
  }

  let totalBytes = 0;
  for (const file of jsonFiles) {
    const fileStats = await stat(file.absolutePath);
    file.size = fileStats.size;
    totalBytes += fileStats.size;
  }

  console.log(
    `Prepared ${jsonFiles.length} artifact files from ${outputDir} (${formatBytes(totalBytes)}).`,
  );

  if (options.dryRun) {
    console.log("Dry run enabled. No Blob uploads were performed.");
    console.log(`Blob path prefix: ${prefix}/${options.feed}`);
    console.log("Example uploaded path:");
    console.log(`  ${prefix}/${options.feed}/${jsonFiles[0].relativePath}`);
    console.log("After a real upload, set SIMULATION_DATA_MODE=remote.");
    console.log(
      "After a real upload, set SIMULATION_ARTIFACT_BASE_URL to the returned Blob origin plus the prefix.",
    );
    return;
  }

  const token = process.env.BLOB_READ_WRITE_TOKEN?.trim();
  if (!token) {
    throw new Error("BLOB_READ_WRITE_TOKEN is required for Blob uploads.");
  }

  let firstUploadedUrl = null;

  for (let index = 0; index < jsonFiles.length; index += 1) {
    const file = jsonFiles[index];
    const pathname = `${prefix}/${options.feed}/${file.relativePath}`;
    console.log(
      `[${index + 1}/${jsonFiles.length}] Uploading ${pathname} (${formatBytes(file.size)})`,
    );
    const result = await put(pathname, createReadStream(file.absolutePath), {
      token,
      access: "public",
      addRandomSuffix: false,
      allowOverwrite: true,
      cacheControlMaxAge: CACHE_MAX_AGE_SECONDS,
      contentType: "application/json; charset=utf-8",
      multipart: file.size >= LARGE_FILE_BYTES,
    });

    if (!firstUploadedUrl) {
      firstUploadedUrl = result.url;
    }
  }

  if (!firstUploadedUrl) {
    throw new Error("Blob upload completed without returning a public URL.");
  }

  const baseUrl = `${new URL(firstUploadedUrl).origin}/${prefix}`;
  console.log("");
  console.log("Simulation artifacts published.");
  console.log(`Uploaded ${jsonFiles.length} files (${formatBytes(totalBytes)}).`);
  console.log(`SIMULATION_DATA_MODE=remote`);
  console.log(`SIMULATION_ARTIFACT_BASE_URL=${baseUrl}`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});

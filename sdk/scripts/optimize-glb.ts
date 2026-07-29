/* eslint-disable no-console */
import { join, dirname, resolve } from "node:path";
import { mkdir, readdir } from "node:fs/promises";

import { NodeIO } from "@gltf-transform/core";
import {
  center,
  dedup,
  flatten,
  join as joinMeshes,
  palette,
  prune,
  resample,
  sparse,
  textureCompress,
  weld,
} from "@gltf-transform/functions";

const io = new NodeIO();

async function processFile(input: string, output: string) {
  console.log("Processing:", input);

  const glb = await io.read(input);

  await glb.transform(
    center({ pivot: "below" }),
    prune(),
    dedup(),
    palette({ min: 5 }),
    // tangents({ generateTangents }),
    flatten(),
    joinMeshes(),
    weld(),
    prune(),
    /*simplify({
      simplifier: MeshoptSimplifier,
      error: 0.0001,
      ratio: 0.0,
      lockBorder: true,
    }),*/
    resample(),
    sparse({ ratio: 0.2 }),
    textureCompress({
      targetFormat: "jpeg",
      resize: [1024, 1024],
    }),
    prune(),
  );

  await mkdir(dirname(output), { recursive: true });
  await io.write(output, glb);
}

async function walk(inputDir: string, outputDir: string) {
  const entries = await readdir(inputDir, { withFileTypes: true });

  for (const entry of entries) {
    const inputPath = join(inputDir, entry.name);
    const outputPath = join(outputDir, entry.name);

    if (entry.isDirectory()) {
      await walk(inputPath, outputPath);
    } else if (entry.isFile() && entry.name.toLowerCase().endsWith(".glb")) {
      try {
        await processFile(inputPath, outputPath);
      } catch (error) {
        console.error(`Error processing ${inputPath}:`, error);
      }
    }
  }
}

async function main() {
  const inputDir = process.argv[2];
  const outputDir = process.argv[3];

  if (!inputDir || !outputDir) {
    console.error("Usage: optimize-glb.ts <inputDir> <outputDir>");
    process.exit(1);
  }

  await walk(resolve(inputDir), resolve(outputDir));
}

main().catch((err: unknown) => {
  console.error(err);
  process.exit(1);
});

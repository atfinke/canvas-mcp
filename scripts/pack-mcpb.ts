import { execFileSync } from "node:child_process";
import { cp, mkdir, readFile, rm } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

type PackageMetadata = {
  name: string;
  version: string;
};

type ManifestMetadata = {
  name: string;
  version: string;
};

const scriptDir = dirname(fileURLToPath(import.meta.url));
const projectRoot = resolve(scriptDir, "..");
const bundleDir = join(projectRoot, ".mcpb-build");
const releasesDir = join(projectRoot, "releases");

async function main(): Promise<void> {
  const packageMetadata = await readPackageMetadata();
  const manifestMetadata = await readManifestMetadata();
  const outputPath = join(releasesDir, `${packageMetadata.name}-${packageMetadata.version}.mcpb`);

  validateManifestAlignment(packageMetadata, manifestMetadata);

  run(npmCommand(), ["run", "build"], projectRoot);
  await prepareBundleDirectory();
  run(npmCommand(), ["ci", "--omit=dev", "--ignore-scripts"], bundleDir);
  run(npxCommand(), ["mcpb", "validate", join(bundleDir, "manifest.json")], projectRoot);
  await mkdir(releasesDir, { recursive: true });
  await rm(outputPath, { force: true });
  run(npxCommand(), ["mcpb", "pack", bundleDir, outputPath], projectRoot);
}

async function readPackageMetadata(): Promise<PackageMetadata> {
  const packageJsonPath = join(projectRoot, "package.json");
  const rawPackageJson = await readFile(packageJsonPath, "utf8");
  return JSON.parse(rawPackageJson) as PackageMetadata;
}

async function readManifestMetadata(): Promise<ManifestMetadata> {
  const manifestPath = join(projectRoot, "manifest.json");
  const rawManifest = await readFile(manifestPath, "utf8");
  return JSON.parse(rawManifest) as ManifestMetadata;
}

async function prepareBundleDirectory(): Promise<void> {
  await rm(bundleDir, { recursive: true, force: true });
  await mkdir(bundleDir, { recursive: true });

  await copyIntoBundle("dist");
  await copyIntoBundle("LICENSE");
  await copyIntoBundle("README.md");
  await copyIntoBundle("manifest.json");
  await copyIntoBundle("package.json");
  await copyIntoBundle("package-lock.json");
}

async function copyIntoBundle(relativePath: string): Promise<void> {
  await cp(join(projectRoot, relativePath), join(bundleDir, relativePath), {
    recursive: true,
  });
}

function run(command: string, args: string[], cwd: string): void {
  console.log(`> ${command} ${args.join(" ")}`);

  execFileSync(command, args, {
    cwd,
    stdio: "inherit",
  });
}

function validateManifestAlignment(
  packageMetadata: PackageMetadata,
  manifestMetadata: ManifestMetadata,
): void {
  if (packageMetadata.name !== manifestMetadata.name) {
    throw new Error(
      `manifest.json name (${manifestMetadata.name}) does not match package.json name (${packageMetadata.name})`,
    );
  }

  if (packageMetadata.version !== manifestMetadata.version) {
    throw new Error(
      `manifest.json version (${manifestMetadata.version}) does not match package.json version (${packageMetadata.version})`,
    );
  }
}

function npmCommand(): string {
  return process.platform === "win32" ? "npm.cmd" : "npm";
}

function npxCommand(): string {
  return process.platform === "win32" ? "npx.cmd" : "npx";
}

await main();

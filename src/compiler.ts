import { writeFileSync, mkdirSync, existsSync, readFileSync } from "fs";
import { join, basename } from "path";

/**
 * Extracts compiled replay scripts from the agent's final output and saves
 * them for direct execution via `playwright-cli run-code`.
 */

export function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

/**
 * Derive the replay filename from a feature file path.
 * e.g. "financial.feature" → "financial-replay.js"
 *      "order-creation.feature" → "order-creation-replay.js"
 */
export function replayFilename(featurePath: string): string {
  const base = basename(featurePath, ".feature");
  return `${base}-replay.js`;
}

/**
 * Extract the replay script from the agent's final result text.
 * The agent outputs a fenced code block tagged `replay` containing
 * an async function suitable for `playwright-cli run-code`.
 */
export function extractReplayScript(resultText: string): string | null {
  const match = resultText.match(/```replay\n([\s\S]*?)```/);
  if (match) {
    return match[1].trim();
  }
  return null;
}

/**
 * Save a compiled replay script to disk.
 */
export function saveCompiledScript(
  projectRoot: string,
  domain: string,
  featurePath: string,
  script: string,
): string {
  const compiledDir = join(projectRoot, "features", "compiled", domain);
  mkdirSync(compiledDir, { recursive: true });

  const scriptPath = join(compiledDir, replayFilename(featurePath));
  writeFileSync(scriptPath, script);
  return scriptPath;
}

/**
 * Check if a compiled script exists for a domain + feature.
 */
export function hasCompiledScript(
  projectRoot: string,
  domain: string,
  featurePath: string,
): boolean {
  const scriptPath = join(
    projectRoot,
    "features",
    "compiled",
    domain,
    replayFilename(featurePath),
  );
  return existsSync(scriptPath);
}

/**
 * Load a compiled script from disk.
 */
export function loadCompiledScript(
  projectRoot: string,
  domain: string,
  featurePath: string,
): string {
  const scriptPath = join(
    projectRoot,
    "features",
    "compiled",
    domain,
    replayFilename(featurePath),
  );
  return readFileSync(scriptPath, "utf-8");
}

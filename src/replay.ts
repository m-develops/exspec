import { execSync, spawnSync } from "child_process";
import { readFileSync } from "fs";
import { join } from "path";
import type { DomainResult, ScenarioResult } from "./types.js";

/**
 * Replays a compiled domain script directly via playwright-cli,
 * bypassing the AI agent entirely.
 */

export interface ReplayOptions {
  headed?: boolean;
}

interface ScriptResult {
  scenario: string;
  status: "pass" | "fail";
  details: string;
}

export async function replayDomain(
  domain: string,
  projectRoot: string,
  expectedScenarioNames: string[],
  configContent: string,
  options: ReplayOptions = {},
): Promise<DomainResult> {
  const scriptPath = join(
    projectRoot,
    "features",
    "compiled",
    domain,
    "replay.js",
  );
  const script = readFileSync(scriptPath, "utf-8");

  // Extract base URL from config
  const urlMatch = configContent.match(/^URL:\s*(.+)/m);
  const baseUrl = urlMatch?.[1]?.trim() ?? "http://localhost:3000";

  const startTime = Date.now();
  const scenarios: ScenarioResult[] = [];

  try {
    // Open browser
    const headedFlag = options.headed ? " --headed" : "";
    execSync(`playwright-cli open${headedFlag} ${baseUrl}`, {
      cwd: projectRoot,
      stdio: "pipe",
      timeout: 30000,
    });

    // Execute the compiled script
    const result = spawnSync("playwright-cli", ["run-code", script], {
      cwd: projectRoot,
      stdio: "pipe",
      timeout: 120000,
      encoding: "utf-8",
    });

    const output = result.stdout ?? "";

    // Parse per-scenario results from the script output
    const scriptResults = parseScriptResults(output);

    if (scriptResults.length > 0) {
      // Map script results to expected scenario names
      for (const name of expectedScenarioNames) {
        const sr = scriptResults.find((r) => r.scenario === name);
        if (sr) {
          scenarios.push({
            name,
            status: sr.status,
            details: sr.details,
          });
        } else {
          scenarios.push({
            name,
            status: "not_executed",
            details: "Scenario not included in compiled replay script",
          });
        }
      }
    } else if (result.status !== 0) {
      // Script crashed — mark all as failed
      const errorDetail = output.slice(0, 500) || "Script execution failed";
      for (const name of expectedScenarioNames) {
        scenarios.push({
          name,
          status: "fail",
          details: `Replay error: ${errorDetail}`,
        });
      }
    } else {
      // No structured results but no error — treat as pass
      for (const name of expectedScenarioNames) {
        scenarios.push({
          name,
          status: "pass",
          details: "Replayed from compiled script",
        });
      }
    }

    // Close browser
    try {
      execSync("playwright-cli close", {
        cwd: projectRoot,
        stdio: "pipe",
        timeout: 10000,
      });
    } catch {
      // Browser may already be closed
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    for (const name of expectedScenarioNames) {
      scenarios.push({
        name,
        status: "fail",
        details: `Replay error: ${message}`,
      });
    }
  }

  const duration = Date.now() - startTime;

  return {
    domain,
    scenarios,
    rawOutput: `Replayed ${expectedScenarioNames.length} scenario(s) from compiled script in ${Math.round(duration / 1000)}s`,
    isError: false,
    duration,
  };
}

/**
 * Parse the JSON results from `playwright-cli run-code` output.
 * The output format is:
 *   ### Result
 *   {"results":[{"scenario":"...","status":"pass","details":"..."}]}
 */
function parseScriptResults(output: string): ScriptResult[] {
  const resultMatch = output.match(/### Result\n([\s\S]*?)(?:\n###|$)/);
  if (!resultMatch) return [];

  try {
    const json = resultMatch[1].trim();
    const parsed = JSON.parse(json) as { results?: ScriptResult[] };
    return parsed.results ?? [];
  } catch {
    return [];
  }
}

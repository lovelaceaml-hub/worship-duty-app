#!/usr/bin/env node

import { execFile, spawn } from "node:child_process";
import { access, readFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { promisify } from "node:util";
import { pathToFileURL } from "node:url";
import { chromium } from "playwright";

const CATEGORY_IDS = [
  "layout-templates",
  "components",
  "icons",
  "typography",
  "photography",
  "illustration",
  "motion",
];
const REQUIRED_STATES = ["empty", "loading", "error", "success"];
const VIEWPORTS = {
  phone: { width: 390, height: 844 },
  desktop: { width: 1440, height: 1000 },
};
const execFileAsync = promisify(execFile);

function invariant(condition, message) {
  if (!condition) throw new Error(message);
}

function isObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function sameProjectRoute(value, field) {
  invariant(typeof value === "string" && /^\/(?!\/)/.test(value), `${field} must be a same-project route.`);
  return value;
}

function exactLink(value, field) {
  let url;
  try {
    url = new URL(value);
  } catch {
    throw new Error(`${field} must be a valid direct HTTPS URL.`);
  }
  invariant(url.protocol === "https:", `${field} must use HTTPS.`);
  invariant(
    url.pathname !== "/" && !/(^|\/)(search|explore)\/?$/i.test(url.pathname),
    `${field} must point to a direct item or guidance page rather than a homepage or search page.`,
  );
  return url.toString();
}

function text(value, field, minimum = 2) {
  invariant(typeof value === "string" && value.trim().length >= minimum, `${field} is required.`);
  return value.trim();
}

export function validateCandidateManifest(input) {
  invariant(isObject(input) && input.version === 1, "The candidate manifest must use version 1.");
  invariant(Array.isArray(input.categories), "The candidate manifest needs categories.");
  const ids = input.categories.map((category) => category.id);
  invariant(
    ids.length === CATEGORY_IDS.length &&
      CATEGORY_IDS.every((id) => ids.includes(id)) &&
      new Set(ids).size === CATEGORY_IDS.length,
    `The candidate manifest must classify exactly: ${CATEGORY_IDS.join(", ")}.`,
  );
  for (const category of input.categories) {
    invariant(typeof category.relevant === "boolean", `${category.id}: relevant must be yes or no.`);
    if (!category.relevant) {
      text(category.reason, `${category.id}: omission reason`, 12);
      continue;
    }
    for (const round of ["referenceCandidates", "adoptionCandidates"]) {
      invariant(
        Array.isArray(category[round]) && category[round].length >= 5,
        `${category.id}: ${round} needs at least five candidates.`,
      );
      const urls = new Set();
      for (const [index, candidate] of category[round].entries()) {
        invariant(isObject(candidate), `${category.id}.${round}[${index}] must be an object.`);
        text(candidate.name, `${category.id}.${round}[${index}].name`);
        const url = exactLink(candidate.url, `${category.id}.${round}[${index}].url`);
        invariant(!urls.has(url), `${category.id}.${round} cannot repeat ${url}.`);
        urls.add(url);
        text(candidate.purpose, `${category.id}.${round}[${index}].purpose`, 12);
        if (round === "adoptionCandidates") {
          text(candidate.cost, `${category.id}.${round}[${index}].cost`);
          exactLink(candidate.licenseUrl, `${category.id}.${round}[${index}].licenseUrl`);
          text(candidate.performanceImpact, `${category.id}.${round}[${index}].performanceImpact`, 8);
          text(candidate.phoneBehavior, `${category.id}.${round}[${index}].phoneBehavior`, 8);
          text(candidate.desktopBehavior, `${category.id}.${round}[${index}].desktopBehavior`, 8);
        }
      }
    }
    invariant(
      Array.isArray(category.auditionedCandidateUrls) &&
        category.auditionedCandidateUrls.length >= 1 &&
        category.auditionedCandidateUrls.length <= 3,
      `${category.id}: audition exactly one to three finalists.`,
    );
    const adoptionUrls = new Set(category.adoptionCandidates.map((item) => new URL(item.url).toString()));
    for (const url of category.auditionedCandidateUrls) {
      invariant(adoptionUrls.has(new URL(url).toString()), `${category.id}: every auditioned finalist must be an adoption candidate.`);
    }
  }
  return input;
}

function normalizeInteraction(value, field) {
  invariant(isObject(value), `${field} must be an object.`);
  return {
    route: sameProjectRoute(value.route, `${field}.route`),
    actionSelector: text(value.actionSelector, `${field}.actionSelector`),
    outcomeSelector: text(value.outcomeSelector, `${field}.outcomeSelector`),
  };
}

export function normalizeDesignContract(input, configPath = "design-contract.config.mjs") {
  invariant(isObject(input) && input.version === 2, "The design contract config must use version 2.");
  const absolute = path.resolve(configPath);
  const config = { ...input, __configPath: absolute, __configDir: path.dirname(absolute) };
  config.baseURL = new URL(config.baseURL).toString();
  invariant(
    Array.isArray(config.directions) && config.directions.length >= 2 && config.directions.length <= 3,
    "Two or three directions are required.",
  );
  invariant(
    new Set(config.directions.map((item) => item.id)).size === config.directions.length,
    "Direction IDs must be unique.",
  );
  config.directions = config.directions.map((direction, index) => {
    text(direction.id, `directions[${index}].id`);
    invariant(isObject(direction.artifacts), `${direction.id}.artifacts must include phone and desktop files.`);
    const artifacts = {};
    for (const viewport of Object.keys(VIEWPORTS)) {
      artifacts[viewport] = path.resolve(
        config.__configDir,
        text(direction.artifacts[viewport], `${direction.id}.artifacts.${viewport}`),
      );
    }
    return { id: direction.id, artifacts };
  });
  invariant(isObject(config.selection), "Record Anthony's direction selection before prototype work.");
  config.selection = {
    directionId: text(config.selection.directionId, "selection.directionId"),
    selectedBy: text(config.selection.selectedBy, "selection.selectedBy"),
    selectedOn: text(config.selection.selectedOn, "selection.selectedOn"),
    note: text(config.selection.note, "selection.note", 12),
  };
  invariant(
    config.selection.selectedBy === "Anthony",
    "selection.selectedBy must be Anthony; never infer his approval.",
  );
  invariant(
    /^\d{4}-\d{2}-\d{2}$/.test(config.selection.selectedOn),
    "selection.selectedOn must be the YYYY-MM-DD date of Anthony's choice.",
  );
  invariant(
    config.directions.some((item) => item.id === config.selection.directionId),
    "selection.directionId must match one of the two or three directions.",
  );
  invariant(isObject(config.prototype), "The selected direction needs a committed clickable prototype.");
  config.prototype = {
    artifactPath: path.resolve(
      config.__configDir,
      text(config.prototype.artifactPath, "prototype.artifactPath"),
    ),
    interactions: Object.fromEntries(Object.keys(VIEWPORTS).map((viewport) => [
      viewport,
      normalizeInteraction(config.prototype.interactions?.[viewport], `prototype.${viewport}`),
    ])),
  };
  invariant(
    Array.isArray(config.primaryJourney) && config.primaryJourney.length >= 4,
    "The selected direction needs at least four clickable primary-journey moments.",
  );
  config.primaryJourney = config.primaryJourney.map((item, index) =>
    normalizeInteraction(item, `primaryJourney[${index}]`));
  invariant(isObject(config.states), "The selected direction needs important states.");
  const stateSelectors = new Set();
  for (const state of REQUIRED_STATES) {
    const entry = config.states[state];
    invariant(isObject(entry), `states.${state} must include a route and unique selector.`);
    config.states[state] = {
      route: sameProjectRoute(entry.route, `states.${state}.route`),
      selector: text(entry.selector, `states.${state}.selector`),
    };
    invariant(
      !stateSelectors.has(config.states[state].selector),
      `states.${state}.selector must be unique to that visible state.`,
    );
    stateSelectors.add(config.states[state].selector);
  }
  invariant(isObject(config.signatureMotion), "signatureMotion must classify whether motion is relevant.");
  invariant(
    typeof config.signatureMotion.relevant === "boolean",
    "signatureMotion.relevant must be yes or no.",
  );
  if (config.signatureMotion.relevant) {
    config.signatureMotion = {
      relevant: true,
      interaction: normalizeInteraction(config.signatureMotion.interaction, "signatureMotion.interaction"),
      targetSelector: text(config.signatureMotion.targetSelector, "signatureMotion.targetSelector"),
      initialState: text(config.signatureMotion.initialState, "signatureMotion.initialState"),
      finalState: text(config.signatureMotion.finalState, "signatureMotion.finalState"),
    };
  } else {
    config.signatureMotion = {
      relevant: false,
      reason: text(config.signatureMotion.reason, "signatureMotion.reason", 12),
    };
  }
  invariant(typeof config.candidateManifest === "string", "candidateManifest is required.");
  config.candidateManifest = path.resolve(config.__configDir, config.candidateManifest);
  if (config.webServer) {
    invariant(typeof config.webServer.command === "string" && config.webServer.command.trim(), "webServer.command is required.");
    config.webServer = {
      command: config.webServer.command,
      url: new URL(config.webServer.url ?? config.baseURL).toString(),
      cwd: path.resolve(config.__configDir, config.webServer.cwd ?? "."),
      timeoutMs: Number(config.webServer.timeoutMs ?? 120000),
      quiet: Boolean(config.webServer.quiet),
    };
  }
  return config;
}

async function exists(value) {
  try {
    await access(value);
    return true;
  } catch {
    return false;
  }
}

export async function proveCommittedArtifact(value, workingDirectory) {
  invariant(await exists(value), `Design artifact not found: ${value}`);
  let repository;
  try {
    const result = await execFileAsync(
      "git",
      ["-C", workingDirectory, "rev-parse", "--show-toplevel"],
      { encoding: "utf8" },
    );
    repository = result.stdout.trim();
  } catch {
    throw new Error(`Design artifacts must live in a Git repository: ${value}`);
  }
  try {
    await execFileAsync(
      "git",
      ["-C", repository, "ls-files", "--error-unmatch", "--", value],
      { encoding: "utf8" },
    );
    await execFileAsync("git", ["-C", repository, "diff", "--quiet", "--", value]);
    await execFileAsync("git", ["-C", repository, "diff", "--cached", "--quiet", "--", value]);
  } catch {
    throw new Error(`Design artifact must be committed and unchanged before approval: ${value}`);
  }
}

async function ready(url) {
  try {
    return (await fetch(url)).ok;
  } catch {
    return false;
  }
}

async function withServer(config, callback) {
  if (await ready(config.baseURL)) return callback();
  invariant(config.webServer, "The prototype is unavailable and no web server is configured.");
  const child = spawn(config.webServer.command, {
    cwd: config.webServer.cwd,
    env: process.env,
    shell: true,
    detached: process.platform !== "win32",
    stdio: config.webServer.quiet ? "ignore" : "inherit",
  });
  const deadline = Date.now() + config.webServer.timeoutMs;
  try {
    while (Date.now() < deadline) {
      if (child.exitCode !== null) throw new Error(`Prototype server exited with code ${child.exitCode}.`);
      if (await ready(config.webServer.url)) return await callback();
      await new Promise((resolve) => setTimeout(resolve, 250));
    }
    throw new Error("Prototype server did not become ready.");
  } finally {
    if (child.exitCode === null) {
      try {
        process.kill(-child.pid, "SIGTERM");
      } catch {
        child.kill("SIGTERM");
      }
    }
  }
}

export async function proveInteraction(browser, baseURL, interaction, viewport, label) {
  const context = await browser.newContext({ viewport, reducedMotion: "reduce" });
  const page = await context.newPage();
  try {
    await page.goto(new URL(interaction.route, baseURL).toString(), { waitUntil: "networkidle" });
    const action = page.locator(interaction.actionSelector).first();
    await action.waitFor({ state: "visible" });
    invariant(await action.isEnabled(), `${label}: action is disabled.`);
    const outcome = page.locator(interaction.outcomeSelector).first();
    invariant(
      !(await outcome.isVisible()),
      `${label}: outcome is already visible before the action, so the interaction is not proven.`,
    );
    await action.click();
    await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));
    await outcome.waitFor({ state: "visible" });
  } finally {
    await context.close();
  }
}

export async function proveSignatureMotion(browser, baseURL, motion) {
  if (!motion.relevant) return;
  for (const reducedMotion of ["no-preference", "reduce"]) {
    const context = await browser.newContext({
      viewport: VIEWPORTS.phone,
      reducedMotion,
    });
    const page = await context.newPage();
    page.setDefaultTimeout(5000);
    try {
      await page.goto(new URL(motion.interaction.route, baseURL).toString(), {
        waitUntil: "networkidle",
      });
      const target = page.locator(motion.targetSelector).first();
      await target.waitFor({ state: "visible" });
      invariant(
        (await target.getAttribute("data-motion-state")) === motion.initialState,
        `signatureMotion (${reducedMotion}): target is missing the approved initial motion state.`,
      );
      await page.locator(motion.interaction.actionSelector).first().click();
      await page
        .locator(`${motion.targetSelector}[data-motion-state="${motion.finalState}"]`)
        .first()
        .waitFor({ state: "visible" });
      if (motion.interaction.outcomeSelector) {
        await page.locator(motion.interaction.outcomeSelector).first().waitFor({ state: "visible" });
      }
    } finally {
      await context.close();
    }
  }
}

export async function proveStateEvidence(browser, baseURL, states) {
  for (const [state, entry] of Object.entries(states)) {
    for (const [viewportName, viewport] of Object.entries(VIEWPORTS)) {
      const context = await browser.newContext({ viewport, reducedMotion: "reduce" });
      const page = await context.newPage();
      try {
        await page.goto(new URL(entry.route, baseURL).toString(), { waitUntil: "networkidle" });
        await page.locator(entry.selector).first().waitFor({ state: "visible" });
        for (const [otherState, otherEntry] of Object.entries(states)) {
          if (otherState === state) continue;
          invariant(
            !(await page.locator(otherEntry.selector).first().isVisible()),
            `${state}.${viewportName}: also shows the ${otherState} state marker.`,
          );
        }
      } finally {
        await context.close();
      }
    }
  }
}

async function run(config) {
  invariant(await exists(config.candidateManifest), `Candidate manifest not found: ${config.candidateManifest}`);
  validateCandidateManifest(JSON.parse(await readFile(config.candidateManifest, "utf8")));
  for (const direction of config.directions) {
    for (const [viewport, artifact] of Object.entries(direction.artifacts)) {
      try {
        await proveCommittedArtifact(artifact, config.__configDir);
      } catch (error) {
        throw new Error(`${direction.id}.${viewport}: ${error.message}`);
      }
    }
  }
  await proveCommittedArtifact(config.prototype.artifactPath, config.__configDir);
  await withServer(config, async () => {
    const browser = await chromium.launch();
    try {
      for (const [name, viewport] of Object.entries(VIEWPORTS)) {
        await proveInteraction(
          browser,
          config.baseURL,
          config.prototype.interactions[name],
          viewport,
          `prototype.${name}`,
        );
      }
      for (const [index, interaction] of config.primaryJourney.entries()) {
        for (const [name, viewport] of Object.entries(VIEWPORTS)) {
          await proveInteraction(
            browser,
            config.baseURL,
            interaction,
            viewport,
            `primaryJourney[${index}].${name}`,
          );
        }
      }
      await proveStateEvidence(browser, config.baseURL, config.states);
      await proveSignatureMotion(browser, config.baseURL, config.signatureMotion);
    } finally {
      await browser.close();
    }
  });
  process.stdout.write("PASS: candidate rounds and clickable prototype contract verified.\n");
}

async function main() {
  const configPath = path.resolve(process.argv[2] ?? "design-contract.config.mjs");
  invariant(await exists(configPath), `Config file not found: ${configPath}`);
  const imported = await import(`${pathToFileURL(configPath).href}?t=${Date.now()}`);
  await run(normalizeDesignContract(imported.default, configPath));
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  main().catch((error) => {
    process.stderr.write(`${error.message}\n`);
    process.exitCode = 1;
  });
}

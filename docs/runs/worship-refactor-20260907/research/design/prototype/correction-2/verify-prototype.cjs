const fs = require("fs");
const path = require("path");
const { chromium } = require("/Users/anthony/Projects/worship-duty-app/node_modules/playwright");
const { AxeBuilder } = require("/Users/anthony/Projects/worship-duty-app/node_modules/@axe-core/playwright");

const APP_URL = "http://127.0.0.1:8099/open-bulletin/index.html";
const SCREENSHOT_DIR = "/Users/anthony/Projects/worship-refactor-worktrees/design/docs/design/prototype/open-bulletin/screenshots";
const RECEIPT_PATH = "/Users/anthony/Projects/worship-refactor-worktrees/design/docs/runs/worship-refactor-20260907/research/design/prototype/correction-2/results.json";

fs.mkdirSync(SCREENSHOT_DIR, { recursive: true });

const results = {
  task: "WORSHIP-D2-20260908",
  route: APP_URL,
  fictionalOnly: true,
  routePolicy: "Loopback requests only, installed before page creation",
  checks: [],
  axeChecks: [],
  screenshots: [],
  failures: []
};

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

async function openPage(viewport, screen) {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport, reducedMotion: "reduce" });
  const nonLoopback = [];
  const pageErrors = [];
  const consoleErrors = [];
  await context.route("**/*", async (route) => {
    const requestUrl = new URL(route.request().url());
    const loopback = requestUrl.protocol === "http:" && requestUrl.hostname === "127.0.0.1" && requestUrl.port === "8099";
    if (!loopback) {
      nonLoopback.push(requestUrl.href);
      await route.abort();
      return;
    }
    await route.continue();
  });
  const page = await context.newPage();
  page.on("pageerror", (error) => pageErrors.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error") consoleErrors.push(message.text());
  });
  const query = screen ? "?screen=" + encodeURIComponent(screen) : "";
  await page.goto(APP_URL + query, { waitUntil: "domcontentloaded" });
  await page.waitForLoadState("networkidle").catch(() => {});
  return { browser, context, page, nonLoopback, pageErrors, consoleErrors };
}

async function closePage(session) {
  await session.context.close();
  await session.browser.close();
}

async function withPage(viewport, screen, callback) {
  const session = await openPage(viewport, screen);
  try {
    await callback(session.page, session);
    assert(session.nonLoopback.length === 0, "Non-loopback request observed: " + session.nonLoopback.join(", "));
    assert(session.pageErrors.length === 0, "Page errors: " + session.pageErrors.join(", "));
    assert(session.consoleErrors.length === 0, "Console errors: " + session.consoleErrors.join(", "));
  } finally {
    await closePage(session);
  }
}

async function screenshot(page, filename) {
  await page.evaluate(() => window.scrollTo(0, 0));
  const target = path.join(SCREENSHOT_DIR, filename);
  await page.screenshot({ path: target, fullPage: false });
  results.screenshots.push(target);
}

async function axe(page, label) {
  const report = await new AxeBuilder({ page }).analyze();
  assert(report.violations.length === 0, label + " axe violations: " + report.violations.map((item) => item.id).join(", "));
  results.axeChecks.push({ label, violations: report.violations.length });
}

async function check(name, callback) {
  try {
    await callback();
    results.checks.push({ name, status: "passed" });
  } catch (error) {
    results.checks.push({ name, status: "failed", error: error.message });
    results.failures.push({ name, error: error.message });
  }
}

(async () => {
  await check("phone song search panel focus, Escape return, and selected service preservation", async () => {
    await withPage({ width: 390, height: 844 }, "presider", async (page) => {
      const selectedService = await page.locator("#presider-service").inputValue();
      await page.locator("#song-library-trigger").click();
      await page.waitForTimeout(30);
      assert(await page.locator("#song-library-panel").getAttribute("role") === "dialog", "Phone song panel should be a dialog while open");
      assert(await page.evaluate(() => document.activeElement && document.activeElement.id) === "song-search", "Song search should receive focus");
      await page.keyboard.press("Shift+Tab");
      assert(await page.locator("#song-library-panel").evaluate((panel) => panel.contains(document.activeElement)), "Shift+Tab should stay inside the phone panel");
      await page.keyboard.press("Tab");
      assert(await page.locator("#song-library-panel").evaluate((panel) => panel.contains(document.activeElement)), "Tab should stay inside the phone panel");
      await page.locator("#song-search").fill("118");
      assert(await page.locator("#song-search").inputValue() === "118", "Search query should remain visible");
      await screenshot(page, "presider-search-phone-390x844.png");
      await axe(page, "phone open presider search");
      await page.keyboard.press("Escape");
      await page.waitForTimeout(30);
      assert(!(await page.locator("#song-library-panel").getAttribute("class")).includes("is-open"), "Escape should close the phone panel");
      assert(await page.evaluate(() => document.activeElement && document.activeElement.id) === "song-library-trigger", "Escape should return focus to the trigger");
      assert(await page.locator("#presider-service").inputValue() === selectedService, "Closing search should preserve selected service");
      await page.locator("#song-library-trigger").click();
      await page.locator("[data-action='close-song-library']").click();
      await page.waitForTimeout(30);
      assert(await page.evaluate(() => document.activeElement && document.activeElement.id) === "song-library-trigger", "Close button should return focus to the trigger");
      await axe(page, "phone closed presider search");
    });
  });

  await check("desktop song library remains a side panel", async () => {
    await withPage({ width: 1440, height: 1000 }, "presider", async (page) => {
      assert(await page.locator(".presider-layout .song-picker").isVisible(), "Desktop song library should remain visible");
      assert(!(await page.locator("#song-library-trigger").isVisible()), "Phone search trigger should remain hidden on desktop");
      await screenshot(page, "presider-search-desktop-1440x1000.png");
      await axe(page, "desktop presider library");
    });
  });

  await check("calendar subscription, copy feed link, and one-time snapshot stay local", async () => {
    await withPage({ width: 390, height: 844 }, "duty", async (page, session) => {
      const feed = await page.locator("#calendar-feed-url").inputValue();
      assert(feed.startsWith("https://example.com/fictional-lv-zion/ics/"), "Reserved example feed URL should be visible");
      await page.locator("[data-action='subscribe-calendar']").click();
      assert((await page.locator("[data-action='subscribe-calendar']").innerText()).includes("Subscribed locally"), "Subscription should be simulated locally");
      assert(new URL(page.url()).hostname === "127.0.0.1", "Subscription should not navigate away");
      assert(session.context.pages().length === 1, "Subscription should not launch a calendar window");
      await page.locator("[data-action='copy-feed-link']").click();
      assert(await page.locator(".copy-fallback textarea").inputValue() === feed, "Reserved feed link should be copyable in the local fallback");
      await page.locator("[data-action='calendar']").click();
      await page.waitForFunction(() => Boolean(document.querySelector(".copy-fallback textarea") && document.querySelector(".copy-fallback textarea").value.includes("BEGIN:VCALENDAR")));
      assert((await page.locator(".copy-fallback textarea").inputValue()).includes("BEGIN:VCALENDAR"), "One-time calendar snapshot should remain available");
      await screenshot(page, "duty-calendar-phone-390x844.png");
      await axe(page, "phone calendar");
    });
    await withPage({ width: 1440, height: 1000 }, "duty", async (page) => {
      await page.locator("[data-action='subscribe-calendar']").click();
      await screenshot(page, "duty-calendar-desktop-1440x1000.png");
    });
  });

  await check("name unification previews, cancels, and confirms canonical local consolidation", async () => {
    await withPage({ width: 390, height: 844 }, "manage", async (page) => {
      await page.locator("[data-action='manage-tab'][data-tab='sync']").click();
      assert((await page.locator("[data-name-unify-map]").innerText()).includes("B. Daniel R. to B. Daniel Reed"), "Fixture name map should be visible");
      await page.locator("[data-action='preview-name-unify']").click();
      assert(await page.locator("[data-name-unify-preview]").isVisible(), "Name impact preview should open");
      await screenshot(page, "manage-name-unify-preview-phone-390x844.png");
      await page.locator("[data-action='cancel-name-unify']").click();
      await page.locator("[data-action='manage-tab'][data-tab='people']").click();
      assert(await page.locator("input[value='B. Daniel R.']").count() === 1, "Cancel should preserve the variant member");
      await page.locator("[data-action='manage-tab'][data-tab='sync']").click();
      await page.locator("[data-action='preview-name-unify']").click();
      await page.locator("[data-action='confirm-name-unify']").click();
      await page.locator("[data-action='manage-tab'][data-tab='people']").click();
      assert(await page.locator("input[value='B. Daniel R.']").count() === 0, "Confirmed consolidation should remove the variant");
      assert(await page.locator("input[value='B. Daniel Reed']").count() === 1, "Confirmed consolidation should retain the canonical member");
    });
  });

  await check("strict fictional backup validation rejects before mutation and accepts the marker", async () => {
    await withPage({ width: 390, height: 844 }, "manage", async (page) => {
      await page.locator("[data-action='manage-tab'][data-tab='sync']").click();
      await page.locator("#sheet-url-input").fill("local-sheet://edited");
      await page.locator("form[data-form='sheet-url'] button[type='submit']").click();
      const invalid = Buffer.from(JSON.stringify({ members: ["Outside Record"], services: [] }));
      await page.locator("[data-change='import-file']").setInputFiles({ name: "invalid.json", mimeType: "application/json", buffer: invalid });
      await page.waitForTimeout(30);
      assert((await page.locator(".manage-section").innerText()).includes("Backup rejected"), "Invalid backup should be rejected");
      assert(await page.locator("#sheet-url-input").inputValue() === "local-sheet://edited", "Rejected backup should preserve current local state");
      const valid = await page.evaluate(() => JSON.parse(JSON.stringify(window.WorshipPrototypeFixtures)));
      valid.prototype = valid.backupMarker;
      valid.version = 1;
      delete valid.passcodes;
      await page.locator("[data-change='import-file']").setInputFiles({ name: "fictional.json", mimeType: "application/json", buffer: Buffer.from(JSON.stringify(valid)) });
      await page.waitForTimeout(30);
      assert((await page.locator(".manage-section").innerText()).includes("Fictional backup imported locally"), "Marked fictional backup should import locally");
    });
  });

  await check("restore and reset confirmations are distinct and Cancel preserves state", async () => {
    await withPage({ width: 390, height: 844 }, "manage", async (page) => {
      await page.locator("[data-action='manage-tab'][data-tab='sync']").click();
      await page.locator("#sheet-url-input").fill("local-sheet://changed");
      await page.locator("form[data-form='sheet-url'] button[type='submit']").click();
      await page.locator("[data-action='restore-sample']").click();
      assert(await page.locator("[data-confirmation='restore-sample']").isVisible(), "Restore should show its own impact confirmation");
      assert(await page.locator("[data-confirmation='reset-prototype']").count() === 0, "Restore should not show reset confirmation");
      await screenshot(page, "manage-restore-confirm-phone-390x844.png");
      await page.locator("[data-action='cancel-restore-sample']").click();
      assert(await page.locator("#sheet-url-input").inputValue() === "local-sheet://changed", "Cancel restore should preserve the edited URL");
      await page.locator("[data-action='reset-prototype']").click();
      assert(await page.locator("[data-confirmation='reset-prototype']").isVisible(), "Reset should show its own impact confirmation");
      assert(await page.locator("[data-confirmation='restore-sample']").count() === 0, "Reset should not show restore confirmation");
      await page.locator("[data-action='cancel-reset-prototype']").click();
      assert(await page.locator("#sheet-url-input").inputValue() === "local-sheet://changed", "Cancel reset should preserve the edited URL");
      await page.locator("[data-action='reset-prototype']").click();
      await page.locator("[data-action='confirm-reset-prototype']").click();
      assert(await page.locator("#sheet-url-input").inputValue() === "local-sheet://fictional-schedule", "Confirmed reset should restore the fixture URL");
    });
  });

  await check("site lock gates navigation and Return Home on every route", async () => {
    await withPage({ width: 390, height: 844 }, "manage", async (page) => {
      await page.locator("[data-action='manage-tab'][data-tab='settings']").click();
      await page.locator("[data-action='lock-site']").click();
      assert((await page.locator("#app-main").innerText()).includes("Site is locked"), "Site lock should show the gate");
      await page.locator("nav a[data-nav='home']").click();
      assert((await page.locator("#app-main").innerText()).includes("Site is locked"), "Home navigation should remain gated");
      await page.locator("nav a[data-nav='presider']").click();
      assert((await page.locator("#app-main").innerText()).includes("Site is locked"), "Presider navigation should remain gated");
      await page.locator(".access-gate a[data-nav='home']").click();
      assert((await page.locator("#app-main").innerText()).includes("Site is locked"), "Return Home should remain gated");
      await page.locator(".access-gate input[name='passcode']").fill("1357");
      await page.locator(".access-gate form button[type='submit']").click();
      assert(await page.locator("[data-prototype-screen='home']").isVisible(), "Correct site passcode should restore the selected route");
      await screenshot(page, "site-lock-phone-390x844.png");
    });
  });

  await check("planning window scopes conflicts, gaps, suggestions, and workload", async () => {
    await withPage({ width: 1440, height: 1000 }, "manage", async (page) => {
      await page.locator("[data-action='manage-tab'][data-tab='planning']").click();
      const section = page.locator("[data-plan-window]");
      await page.locator("[data-change='plan-window']").selectOption("last");
      const lastScope = await section.getAttribute("data-plan-scope-count");
      const lastWorkload = await page.locator(".workload-list").innerText();
      const lastSuggestion = await page.locator("[data-action='apply-suggestion']").count() ? await page.locator("[data-action='apply-suggestion']").getAttribute("data-service") : "";
      await page.locator("[data-change='plan-window']").selectOption("next");
      const nextScope = await section.getAttribute("data-plan-scope-count");
      const nextWorkload = await page.locator(".workload-list").innerText();
      const nextSuggestion = await page.locator("[data-action='apply-suggestion']").count() ? await page.locator("[data-action='apply-suggestion']").getAttribute("data-service") : "";
      await page.locator("[data-change='plan-window']").selectOption("upcoming");
      const upcomingScope = await section.getAttribute("data-plan-scope-count");
      assert(lastScope === "1" && nextScope === "1" && upcomingScope === "4", "Planning service counts should follow the selected window");
      assert(lastWorkload !== nextWorkload, "Workload should recompute for the selected window");
      assert(lastSuggestion !== nextSuggestion, "Coverage suggestion should use the selected window");
      const gapHeader = await page.locator(".gap-list").count() ? await page.locator(".gap-list").innerText() : "";
      assert(gapHeader.length > 0, "Selected upcoming window should show scoped coverage gaps");
      await screenshot(page, "manage-planning-desktop-1440x1000.png");
      await axe(page, "desktop planning");
    });
  });

  await check("canonical sung history is idempotent, service scoped, date aware, and recomputed on deletion", async () => {
    await withPage({ width: 1440, height: 1000 }, "presider", async (page) => {
      await page.locator("[data-action='toggle-song'][data-song='song-118']").click();
      const before = await page.locator(".song-detail").first().innerText();
      assert(before.includes("1 recorded use"), "Fixture history should normalize to one recorded use");
      await page.locator("[data-action='mark-sung']").click();
      await page.locator("[data-action='confirm-mark-sung']").click();
      assert(await page.locator("[data-action='mark-sung']").isDisabled(), "A sung service should disable repeat marking");
      await page.evaluate(() => {
        const button = document.querySelector("[data-action='mark-sung']");
        button.removeAttribute("disabled");
        button.click();
      });
      await page.locator("[data-action='confirm-mark-sung']").click();
      assert((await page.locator(".song-detail").first().innerText()).includes("2 recorded uses"), "Repeated mark should be idempotent");
      await page.locator("#presider-service").selectOption("third-2026-09-15-evening");
      await page.locator("[data-action='add-song'][data-song='song-118']").click();
      await page.locator("[data-action='add-song'][data-song='song-118']").click();
      await page.locator("[data-action='mark-sung']").click();
      await page.locator("[data-action='confirm-mark-sung']").click();
      assert((await page.locator(".song-detail").first().innerText()).includes("3 recorded uses") && (await page.locator(".song-detail").first().innerText()).includes("last 2026-09-15"), "Second service should use its service date once");
      await page.locator("[data-action='undo-sung']").click();
      await page.locator("[data-action='confirm-undo-sung']").click();
      const afterUndo = await page.locator(".song-detail").first().innerText();
      assert(afterUndo.includes("2 recorded uses") && afterUndo.includes("last 2026-09-12"), "Undo should remove only the selected service and recompute last date");
      await page.locator("[data-action='toggle-history']").click();
      const morningHistory = page.locator(".history-row").filter({ hasText: "#118" }).filter({ hasText: "2026-09-12" }).first();
      await morningHistory.locator("[data-action='remove-history']").click();
      const afterDelete = await page.locator(".song-detail").first().innerText();
      assert(afterDelete.includes("1 recorded use") && afterDelete.includes("last 2026-08-15"), "History deletion should recompute count and last date");
      await page.locator("[data-action='delete-setlist']").click();
      await page.locator("[data-action='delete-setlist-confirm']").click();
      assert(await page.locator("[data-action='create-setlist']").isVisible(), "Deleting a setlist should expose recreate outline");
      await page.locator("[data-action='create-setlist']").click();
      assert(await page.locator("#outline-title").isVisible(), "Recreate outline should restore the editor");
      await screenshot(page, "presider-sung-recreate-desktop-1440x1000.png");
      await axe(page, "desktop sung history");
    });
  });

  results.completedAt = new Date().toISOString();
  fs.writeFileSync(RECEIPT_PATH, JSON.stringify(results, null, 2) + "\n");
  if (results.failures.length) {
    process.stderr.write(JSON.stringify(results.failures, null, 2) + "\n");
    process.exitCode = 1;
  } else {
    process.stdout.write(JSON.stringify({ checks: results.checks.length, screenshots: results.screenshots.length, routePolicy: results.routePolicy }, null, 2) + "\n");
  }
})().catch((error) => {
  results.failures.push({ name: "runner", error: error.message });
  fs.writeFileSync(RECEIPT_PATH, JSON.stringify(results, null, 2) + "\n");
  process.stderr.write(error.stack + "\n");
  process.exitCode = 1;
});

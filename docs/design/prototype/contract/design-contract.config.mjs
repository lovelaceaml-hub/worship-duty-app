export default {
  version: 2,
  baseURL: "http://127.0.0.1:8099",
  candidateManifest: "../../../DESIGN-CANDIDATES.json",
  directions: [
    {
      id: "direction-a",
      artifacts: {
        phone: "../../directions/service-ledger/screenshots/service-ledger-390x844.png",
        desktop: "../../directions/service-ledger/screenshots/service-ledger-1440x1000.png",
      },
    },
    {
      id: "direction-b",
      artifacts: {
        phone: "../../directions/open-bulletin/screenshots/open-bulletin-390x844.png",
        desktop: "../../directions/open-bulletin/screenshots/open-bulletin-1440x1000.png",
      },
    },
    {
      id: "direction-c",
      artifacts: {
        phone: "../../directions/service-desk/screenshots/service-desk-390x844.png",
        desktop: "../../directions/service-desk/screenshots/service-desk-1440x1000.png",
      },
    },
  ],
  selection: {
    directionId: "direction-b",
    selectedBy: "Anthony",
    selectedOn: "2026-09-07",
    note: "Anthony selected the original B direction and clarified that he only wanted the oversized text reduced. The original B layout, spacing, blue service cards, and whitespace remain the visual anchor.",
  },
  prototype: {
    artifactPath: "../open-bulletin/index.html",
    interactions: {
      phone: { route: "/open-bulletin/index.html?screen=home", actionSelector: "[data-action='open-my-duties']", outcomeSelector: "[data-prototype-screen='duty']" },
      desktop: { route: "/open-bulletin/index.html?screen=home", actionSelector: "[data-action='open-my-duties']", outcomeSelector: "[data-prototype-screen='duty']" },
    },
  },
  primaryJourney: [
    { route: "/open-bulletin/index.html?screen=home", actionSelector: "[data-action='open-my-duties']", outcomeSelector: "[data-prototype-screen='duty']" },
    { route: "/open-bulletin/index.html?screen=duty", actionSelector: "[data-action='open-presider']", outcomeSelector: "[data-prototype-screen='presider']" },
    { route: "/open-bulletin/index.html?screen=presider", actionSelector: "[data-action='save-setlist']", outcomeSelector: "[data-save-state='saved']" },
    { route: "/open-bulletin/index.html?screen=manage", actionSelector: "[data-action='approve-request']", outcomeSelector: "[data-pending-count='0']" },
  ],
  states: {
    empty: { route: "/open-bulletin/index.html?screen=empty", selector: "[data-prototype-screen='empty']" },
    loading: { route: "/open-bulletin/index.html?screen=loading", selector: "[data-prototype-screen='loading']" },
    error: { route: "/open-bulletin/index.html?screen=error", selector: "[data-prototype-screen='error']" },
    success: { route: "/open-bulletin/index.html?screen=success", selector: "[data-prototype-screen='success']" },
  },
  signatureMotion: {
    relevant: false,
    reason: "No signature motion is part of this approved product direction.",
  },
  webServer: {
    command: "python3 -m http.server 8099 --bind 127.0.0.1",
    url: "http://127.0.0.1:8099",
    cwd: "..",
    timeoutMs: 120000,
  },
};

#!/usr/bin/env bash
# Deploy guard for Worship Duty (Firebase project lv-zion-duties, shared).
#
# The project also holds live Cloud Functions that belong to another app
# (onVercelScheduleWrite, worshipVercelReconcile), plus this app's own
# Functions and Firestore rules, which are deployed by hand from the
# compact-integration worktree. GitHub Actions may only ever deploy Hosting,
# and only through design-gallery/release.mjs.
#
# Usage:
#   deploy-guard.sh source
#       Check that design-gallery/release.mjs still builds the pinned
#       Hosting-only firebase-tools commands (fails early, before any build).
#   deploy-guard.sh command <preview|release> <arguments release.mjs gave npx>
#       Check the exact command release.mjs is about to run. Called by
#       .github/scripts/npx-guard/npx, which stands in for npx in Actions.
#       preview mode also needs GUARD_PREVIEW_CHANNEL (the branch channel id).
#   deploy-guard.sh ics-preflight
#       Read-only check that the deploy account can see the ics function.
#   deploy-guard.sh channel <branch>
#       Print the preview channel id for a branch.
#   deploy-guard.sh config <path to firebase.gallery.json>
#       Check the generated Hosting config names exactly one site,
#       lv-zion-duties, keeps the one reviewed predeploy hook, and has no
#       postdeploy, pinTag, source or frameworksBackend (hooks run outside
#       the npx guard, and the other keys change what a Hosting deploy does).
#   deploy-guard.sh release-result <exit code> <release log>
#       After release.mjs --publish: fail loudly, with the rollback steps, if
#       firebase-tools could not resolve the ics function for /ics/**.
#   deploy-guard.sh ics-live
#       Read-only GET of the documented calendar feed on the live site after a
#       release; fails unless it answers 200 with a calendar.
#
# Exit 0 means allowed. Anything else prints BLOCKED and exits 1.
set -euo pipefail

PROJECT="lv-zion-duties"
# The one pinned Firebase CLI spec. The workflows pass the same value to
# release.mjs through WDS_FIREBASE_TOOLS.
FIREBASE_TOOLS="firebase-tools@15"
SITE="lv-zion-duties"
# The one reviewed Hosting predeploy hook (firebase.json on main, 2026-09-28).
PREDEPLOY="node scripts/guard-gallery-deploy.mjs"
LIVE_URL="https://lv-zion-duties.web.app"
# The example feed the ics function documents in its own usage message
# (functions/index.js: "e.g. /ics/B.%20Anthony"). Public by design.
ICS_CHECK_PATH="/ics/B.%20Anthony"
ROLLBACK="Roll back now: open https://console.firebase.google.com/project/lv-zion-duties/hosting/sites/lv-zion-duties , find Release history, and choose Rollback on the release before this one."
ROOT="${GUARD_REPO_ROOT:-$(git -C "$(dirname "${BASH_SOURCE[0]}")" rev-parse --show-toplevel)}"
CONFIG="$ROOT/.hosting-gallery/firebase.gallery.json"
CHANNEL_RE='^[a-z0-9]([a-z0-9-]{0,34}[a-z0-9])?$'

block() { echo "BLOCKED: $*" >&2; exit 1; }

check_source() {
  local f="$ROOT/design-gallery/release.mjs"
  [ -f "$f" ] || block "design-gallery/release.mjs is missing."
  local pins=(
    "const releaseArgs=args.includes('--publish')?['deploy','--only','hosting']:['hosting:channel:deploy',previewChannel,'--expires','7d'];"
    "const firebase=['--yes',firebaseTools];"
    "[...firebase,...releaseArgs,'--config',path.join(dest,'firebase.gallery.json'),'--project','lv-zion-duties']"
  )
  local p
  for p in "${pins[@]}"; do
    [ "$(grep -cF -- "$p" "$f")" = "1" ] || block "release.mjs no longer contains the pinned Hosting-only line: $p  (update .github/scripts/deploy-guard.sh deliberately if this change was reviewed)."
  done
  [ "$(grep -c "spawnSync(command" "$f")" = "1" ] || block "release.mjs runs more than one deploy command; expected exactly one."
  echo "Guard: release.mjs still builds only the pinned Hosting commands for $PROJECT."
}

check_command() {
  local mode="${1:-}"; shift || true
  local got=("$@")
  local joined=" ${got[*]:-} "

  [ "$mode" = "preview" ] || [ "$mode" = "release" ] || block "unknown guard mode '$mode' (expected preview or release)."
  [ "${#got[@]}" -gt 0 ] || block "empty command."
  [ "${got[0]:-}" = "--yes" ] && [ "${got[1]:-}" = "$FIREBASE_TOOLS" ] || block "only 'npx --yes $FIREBASE_TOOLS ...' from release.mjs may run here (set WDS_FIREBASE_TOOLS=$FIREBASE_TOOLS); got: npx ${got[*]}"

  # Clear messages for the dangerous shapes first.
  case "$joined" in
    *" --force "*) block "--force is never allowed (it can delete live resources)." ;;
    *" --except "*) block "--except is never allowed; the scope must be named with --only." ;;
  esac
  local i only_val="" only_count=0 project_val=""
  for ((i = 0; i < ${#got[@]}; i++)); do
    case "${got[$i]}" in
      --only) only_count=$((only_count + 1)); only_val="${got[$((i + 1))]:-}" ;;
      --only=*) only_count=$((only_count + 1)); only_val="${got[$i]#--only=}" ;;
      --project|-P) project_val="${got[$((i + 1))]:-}" ;;
      --project=*) project_val="${got[$i]#--project=}" ;;
    esac
  done
  if [ "${got[2]:-}" = "deploy" ]; then
    [ "$only_count" -gt 0 ] || block "bare 'firebase deploy' would deploy everything in the shared project (rules, Functions, other apps' Functions)."
    [ "$only_count" -eq 1 ] || block "more than one --only flag."
    [ -n "$only_val" ] || block "empty --only scope."
    case ",$only_val," in
      *,functions,*|*,functions:*) block "Functions are never deployed by GitHub Actions for Worship Duty (scope was '$only_val')." ;;
    esac
    case "$only_val" in
      *firestore*|*storage*|*database*|*rules*|*indexes*|*auth*|*remoteconfig*|*extensions*|*dataconnect*|*apphosting*) block "rules, indexes and other non-Hosting targets are never deployed here (scope was '$only_val')." ;;
    esac
  fi
  if [ -n "$project_val" ] && [ "$project_val" != "$PROJECT" ]; then
    block "wrong project '$project_val'; this workflow only deploys to $PROJECT."
  fi

  # Exact allowlist: the command must match release.mjs's pinned form exactly.
  local want=()
  if [ "$mode" = "preview" ]; then
    local ch="${GUARD_PREVIEW_CHANNEL:-}"
    [ -n "$ch" ] || block "GUARD_PREVIEW_CHANNEL is not set."
    [ "$ch" != "design-gallery-review" ] || block "branch previews never use design-gallery-review; that channel is kept for Anthony's approvals."
    [ "$ch" != "live" ] || block "'live' is the production channel, never a preview channel."
    [[ "$ch" =~ $CHANNEL_RE ]] || block "invalid preview channel id '$ch'."
    want=(--yes "$FIREBASE_TOOLS" hosting:channel:deploy "$ch" --expires 7d --config "$CONFIG" --project "$PROJECT")
  else
    want=(--yes "$FIREBASE_TOOLS" deploy --only hosting --config "$CONFIG" --project "$PROJECT")
  fi
  if [ "${#got[@]}" -ne "${#want[@]}" ]; then
    block "command differs from the pinned $mode command.
  expected: npx ${want[*]}
  got:      npx ${got[*]}"
  fi
  for ((i = 0; i < ${#want[@]}; i++)); do
    if [ "${got[$i]}" != "${want[$i]}" ]; then
      block "command differs from the pinned $mode command at argument $((i + 1)) ('${got[$i]}' instead of '${want[$i]}').
  expected: npx ${want[*]}
  got:      npx ${got[*]}"
    fi
  done
  echo "Guard: allowed $mode command: npx ${got[*]}"
}

check_config() {
  local f="${1:-}"
  [ -n "$f" ] && [ -f "$f" ] || block "Hosting config '$f' not found."
  node -e '
    const c = JSON.parse(require("fs").readFileSync(process.argv[1], "utf8"));
    const h = c.hosting;
    const fail = m => { console.error("BLOCKED: " + m); process.exit(1); };
    if (!h || Array.isArray(h) || h.site !== process.argv[2]) fail("the generated Hosting config must name exactly one site, " + process.argv[2] + ".");
    // Hooks run as plain shell commands outside the npx guard, so only the
    // one reviewed predeploy hook may be present, exactly as it is on main.
    if (h.predeploy !== process.argv[3]) fail("hosting.predeploy must be exactly " + JSON.stringify(process.argv[3]) + " (found " + JSON.stringify(h.predeploy) + "). Review the change, then update PREDEPLOY in .github/scripts/deploy-guard.sh.");
    for (const k of ["postdeploy", "pinTag", "source", "frameworksBackend"]) {
      if (Object.prototype.hasOwnProperty.call(h, k)) fail("the generated Hosting config must not set hosting." + k + " (hooks and framework or pinned-Functions options change what a Hosting deploy does).");
    }
    console.log("Guard: generated Hosting config targets only site " + h.site + ", with only the reviewed predeploy hook.");
  ' "$f" "$SITE" "$PREDEPLOY"
}

# Before any deploy: the deploy account must be able to list this project's
# Functions and see the 2nd gen "ics" function, or firebase-tools would write
# a broken /ics/** Hosting rewrite. Read-only (functions:list).
ics_preflight() {
  [ -n "${REAL_NPX:-}" ] || REAL_NPX="$(command -v npx)"
  local out
  out="$("$REAL_NPX" --yes "$FIREBASE_TOOLS" functions:list --project "$PROJECT" --json --non-interactive 2>/dev/null)" || block "the deploy account cannot list Cloud Functions in $PROJECT (it needs cloudfunctions.functions.list, read-only), so the /ics/** rewrite could not be resolved. Nothing deployed."
  printf '%s' "$out" | node -e '
    let t = ""; process.stdin.on("data", d => t += d).on("end", () => {
      const j = JSON.parse(t); const list = Array.isArray(j.result) ? j.result : [];
      const ics = list.find(f => f.id === "ics" && f.platform === "gcfv2");
      if (!ics) { console.error("BLOCKED: the 2nd gen ics function was not found in the function list, so the /ics/** rewrite would break. Nothing deployed."); process.exit(1); }
      console.log("Guard: ics function visible (" + ics.platform + ", " + ics.region + ").");
    });'
}

# After release.mjs --publish. firebase-tools only WARNS when it cannot find
# the function behind a rewrite and then publishes a 1st gen style /ics/**
# rewrite that does not reach the 2nd gen ics service (deploy/hosting/
# convertConfig.js), so a green run could ship broken calendar links.
release_result() {
  local rc="${1:-}" log="${2:-}" summary="${GITHUB_STEP_SUMMARY:-/dev/null}"
  [[ "$rc" =~ ^[0-9]+$ ]] || block "release-result needs the release exit code (got '$rc')."
  [ -n "$log" ] && [ -f "$log" ] || block "release log '$log' not found."
  local plain
  # firebase-tools colours its output in CI; strip the colour codes first.
  plain="$(perl -pe 's/\e\[[0-9;]*m//g' "$log")"
  if grep -qF "Unable to find a valid endpoint for function" <<<"$plain"; then
    {
      echo "### Release result: the live site's calendar links may be broken"
      echo ""
      echo "firebase-tools could not find the \`ics\` function while publishing, so the live /ics/** rewrite may no longer reach it and members' calendar feeds may fail."
      echo ""
      echo "$ROLLBACK"
      echo ""
      echo "Then check that the deploy account can list Cloud Functions in lv-zion-duties before releasing again."
    } | tee -a "$summary"
    echo "::error::firebase-tools could not resolve the ics function, so the live /ics/** rewrite may be broken. $ROLLBACK"
    exit 1
  fi
  if [ "$rc" -ne 0 ]; then
    echo "::error::release.mjs --publish failed (exit $rc). Read this step's log; if the live site changed and looks wrong: $ROLLBACK"
    exit "$rc"
  fi
  echo "Guard: the release log shows the /ics/** rewrite resolved to the ics function."
}

# Read-only: the documented calendar feed on the live site must answer 200
# with a calendar. The body is discarded (never printed or kept).
ics_live() {
  local url="$LIVE_URL$ICS_CHECK_PATH?release-check=${GITHUB_RUN_ID:-local}" out code type
  out="$(curl -s -o /dev/null --max-time 30 -w '%{http_code} %{content_type}' "$url" || true)"
  code="${out%% *}"; type="${out#* }"
  if [ "$code" != "200" ] || [[ "$type" != text/calendar* ]]; then
    local summary="${GITHUB_STEP_SUMMARY:-/dev/null}"
    {
      echo "### Release check: the live calendar feed did not answer"
      echo ""
      echo "GET $LIVE_URL$ICS_CHECK_PATH returned HTTP $code ($type) instead of 200 with a calendar."
      echo ""
      echo "$ROLLBACK"
    } | tee -a "$summary"
    echo "::error::The live calendar feed $LIVE_URL$ICS_CHECK_PATH returned HTTP $code ($type). $ROLLBACK"
    exit 1
  fi
  echo "Guard: live calendar feed $LIVE_URL$ICS_CHECK_PATH answered HTTP 200 ($type)."
}

# Preview channel id for a branch: sanitized name (at most 20 characters) plus
# a 6-character hash of the full branch name, so a/b and a-b never collide.
channel_for() {
  local branch="${1:-}"
  [ -n "$branch" ] || block "no branch name given."
  local base hash
  base="$(printf '%s' "$branch" | tr '[:upper:]' '[:lower:]' | sed -E 's/[^a-z0-9]+/-/g; s/^-+//; s/-+$//' | cut -c1-20 | sed -E 's/-+$//')"
  [ -n "$base" ] || base="branch"
  hash="$(printf '%s' "$branch" | git hash-object --stdin | cut -c1-6)"
  echo "$base-$hash"
}

case "${1:-}" in
  source) check_source ;;
  channel) shift; channel_for "$@" ;;
  ics-preflight) ics_preflight ;;
  command) shift; check_command "$@" ;;
  config) shift; check_config "$@" ;;
  release-result) shift; release_result "$@" ;;
  ics-live) ics_live ;;
  *) block "usage: deploy-guard.sh source | ics-preflight | channel <branch> | command <preview|release> <args...> | config <file> | release-result <exit code> <log> | ics-live" ;;
esac

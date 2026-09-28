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
#       lv-zion-duties.
#
# Exit 0 means allowed. Anything else prints BLOCKED and exits 1.
set -euo pipefail

PROJECT="lv-zion-duties"
# The one pinned Firebase CLI spec. The workflows pass the same value to
# release.mjs through WDS_FIREBASE_TOOLS.
FIREBASE_TOOLS="firebase-tools@15"
SITE="lv-zion-duties"
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
    if (!h || Array.isArray(h) || h.site !== process.argv[2]) {
      console.error("BLOCKED: the generated Hosting config must name exactly one site, " + process.argv[2] + ".");
      process.exit(1);
    }
    console.log("Guard: generated Hosting config targets only site " + h.site + ".");
  ' "$f" "$SITE"
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
  *) block "usage: deploy-guard.sh source | ics-preflight | channel <branch> | command <preview|release> <args...> | config <file>" ;;
esac

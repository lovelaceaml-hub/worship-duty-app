#!/usr/bin/env bash
# backend-guard.sh: the guard for the "Firebase backend release" workflow
# (Cloud Functions by name, and Firestore rules when ticked).
#
# Hosting keeps its own checks (deploy-guard.sh command preview|release), which
# still refuse every Functions and rules target. deploy-guard.sh hands the
# backend modes below to this file, and .github/scripts/npx-guard/npx calls
# "command functions|rules" for the npx commands scripts/deploy-functions.mjs
# and the rules step start.
#
# Usage:
#   backend-guard.sh pinned
#       Print the pinned Functions (.github/functions-pinned.txt), one per line.
#   backend-guard.sh functions-scope <NONE | ALL | name,name,...>
#       Print the Functions to release, separated by spaces (nothing for NONE).
#       Every name must be on the pinned list.
#   backend-guard.sh functions-only <name...>
#       Print the --only value for those names (functions:a,functions:b).
#   backend-guard.sh functions-source
#       Fail closed unless the code matches what a by-name CI deploy expects:
#       one default Functions codebase in functions/ with only the reviewed
#       predeploy hook, index.js exports exactly the pinned list, the code reads
#       only allowed Secret Manager secrets, and nothing lives only on a Mac.
#   backend-guard.sh command <functions|rules|list> <full command, starting with npx>
#       Check the exact firebase-tools command the workflow is about to run.
#   backend-guard.sh functions-result <exit code> <deploy log> <name...>
#       After a Functions deploy: explain the outcome in the job summary.
#   backend-guard.sh self-test
#       Prove the guard allows the pinned shapes and refuses the rest.
#
# Exit 0 means allowed. Anything else prints BLOCKED and exits 1.
set -euo pipefail

# ---- Pinned for this repository. Change only with Anthony's approval. ----
PROJECT="lv-zion-duties"
FIREBASE_TOOLS="firebase-tools@15"
# Secret Manager secrets the Functions may read (defineSecret). Worship's
# Functions on main read none (the Sheet is reached by impersonation).
ALLOWED_SECRETS=(SONG_INGEST_TOKEN)
# The LV Zion sender functions live in this project but are deployed from
# elsewhere on purpose. This repository must never deploy or delete them.
REFUSED_FUNCTIONS=(onVercelScheduleWrite worshipVercelReconcile)
# firebase.json has no functions.predeploy hook; any hook is refused.
FUNCTIONS_PREDEPLOY=''
# --------------------------------------------------------------------------

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="${GUARD_REPO_ROOT:-$(cd "$HERE/../.." && pwd)}"
PINNED_FILE="$ROOT/.github/functions-pinned.txt"
NAME_RE='^[A-Za-z][A-Za-z0-9_]*$'

block() { echo "BLOCKED: $*" >&2; exit 1; }

is_refused() {
  local n="$1" r
  for r in ${REFUSED_FUNCTIONS[@]+"${REFUSED_FUNCTIONS[@]}"}; do [ "$n" = "$r" ] && return 0; done
  return 1
}

pinned() {
  [ -f "$PINNED_FILE" ] || block ".github/functions-pinned.txt is missing."
  local line seen=" " out=()
  while IFS= read -r line || [ -n "$line" ]; do
    line="${line%%#*}"
    line="$(printf '%s' "$line" | tr -d '[:space:]')"
    [ -z "$line" ] && continue
    [[ "$line" =~ $NAME_RE ]] || block "'$line' in .github/functions-pinned.txt is not a plain function name."
    is_refused "$line" && block "'$line' is on the pinned list but this repository must never deploy it."
    case "$seen" in *" $line "*) block "'$line' is listed twice in .github/functions-pinned.txt." ;; esac
    seen="$seen$line "
    out+=("$line")
  done < "$PINNED_FILE"
  [ "${#out[@]}" -gt 0 ] || block ".github/functions-pinned.txt lists no functions."
  printf '%s\n' "${out[@]}"
}

is_pinned() {
  local n="$1" all
  all="$(pinned)"
  grep -qx -- "$n" <<<"$all"
}

functions_scope() {
  local input
  input="$(printf '%s' "${1:-}" | tr -d '[:space:]')"
  [ -n "$input" ] || block "the functions input is empty; use NONE, ALL, or names separated by commas."
  case "$input" in
    NONE) return 0 ;;
    ALL) pinned | tr '\n' ' ' | sed 's/ $//'; echo; return 0 ;;
  esac
  local all; all="$(pinned)"
  local IFS=, n seen=" " out=()
  for n in $input; do
    [ -n "$n" ] || block "empty name in the functions input '$1'."
    [[ "$n" =~ $NAME_RE ]] || block "'$n' is not a plain function name."
    is_refused "$n" && block "'$n' is never deployed from this repository."
    grep -qx -- "$n" <<<"$all" || block "'$n' is not on the pinned list (.github/functions-pinned.txt)."
    case "$seen" in *" $n "*) block "'$n' is named twice." ;; esac
    seen="$seen$n "
    out+=("$n")
  done
  [ "${#out[@]}" -gt 0 ] || block "no function names in '$1'."
  echo "${out[*]}" | tr ',' ' '
}

functions_only() {
  [ "$#" -gt 0 ] || block "no function names given."
  local n out=""
  for n in "$@"; do out="${out:+$out,}functions:$n"; done
  echo "$out"
}

check_source() {
  local idx="$ROOT/functions/index.js"
  [ -f "$idx" ] || block "functions/index.js is missing."
  node -e '
    const fs = require("fs");
    const path = require("path");
    const [root, predeploy] = process.argv.slice(1);
    const fail = m => { console.error("BLOCKED: " + m); process.exit(1); };
    const c = JSON.parse(fs.readFileSync(path.join(root, "firebase.json"), "utf8"));
    const f = c.functions;
    if (!f || Array.isArray(f)) fail("firebase.json must have exactly one Functions codebase.");
    if (f.source !== "functions") fail("the Functions source must be \"functions\".");
    if (f.codebase && f.codebase !== "default") fail("the Functions codebase must be the default one, so functions:<name> cannot match a codebase.");
    if (f.postdeploy) fail("functions.postdeploy is not expected; review it before releasing.");
    const hooks = f.predeploy == null ? [] : [].concat(f.predeploy);
    const want = predeploy ? [predeploy] : [];
    if (JSON.stringify(hooks) !== JSON.stringify(want)) fail("functions.predeploy must be exactly " + JSON.stringify(want) + " (found " + JSON.stringify(hooks) + "). Hooks run outside this guard; review the change, then update FUNCTIONS_PREDEPLOY in .github/scripts/backend-guard.sh.");
    let runtime = f.runtime;
    if (!runtime) {
      const pkg = JSON.parse(fs.readFileSync(path.join(root, "functions", "package.json"), "utf8"));
      const node = String((pkg.engines || {}).node || "").trim();
      if (!/^\d+$/.test(node)) fail("functions/package.json engines.node must be a plain major version (found " + JSON.stringify(node) + ").");
      runtime = "nodejs" + node;
    }
    // Google decommissions each Node.js runtime on a fixed date; after that,
    // existing functions can no longer be updated on it
    // (https://docs.cloud.google.com/functions/docs/runtime-support).
    const RUNTIME_END = {
      nodejs20: { deprecated: "2026-04-30", decommissioned: "2026-10-30" },
      nodejs22: { deprecated: "2027-04-30", decommissioned: "2027-10-31" },
    };
    const end = RUNTIME_END[runtime];
    if (!end) fail("runtime " + runtime + " has no recorded end date in the guard; add it to RUNTIME_END after checking Google runtime support.");
    const now = new Date(process.env.GUARD_NOW || Date.now());
    if (now >= new Date(end.decommissioned + "T00:00:00Z")) fail("the Functions use " + runtime + ", which Google decommissioned on " + end.decommissioned + "; updates are refused. Move to a newer Node.js runtime in a reviewed pull request first.");
    if (now >= new Date(end.deprecated + "T00:00:00Z")) console.log("::warning::The Functions use " + runtime + ", which Google decommissions on " + end.decommissioned + ". Plan the move to a newer Node.js runtime.");
    console.log("Guard: firebase.json has one default Functions codebase in functions/ (" + runtime + ") with only the reviewed hook.");
  ' "$ROOT" "$FUNCTIONS_PREDEPLOY"

  if grep -nE 'module\.exports|exports\[' "$idx" >/dev/null; then
    block "functions/index.js uses an export form the guard cannot check (module.exports or exports[...])."
  fi
  local exported want n
  exported="$(grep -oE '^exports\.[A-Za-z0-9_]+' "$idx" | sed 's/^exports\.//' | sort)"
  want="$(pinned | sort)"
  for n in $exported; do
    is_refused "$n" && block "functions/index.js exports '$n', which this repository must never deploy. Nothing released."
  done
  [ "$(echo "$exported" | sort -u | grep -c .)" = "$(echo "$exported" | grep -c .)" ] || block "functions/index.js exports a name twice."
  if [ "$exported" != "$want" ]; then
    block "functions/index.js exports [ $(echo $exported) ] but .github/functions-pinned.txt lists [ $(echo $want) ]. Update the pinned list deliberately in a reviewed pull request."
  fi

  # Everything the deployed code reads must come from Git or Secret Manager.
  local files=()
  while IFS= read -r n; do files+=("$n"); done < <(cd "$ROOT" && find functions -type f \( -name '*.js' -o -name '*.mjs' -o -name '*.cjs' \) -not -path '*/node_modules/*' -not -path 'functions/test/*' | sort)
  local hit
  hit="$(cd "$ROOT" && grep -nE 'define(String|Int|Float|Boolean|List|JsonSecret)\b' "${files[@]}" || true)"
  [ -z "$hit" ] || block "the Functions read a parameter from a .env file, which is not in Git: $(echo "$hit" | head -n 1)"
  hit="$(cd "$ROOT" && grep -nE 'functions\.config\(|process\.env\b' "${files[@]}" || true)"
  [ -z "$hit" ] || block "the Functions read runtime config or environment variables that may only exist on a Mac: $(echo "$hit" | head -n 1)"
  local s
  while IFS= read -r s; do
    [ -z "$s" ] && continue
    printf '%s\n' ${ALLOWED_SECRETS[@]+"${ALLOWED_SECRETS[@]}"} | grep -qx -- "$s" || block "the Functions use secret '$s', which is not in ALLOWED_SECRETS. Confirm it exists in Secret Manager for $PROJECT, then add it here."
  done < <(cd "$ROOT" && grep -ohE "defineSecret\(['\"][A-Z0-9_]+['\"]\)" "${files[@]}" | sed -E "s/defineSecret\(['\"]([A-Z0-9_]+)['\"]\)/\1/" | sort -u)
  if (cd "$ROOT" && grep -nE "defineSecret\\([^'\"]" "${files[@]}" >/dev/null); then
    block "a defineSecret call does not use a plain string name, so the guard cannot check it."
  fi
  if compgen -G "$ROOT/functions/.env*" >/dev/null || [ -e "$ROOT/functions/.runtimeconfig.json" ]; then
    block "functions/ holds .env or .runtimeconfig.json files; CI must deploy only what is in Git."
  fi
  [ -f "$ROOT/functions/package-lock.json" ] || block "functions/package-lock.json is missing, so npm ci cannot install the exact dependencies."
  echo "Guard: index.js exports exactly the pinned Functions; secrets used: ${ALLOWED_SECRETS[*]:-none}; nothing needed lives only on a Mac."
}

check_command() {
  local kind="${1:-}"; shift || true
  local got=("$@")
  local joined=" ${got[*]:-} "
  [ "${#got[@]}" -gt 0 ] || block "empty command."
  [ "${got[0]}" = "npx" ] && [ "${got[1]:-}" = "--yes" ] && [ "${got[2]:-}" = "$FIREBASE_TOOLS" ] || block "only 'npx --yes $FIREBASE_TOOLS ...' may run here; got: ${got[*]}"
  case "$joined" in
    *" --force "*|*" -f "*) block "--force is never allowed (it lets firebase-tools delete live Functions without asking)." ;;
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
  if [ -n "$project_val" ] && [ "$project_val" != "$PROJECT" ]; then
    block "wrong project '$project_val'; this workflow only deploys to $PROJECT."
  fi
  local want=()
  case "$kind" in
    functions)
      [ "${got[3]:-}" = "deploy" ] || block "only 'deploy' is allowed (got '${got[3]:-}')."
      [ "$only_count" -gt 0 ] || block "a bare 'firebase deploy' would deploy every target in $PROJECT."
      [ "$only_count" -eq 1 ] || block "more than one --only flag."
      [ -n "$only_val" ] || block "empty --only scope."
      case ",$only_val," in
        *,functions,*) block "a bare '--only functions' would offer to delete every $PROJECT Function not in this code; name each function." ;;
      esac
      local part name seen=" " parts=()
      IFS=, read -r -a parts <<<"$only_val"
      for part in "${parts[@]}"; do
        case "$part" in
          functions:*) name="${part#functions:}" ;;
          *) block "'$part' is not a Functions target; this step deploys named Functions only." ;;
        esac
        [[ "$name" =~ $NAME_RE ]] || block "'$part' does not name one function (codebases and groups are not allowed)."
        is_refused "$name" && block "'$name' is never deployed from this repository."
        is_pinned "$name" || block "'$name' is not on the pinned list (.github/functions-pinned.txt)."
        case "$seen" in *" $name "*) block "'$name' is named twice." ;; esac
        seen="$seen$name "
      done
      case "$only_val" in *,) block "trailing comma in the --only scope." ;; esac
      want=(npx --yes "$FIREBASE_TOOLS" deploy --only "$only_val" --project "$PROJECT" --non-interactive)
      ;;
    rules)
      [ "${got[3]:-}" = "deploy" ] || block "only 'deploy' is allowed (got '${got[3]:-}')."
      [ "$only_count" -eq 1 ] && [ "$only_val" = "firestore:rules" ] || block "the rules step deploys exactly '--only firestore:rules' (got '${only_val:-none}')."
      want=(npx --yes "$FIREBASE_TOOLS" deploy --only firestore:rules --project "$PROJECT" --non-interactive)
      ;;
    list)
      want=(npx --yes "$FIREBASE_TOOLS" functions:list --project "$PROJECT" --json --non-interactive)
      ;;
    *) block "unknown command kind '$kind' (expected functions, rules or list)." ;;
  esac
  if [ "${#got[@]}" -ne "${#want[@]}" ]; then
    block "command differs from the pinned $kind command.
  expected: ${want[*]}
  got:      ${got[*]}"
  fi
  for ((i = 0; i < ${#want[@]}; i++)); do
    [ "${got[$i]}" = "${want[$i]}" ] || block "command differs from the pinned $kind command at argument $((i + 1)) ('${got[$i]}' instead of '${want[$i]}').
  expected: ${want[*]}
  got:      ${got[*]}"
  done
  echo "Guard: allowed $kind command: ${got[*]}"
}

# firebase-tools 15 updates the Functions first and only then sets up the
# Artifact Registry cleanup policy; in --non-interactive mode without --force,
# a missing policy makes it exit non-zero AFTER the Functions are live. This
# workflow never passes --force, so the summary says what really happened.
CLEANUP_MSG="Functions successfully deployed but could not set up cleanup policy"
ERRORS_MSG="Functions deploy had errors with the following functions:"
functions_result() {
  local rc="${1:-}" log="${2:-}"; shift 2 || true
  local names=("$@") summary="${GITHUB_STEP_SUMMARY:-/dev/null}"
  [[ "$rc" =~ ^[0-9]+$ ]] || block "functions-result needs the deploy exit code (got '$rc')."
  [ -n "$log" ] && [ -f "$log" ] || block "deploy log '$log' not found."
  [ "${#names[@]}" -gt 0 ] || block "functions-result needs the released function names."
  local plain f confirmed=() unconfirmed=()
  plain="$(perl -pe 's/\e\[[0-9;]*m//g' "$log")"
  for f in "${names[@]}"; do
    if grep -qE "functions\[$f\([a-z0-9-]+\)\] (Successful (create|update) operation\.|Skipped \(No changes detected\))" <<<"$plain"; then
      confirmed+=("$f")
    else
      unconfirmed+=("$f")
    fi
  done
  local had_errors=0; grep -qF "$ERRORS_MSG" <<<"$plain" && had_errors=1
  local fix="npx firebase-tools@15 functions:artifacts:setpolicy --project $PROJECT"

  if grep -qF "$CLEANUP_MSG" <<<"$plain"; then
    if [ "${#unconfirmed[@]}" -eq 0 ] && [ "$had_errors" -eq 0 ]; then
      {
        echo "### Functions result: all ${#names[@]} released Functions ARE live"
        echo ""
        echo "Live now: ${names[*]}. Do not rerun this release to fix the red mark."
        echo ""
        echo "Only the Artifact Registry cleanup policy is missing in $PROJECT (it deletes old container images). One-time fix, run by Anthony in Google Cloud Shell: \`$fix\`"
      } | tee -a "$summary"
      echo "::error::The Functions ARE live; only the Artifact Registry cleanup policy is missing. One-time fix in Cloud Shell: $fix"
      exit 1
    fi
    {
      echo "### Functions result: finished with errors, and the cleanup policy is also missing"
      echo ""
      echo "Confirmed live in the log: ${confirmed[*]:-none}. Not confirmed: ${unconfirmed[*]:-none}. Read the deploy step's log. Cleanup policy fix (Cloud Shell): \`$fix\`"
    } | tee -a "$summary"
    echo "::error::The Functions release finished with errors. Confirmed live: ${confirmed[*]:-none}. Not confirmed: ${unconfirmed[*]:-none}."
    exit 1
  fi
  if [ "$rc" -ne 0 ] || [ "$had_errors" -eq 1 ]; then
    {
      echo "### Functions result: failed (exit $rc)"
      echo ""
      echo "Confirmed live in the log: ${confirmed[*]:-none}. Not confirmed: ${unconfirmed[*]:-none}. Functions listed as confirmed already run the new code."
    } | tee -a "$summary"
    echo "::error::The Functions release failed (exit $rc). Confirmed live: ${confirmed[*]:-none}. Not confirmed: ${unconfirmed[*]:-none}."
    [ "$rc" -ne 0 ] && exit "$rc"
    exit 1
  fi
  if [ "${#unconfirmed[@]}" -ne 0 ]; then
    {
      echo "### Functions result: firebase-tools exited 0, but the log does not confirm every Function"
      echo ""
      echo "Confirmed: ${confirmed[*]:-none}. Not confirmed: ${unconfirmed[*]}. Check the deploy step's log."
    } | tee -a "$summary"
    echo "::error::The deploy exited 0 but the log does not confirm: ${unconfirmed[*]}."
    exit 1
  fi
  {
    echo "### Functions result: done"
    echo ""
    echo "Live now: ${names[*]}"
  } | tee -a "$summary"
}

self_test() {
  local me="${BASH_SOURCE[0]}" pass=0 bad=0
  expect() {
    local want="$1"; shift
    local got=allowed
    if ! bash "$me" "$@" >/dev/null 2>&1; then got=refused; fi
    if [ "$got" = "$want" ]; then
      pass=$((pass + 1)); echo "ok   ($want) $*"
    else
      bad=$((bad + 1)); echo "FAIL (wanted $want, got $got) $*"
    fi
  }
  local P="$PROJECT" T="$FIREBASE_TOOLS" first second all
  first="$(pinned | sed -n 1p)"
  second="$(pinned | sed -n 2p)"
  all="$(functions_only $(pinned))"
  expect allowed functions-scope NONE
  expect allowed functions-scope ALL
  expect allowed functions-scope "$first"
  expect refused functions-scope ""
  expect refused functions-scope "notAFunction"
  expect refused functions-scope "$first,$first"
  expect refused functions-scope "functions"
  expect refused functions-scope "$first,../x"
  expect allowed command functions npx --yes "$T" deploy --only "functions:$first" --project "$P" --non-interactive
  expect allowed command functions npx --yes "$T" deploy --only "$all" --project "$P" --non-interactive
  expect allowed command rules npx --yes "$T" deploy --only firestore:rules --project "$P" --non-interactive
  expect allowed command list npx --yes "$T" functions:list --project "$P" --json --non-interactive
  expect refused command functions npx --yes "$T" deploy --only functions --project "$P" --non-interactive
  expect refused command functions npx --yes "$T" deploy --project "$P" --non-interactive
  expect refused command functions npx --yes "$T" deploy --only "functions:$first" --project "$P" --non-interactive --force
  expect refused command functions npx --yes "$T" deploy --only "functions:$first" --project "$P" --non-interactive -f
  expect refused command functions npx --yes "$T" deploy --only "functions:$first" --except hosting --project "$P" --non-interactive
  expect refused command functions npx --yes "$T" deploy --only "functions:$first,hosting" --project "$P" --non-interactive
  expect refused command functions npx --yes "$T" deploy --only "functions:$first,firestore:rules" --project "$P" --non-interactive
  expect refused command functions npx --yes "$T" deploy --only "functions:$first,auth" --project "$P" --non-interactive
  expect refused command functions npx --yes "$T" deploy --only "functions:notPinned" --project "$P" --non-interactive
  expect refused command functions npx --yes "$T" deploy --only "functions:default:$first" --project "$P" --non-interactive
  expect refused command functions npx --yes "$T" deploy --only "functions:$first,functions:$first" --project "$P" --non-interactive
  expect refused command functions npx --yes "$T" deploy --only "functions:$first" --only "functions:$second" --project "$P" --non-interactive
  expect refused command functions npx --yes "$T" deploy --only "functions:$first" --project some-other-project --non-interactive
  expect refused command functions npx --yes "$T" deploy --only "functions:$first" --project "$P"
  expect refused command functions npx --yes firebase-tools@latest deploy --only "functions:$first" --project "$P" --non-interactive
  expect refused command functions npx --yes "$T" functions:delete "$first" --project "$P" --non-interactive
  expect refused command rules npx --yes "$T" deploy --only firestore --project "$P" --non-interactive
  expect refused command rules npx --yes "$T" deploy --only firestore:indexes --project "$P" --non-interactive
  expect refused command rules npx --yes "$T" deploy --only firestore:rules,storage --project "$P" --non-interactive
  expect refused command rules npx --yes "$T" deploy --only storage --project "$P" --non-interactive
  expect refused command rules npx --yes "$T" deploy --only firestore:rules --project "$P" --non-interactive --force
  expect refused command hosting npx --yes "$T" deploy --only hosting --project "$P" --non-interactive
  local r
  for r in ${REFUSED_FUNCTIONS[@]+"${REFUSED_FUNCTIONS[@]}"}; do
    expect refused functions-scope "$r"
    expect refused functions-scope "$first,$r"
    expect refused command functions npx --yes "$T" deploy --only "functions:$r" --project "$P" --non-interactive
    expect refused command functions npx --yes "$T" deploy --only "functions:$first,functions:$r" --project "$P" --non-interactive
  done
  echo "backend-guard self-test: $pass passed, $bad failed"
  [ "$bad" -eq 0 ]
}

case "${1:-}" in
  pinned) pinned ;;
  functions-scope) shift; functions_scope "${1-}" ;;
  functions-only) shift; functions_only "$@" ;;
  functions-source) check_source ;;
  command) shift; check_command "$@" ;;
  functions-result) shift; functions_result "$@" ;;
  self-test) self_test ;;
  *) block "usage: backend-guard.sh pinned | functions-scope <NONE|ALL|names> | functions-only <names> | functions-source | command <functions|rules|list> <npx ...> | functions-result <rc> <log> <names> | self-test" ;;
esac

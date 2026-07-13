# Installer Specification

> Component: `bin/install.js`, `bin/uninstall.js`, `bin/update.js`, `bin/cli.js`
> Runtime: Node.js ≥ 18, zero third-party dependencies

---

## 1. Public CLI surface

```bash
kilo-superpowers-compose install     # default if no subcommand
kilo-superpowers-compose uninstall
kilo-superpowers-compose update
kilo-superpowers-compose --version
kilo-superpowers-compose --help
```

`bin/cli.js` dispatches by `process.argv[2]`. Defaults to `install`.

---

## 2. install.js — full specification

### 2.1 Inputs

None. Uses defaults from environment.

Environment variables (all optional):

| Var | Default | Purpose |
|---|---|---|
| `KILO_HOME` | `os.homedir()` | Override user home (for testing) |
| `KILO_SUPERPOWERS_DRY_RUN` | unset | If `1`, print intended actions without modifying anything |
| `KILO_SUPERPOWERS_VERBOSE` | unset | If `1`, verbose logging |

> **Removed in v0.2.0:** `KILO_SUPERPOWERS_PREFIX` — the `compose-` skill
> namespace prefix is now intrinsic. If set, the env var is ignored; if
> present in a stale `.env`, it's safe to delete.

### 2.2 Behavior

1. **Locate this package's resources**
   - Find `package.json` of `kilo-superpowers-compose`
   - Resolve `skills/`, `agents/` relative to it

2. **Ensure target directories exist** (create if missing)
   - `~/.config/kilo/`
   - `~/.config/kilo/agent/`
   - `~/.kilo/skills/`

3. **Back up `kilo.jsonc`** to `kilo.jsonc.bak.<timestamp>` if it exists

4. **Junction the skills folder**
   - Target: `~/.kilo/skills/compose`
   - Source: `<pkg>/skills/`
   - Remove existing junction/file at target first
   - Use `fs.symlinkSync(src, dst, 'junction')` on Windows, default on Unix
   - **Legacy cleanup (v0.2+):** if a stale `~/.kilo/skills/superpowers`
     junction exists from a pre-v0.2 install, it is removed (safe: only
     the link is deleted, the target is left alone).

5. **Copy agent .md files**
   - Source: `<pkg>/agents/*.md`
   - Target: `~/.config/kilo/agent/`
   - Overwrite if exists (idempotent)

6. **Patch `~/.config/kilo/kilo.jsonc`**
   - Read JSONC (strip `//` line comments only; block comments `/* */`
     are NOT supported — if present and parsing fails, restore from backup
     and exit code 2)
   - Ensure `skills.paths` array exists
   - Append `<pkg>/skills/` if not already present (compared on normalized
     absolute paths to avoid separator/case duplicate entries)
   - **Ensure `config.permission.skill["compose-*"] = "deny"`** — written
     last so Kilo's `findLast`-based `Permission.evaluate` resolves it
     for built-in agents. The three `compose*` agents' frontmatter
     overrides the deny with `allow` (frontmatter wins). Idempotent: if
     already set, no change. Scalar `permission.skill` (e.g. `"*":"ask"`)
     is upgraded to object form preserving the existing rule.
   - Write back as JSON (lose comments; acceptable trade-off)
   - On parse error → restore from backup, **exit 2**

7. **Write manifest** to `~/.config/kilo/.kilo-superpowers-compose.json`
   recording every path created (agents, skills link, the `skills.paths`
   entry, the `permissionKey` and `skillPrefix` used) + name + version
   + upstream tag. Used by uninstall to remove exactly what was
   installed.

注：本包不再注册或复制任何斜杠命令——早期版本会向 `~/.config/kilo/commands/`
复制 `superpowers.md`。移除理由：参考 mimo-compose，用户通过代理选择器中的
`compose` 代理直接进入工作流，无需在命令面板中额外注册命令。
9. **Print success message**
   - Number of skills installed
   - Number of agents installed
   - List agent names user will see in picker
   - Remind: "Restart Kilo to load"

### 2.3 Exit codes

- `0` — success
- `1` — generic error
- `2` — `kilo.jsonc` parse error (already restored from backup)
- `3` — target directory not writable
- `4` — junction/symlink creation failed

### 2.4 Full source

> The installer was refactored in v0.2.0 from a single `bin/install.js`
> script into a thin entrypoint + a shared library:
>
> - **`bin/install.js`** — entrypoint shell: parses argv, calls
>   `runInstall()` from `bin/lib.js`, exits with the returned code.
> - **`bin/uninstall.js`** — same shape, calls `runUninstall()`.
> - **`bin/update.js`** — same shape, calls `runUpdate()` (reads previous
>   version from the manifest for the "updating v→v" log line).
> - **`bin/cli.js`** — subcommand dispatcher (`install` / `uninstall` /
>   `update` / `--version` / `--help`).
> - **`bin/lib.js`** — all shared logic: pure `readEnv`, `resolvePaths`,
>   `buildContext`, `stripLineComments`, `normalizePath`,
>   `skillsPathsContains`, `ensureSkillDeny`, `removeSkillDeny`,
>   `findPackageRoot`, `readPackageJson`, `makeLogger`, `ensureDir`,
>   `linkExists`, `safeRemove`, `readJsonc`, `writeJson`, `backupConfig`,
>   manifest I/O (`readManifest` / `writeManifest` / `removeManifest`),
>   `makeSkillsLink`, `listMdFiles`, plus the orchestrators
>   `runInstall` / `runUninstall` / `runUpdate` which return one of the
>   exit codes from `EXIT` (see §2.3).
>
> Read `bin/lib.js` directly — it is the canonical source. The behaviour
> list in §2.2 maps 1:1 to the `runInstall` function. The orchestrator
> returns an exit code (0–4); the entrypoint shells convert that to a
> `process.exit(code)` so node:test can assert without an exit.

---

## 3. uninstall.js — full specification

### 3.1 Behavior

1. Read manifest at `~/.config/kilo/.kilo-superpowers-compose.json`
2. Remove agent `.md` files **listed in the manifest** (precise — no
   content sniffing). Falls back to the well-known names
   (`compose.md`, `compose-dev.md`, `compose-review.md`) if the manifest
   is missing.
3. Remove the skills junction at `~/.kilo/skills/compose`
4. **Defensive cleanup (v0.2+):** if a stale `~/.kilo/skills/superpowers`
   junction exists from a pre-v0.2 install, remove that too.
5. **Defensive cleanup:** remove any leftover `superpowers.md` in
   `~/.config/kilo/commands/` from older (≤ v0.1.2) installs that still
   registered the removed `/superpowers` slash command. Logged when found.
6. Edit `kilo.jsonc`: remove this package's entries from `skills.paths`
   (matching the manifest's `skillsPathsEntry` on normalized path) and
   remove `permission.skill["compose-*"]` (keeping other rules intact).
7. Delete the manifest file.
8. Don't touch any user-created skills, agents, or config
9. Print summary

### 3.2 Ownership detection — manifest method

Since removal is destructive, we must only delete files we created.
**Method: a manifest written at install time.** `install.js` writes
`~/.config/kilo/.kilo-superpowers-compose.json` recording every path it
created/copied plus the junction path, the `skills.paths` entry it added,
and the installed package version. `uninstall.js` reads that manifest and
removes exactly those entries, then deletes the manifest itself.

Manifest shape (`~/.config/kilo/.kilo-superpowers-compose.json`):

```json
{
  "name": "kilo-superpowers-compose",
  "version": "0.2.0",
  "upstreamTag": "v6.1.1",
  "pkgRoot": "<abs path to installed package root>",
  "skillsSrc": "<abs path to pkg/skills>",
  "skillsLink": "<abs path to ~/.kilo/skills/compose>",
  "skillsLinkType": "junction" | "symlink" | "copy",
  "permissionKey": "compose-*",
  "skillPrefix": "compose-",
  "skillsPathsEntry": "<abs path to pkg/skills>",
  "agents": ["<abs path to copied agent .md files>"]
}
```

This replaces the earlier "content sniffing" approach (matching H1 markers
like `# Compose Orchestrator`) which was fragile and could mismatch files
the user hand-edited. With the manifest, removal is precise and never
touches user-created files. If the manifest is missing on uninstall,
`uninstall.js` falls back to best-effort removal of the well-known names
(`compose.md`, `compose-dev.md`, `compose-review.md`, the `compose`
skills link) but logs that the manifest was missing.

### 3.3 Exit codes

Same as install (`uninstall.js` is a mirror): `0` success, `1` generic
error, `2` `kilo.jsonc` parse error (restored from backup before exit).

---

## 4. update.js — full specification

Identical to `install.js`. Re-running install is idempotent (the manifest
and all target files are overwritten in place). Additionally:

- Read previous version from `~/.config/kilo/.kilo-superpowers-compose.json`
  manifest (`version` field); if it differs from the current package
  version, print `updating kilo-superpowers-compose <old> → <new>`.
- If no manifest exists yet (first run / older install), behave exactly
  like a fresh `install.js`.

---

## 5. cli.js — dispatcher

```javascript
#!/usr/bin/env node
import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import fs from 'node:fs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const cmd = process.argv[2] || 'install';

if (cmd === '--version' || cmd === '-v') {
  const pkg = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'package.json'), 'utf8'));
  console.log(pkg.version);
  process.exit(0);
}

if (cmd === '--help' || cmd === '-h') {
  console.log(`Usage: kilo-superpowers-compose <command>

Commands:
  install     Install skills and agents (default)
  uninstall   Remove everything this package installed
  update      Re-run install (idempotent)

Options:
  -v, --version    Show version
  -h, --help       Show this help

Environment:
  KILO_HOME=<path>           Override user home (for testing)
  KILO_SUPERPOWERS_DRY_RUN=1 Print intended actions without modifying
  KILO_SUPERPOWERS_VERBOSE=1 Verbose logging
  KILO_SUPERPOWERS_PREFIX=1  (removed in v0.2.0; ignored if set)
`);
  process.exit(0);
}

const script = path.join(__dirname, `${cmd}.js`);
if (!fs.existsSync(script)) {
  console.error(`Unknown command: ${cmd}`);
  console.error('Run `kilo-superpowers-compose --help` for usage.');
  process.exit(1);
}

// Re-exec the subcommand script
import(script).catch(err => {
  console.error(err);
  process.exit(1);
});
```

---

## 6. Manual testing checklist (Phase 2)

Before tagging a release, verify on a clean machine:

- [ ] `node --test` passes (covers install / uninstall / update round-trips
      including the `compose-*` skill namespace and permission deny)
- [ ] `node bin/install.js` succeeds on Windows
- [ ] `node bin/install.js` succeeds on macOS
- [ ] `node bin/install.js` succeeds on Linux
- [ ] Re-running install produces no errors (idempotent)
- [ ] After install, `~/.kilo/skills/compose` is a junction/symlink
- [ ] After install, `~/.config/kilo/agent/` contains `compose.md`,
      `compose-dev.md`, `compose-review.md`
- [ ] After install, `kilo.jsonc` has the new `skills.paths` entry AND a
      `permission.skill["compose-*"]="deny"` (last-position)
- [ ] Restarting Kilo, `compose` agent appears in the agent picker
- [ ] Selecting `compose` and talking to it triggers the Superpowers workflow
- [ ] Built-in agents (`code`, `plan`, etc.) cannot see/invoke `compose-*`
      skills, but `compose` / `compose-dev` / `compose-review` can
- [ ] `node bin/uninstall.js` removes all artifacts and the
      `permission.skill["compose-*"]` entry
- [ ] After uninstall, no `compose` references that we own remain in
      `kilo.jsonc` (user-owned entries stay intact)
- [ ] Kilo still works normally after uninstall
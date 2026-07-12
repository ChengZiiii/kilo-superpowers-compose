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
| `KILO_SUPERPOWERS_PREFIX` | unset | If `1`, prefix all skill names with `superpowers-` |
| `KILO_SUPERPOWERS_DRY_RUN` | unset | If `1`, print intended actions without modifying anything |
| `KILO_SUPERPOWERS_VERBOSE` | unset | If `1`, verbose logging |

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
   - Target: `~/.kilo/skills/superpowers`
   - Source: `<pkg>/skills/`
   - Remove existing junction/file at target first
   - Use `fs.symlinkSync(src, dst, 'junction')` on Windows, default on Unix

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
   - Write back as JSON (lose comments; acceptable trade-off)
   - On parse error → restore from backup, **exit 2**

7. **Write manifest** to `~/.config/kilo/.kilo-superpowers-compose.json`
   recording every path created (agents, skills link, the `skills.paths`
   entry) + version + upstream tag. Used by uninstall.

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

```javascript
#!/usr/bin/env node
// bin/install.js
// Kilo Superpowers Compose — installer
// Zero dependencies. Node.js >= 18.

import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname  = path.dirname(__filename);

// ─── config ──────────────────────────────────────────────────────────
const HOME          = process.env.KILO_HOME || os.homedir();
const DRY_RUN       = process.env.KILO_SUPERPOWERS_DRY_RUN  === '1';
const VERBOSE       = process.env.KILO_SUPERPOWERS_VERBOSE  === '1';
const USE_PREFIX    = process.env.KILO_SUPERPOWERS_PREFIX   === '1';

const CONFIG_DIR    = path.join(HOME, '.config', 'kilo');
const CONFIG_FILE   = path.join(CONFIG_DIR, 'kilo.jsonc');
const SKILLS_DIR    = path.join(HOME, '.kilo', 'skills');
const AGENTS_DIR    = path.join(CONFIG_DIR, 'agent');

const SKILL_LINK    = path.join(SKILLS_DIR, 'superpowers');

// ─── helpers ─────────────────────────────────────────────────────────
function log(...args) {
  if (VERBOSE) console.log('[install]', ...args);
}

function die(code, msg) {
  console.error(`✗ ${msg}`);
  process.exit(code);
}

function findPackageRoot() {
  // bin/install.js → ../ is package root
  return path.resolve(__dirname, '..');
}

function readJsonc(file) {
  if (!fs.existsSync(file)) return {};
  const raw = fs.readFileSync(file, 'utf8');
  const stripped = raw.split('\n').map(line => {
    // Strip // comments only outside of strings (very simple heuristic)
    const idx = line.indexOf('//');
    if (idx === -1) return line;
    const before = line.slice(0, idx);
    const quotes = (before.match(/(?<!\\)"/g) || []).length;
    return quotes % 2 === 0 ? before : line;
  }).join('\n');
  try {
    return JSON.parse(stripped);
  } catch (e) {
    return { __parseError: e.message, __raw: raw };
  }
}

function writeJson(file, obj) {
  fs.writeFileSync(file, JSON.stringify(obj, null, 2) + '\n', 'utf8');
}

function ensureDir(d) {
  if (DRY_RUN) { log('would mkdir', d); return; }
  fs.mkdirSync(d, { recursive: true });
}

function backupConfig() {
  if (!fs.existsSync(CONFIG_FILE)) return null;
  const ts = new Date().toISOString().replace(/[:.]/g, '-');
  const bak = `${CONFIG_FILE}.bak.${ts}`;
  if (DRY_RUN) { log('would backup', CONFIG_FILE, '→', bak); return bak; }
  fs.copyFileSync(CONFIG_FILE, bak);
  return bak;
}

// ─── main ────────────────────────────────────────────────────────────
function install() {
  const pkgRoot = findPackageRoot();
  const srcSkills   = path.join(pkgRoot, 'skills');
  const srcAgents   = path.join(pkgRoot, 'agents');

  log('package root', pkgRoot);
  log('config dir',   CONFIG_DIR);
  log('skills dir',   SKILLS_DIR);

  // 1. ensure target dirs
  [CONFIG_DIR, AGENTS_DIR, SKILLS_DIR].forEach(ensureDir);

  // 2. back up config
  const bak = backupConfig();
  if (bak) log('backup created', bak);

  // 3. junction skills
  if (fs.existsSync(SKILL_LINK)) {
    log('removing existing', SKILL_LINK);
    if (!DRY_RUN) fs.rmSync(SKILL_LINK, { recursive: true, force: true });
  }
  log('creating junction', srcSkills, '→', SKILL_LINK);
  if (!DRY_RUN) {
    try {
      fs.symlinkSync(srcSkills, SKILL_LINK, 'junction');
    } catch (e) {
      die(4, `failed to create junction: ${e.message}`);
    }
  }

  // 4. copy agents
  if (fs.existsSync(srcAgents)) {
    log('copying agents', srcAgents, '→', AGENTS_DIR);
    if (!DRY_RUN) fs.cpSync(srcAgents, AGENTS_DIR, { recursive: true, force: true });
  }

  // 5. patch kilo.jsonc
  log('patching', CONFIG_FILE);
  let config = readJsonc(CONFIG_FILE);
  if (config.__parseError) {
    if (bak) fs.copyFileSync(bak, CONFIG_FILE);
    die(2, `kilo.jsonc parse error: ${config.__parseError} (restored from backup)`);
  }
  config.skills = config.skills || {};
  config.skills.paths = config.skills.paths || [];
  // Idempotency: compare on NORMALIZED absolute paths so separator/case
  // differences (e.g. C:\ vs C:/) don't produce duplicate entries.
  const norm = p => path.resolve(p).toLowerCase();
  if (!config.skills.paths.some(p => norm(p) === norm(srcSkills))) {
    config.skills.paths.push(srcSkills);
  }
  if (!DRY_RUN) writeJson(CONFIG_FILE, config);

  // 7. write manifest (for precise, content-sniff-free uninstall)
  if (!DRY_RUN) writeManifest({
    version: PKG_VERSION,
    upstreamTag: UPSTREAM_TAG,
    skillsLink: SKILL_LINK,
    skillsPathsEntry: srcSkills,
    agents: installedAgentPaths,
  });

  // 7. summarize
  console.log('✓ kilo-superpowers-compose installed');
  console.log(`  Skills:  ${SKILL_LINK} → ${srcSkills}`);
  const agentFiles = fs.existsSync(srcAgents) ? fs.readdirSync(srcAgents).filter(f => f.endsWith('.md')) : [];
  console.log(`  Agents:  ${agentFiles.join(', ')}`);
  console.log('');
  console.log('  Restart Kilo CLI / VS Code extension to load. Pick the "compose" agent to use the workflow.');
}

install();
```

---

## 3. uninstall.js — full specification

### 3.1 Behavior

1. Remove junction at `~/.kilo/skills/superpowers`
2. Remove agent `.md` files owned by this package
3. Edit `kilo.jsonc`: remove this package's entries from `skills.paths`
4. Don't touch any user-created skills, agents, or config
5. Print summary

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
  "version": "0.1.0",
  "upstreamTag": "v6.1.1",
  "skillsLink": "<abs path to ~/.kilo/skills/superpowers>",
  "skillsPathsEntry": "<abs path to pkg/skills>",
  "agents": ["<abs path to copied agent .md files>"]
}
```

This replaces the earlier "content sniffing" approach (matching H1 markers
like `# Compose Orchestrator`) which was fragile and could mismatch files
the user hand-edited. With the manifest, removal is precise and never
touches user-created files. If the manifest is missing on uninstall,
`uninstall.js` falls back to best-effort removal of the well-known names
(`compose.md`, `compose-dev.md`, `compose-review.md`, the `superpowers`
skills link) but warns loudly.

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
  KILO_SUPERPOWERS_PREFIX=1    Prefix all skill names with 'superpowers-'
  KILO_SUPERPOWERS_DRY_RUN=1   Print intended actions without modifying
  KILO_SUPERPOWERS_VERBOSE=1   Verbose logging
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

Before tagging v0.1.0, verify on a clean machine:

- [ ] `node bin/install.js` succeeds on Windows
- [ ] `node bin/install.js` succeeds on macOS
- [ ] `node bin/install.js` succeeds on Linux
- [ ] Re-running install produces no errors (idempotent)
- [ ] After install, `~/.kilo/skills/superpowers` is a junction/symlink
- [ ] After install, `~/.config/kilo/agent/` contains compose*.md
- [ ] After install, `kilo.jsonc` contains the new path entry
- [ ] Restarting Kilo, `compose` agent appears in the agent picker
- [ ] Selecting `compose` and talking to it triggers the Superpowers workflow
- [ ] `node bin/uninstall.js` removes all artifacts
- [ ] After uninstall, no `superpowers` references remain in `kilo.jsonc`
- [ ] Kilo still works normally after uninstall
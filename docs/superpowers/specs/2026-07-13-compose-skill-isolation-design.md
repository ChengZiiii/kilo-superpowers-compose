# 设计规格：compose 技能命名空间隔离（模型侧）

> Status: **草稿，待用户审阅**
> 日期：2026-07-13
> 作者：brainstorming 会话产出
> 关联：修订 `docs/DESIGN.md` §6 / §10 Q1 / §10 Q3；修订 `NOTICE`；修订 `AGENTS.md`（verbatim 硬约束）

---

## 1. 目标与非目标

### 目标

- **模型侧隔离**：`code`/`plan`/`debug`/`ask`/`explore`/`general` 等 kilo 内置 agent
  的模型，看不到、也不会自主调用本包的 14 个 compose 工作流技能。
- **compose 三件套照常可用**：`compose` / `compose-dev` / `compose-review` 的模型
  仍能看到并调用全部 14 个技能。
- **手动逃生口保留**：用户在任何 agent 下手敲 `/compose-xxx` 仍能强制加载（这是
  kilo 当前实现的既定行为，且符合"软隔离 + 逃生口"的产品意图，不视为缺陷）。
- **命名空间可扩展**：确立 `compose-` 前缀约定，为未来其它"agent 绑定技能工作流"
  （如 `research-xxx`）提供模板。
- **vendor 升级低成本**：obra/superpowers 升级时，前缀重新施加是一条确定性脚本命令。

### 非目标

- ❌ **用户侧 UI 隔离**：不追求让 `/` 斜杠菜单和 Skills 对话框在其它 agent 下隐藏
  这些技能——那需要改 kilo 核心（让 `command.list()` / Skills 弹窗接
  `Skill.available(agent)`），超出插件范围。
- ❌ **fork kilo**：所有改动在插件端（包内 skills/agents/bin + 维护者脚本）完成。
- ❌ **改变技能内容**：除 `name` 字段与技能间交叉引用外，obra 技能正文不动。

---

## 2. 背景：已核实的 kilo 机制（源码证据）

以下事实已通过 `Kilo-Org/kilocode` main（v7.4.5）源码核实，是本设计的地基：

1. **权限求值 = `findLast`（最后一条匹配规则赢）**；`Permission.merge` 是顺序数组拼接。
   （`packages/core/src/permission.ts`）

2. **内置 agent** 把全局 `permission`（来自 `kilo.jsonc`）合并到规则集**靠末尾**；
   **自定义 agent**（我们的 `.md` frontmatter）把自己的 `permission` 合并到**最末尾**。
   因此：全局 deny 对内置 agent 生效；自定义 agent 的 frontmatter allow 赢过全局 deny。
   （`packages/opencode/src/agent/agent.ts`）

3. **技能可见性与可调用性共用同一权限检查**：`Skill.available(agent)` 与 skill 工具的
   `ctx.ask` 都调用 `Permission.evaluate("skill", skill.name, agent.permission)`。deny
   既把技能从 `<available_skills>` 列表剔除，也阻止模型调用。
   （`packages/opencode/src/skill/index.ts`、`tool/skill.ts`）

4. **`disabled()` 整块隐藏判定**：仅当 skill 的最后匹配规则是 `pattern:"*" + deny` 时，
   整个 `<available_skills>` 区块才不输出。用 `compose-*` glob（pattern 非 `*`）时，
   区块仍输出，只是被命中的技能被逐条过滤——内置 agent 仍能看到它**自己其它的**技能。
   （`packages/core/src/permission.ts` `disabled()`）

5. **技能按 frontmatter `name` 做身份**（map key、权限匹配、斜杠命令名），目录名不影响
   身份。同名技能 `add()` 后扫无条件覆盖先扫（仅 warn）。
   （`packages/opencode/src/skill/index.ts`）

6. **默认 `*: allow` 且无显式 skill 规则**：不主动 deny 的话，所有 agent 默认能看全部
   技能。必须显式写全局 `skill` deny。

7. **用户侧斜杠菜单 / Skills 对话框不过权限**：来自 `skill.all()` / `command.list()`，
   不经过 `Permission.evaluate("skill", ...)`。→ 用户手动 `/compose-xxx` 在任何 agent
   下都能加载。这是"手动逃生口"的技术根源。

8. **冒号与连字符在 kilo 全链路都可行**；但 kilo 给所有技能命令强加 `:skill` 后缀
   （`slashDisplay` → `/name:skill`），冒号命名会产生 `/compose:xxx:skill` 双冒号显示。
   故选**连字符 `compose-`**（显示干净、与 kilo 内置命令约定一致、避开与 `:skill`/`:mcp`
   消歧机制的同符号歧义）。

---

## 3. 隔离设计

### 3.1 权限配置形态

**全局（`~/.config/kilo/kilo.jsonc`，由安装器幂等写入）：**

```jsonc
{
  "permission": {
    "skill": { "compose-*": "deny" }
  }
}
```

**我们三个 agent 的 frontmatter（烘焙进 shipped `agents/*.md`）：**

```yaml
permission:
  skill:
    compose-*: allow
```

### 3.2 各方行为（推演，已用源码机制校验）

| Agent | skill 权限规则集（从前到后） | `compose-*` 最后匹配 | 结果 |
|---|---|---|---|
| 内置（code/plan/debug/ask/explore/general） | `…, 全局(compose-*:deny)` | deny | 模型看不到、调不动；其它技能仍可见 |
| compose / compose-dev / compose-review | `defaults, 全局(deny), frontmatter(compose-*:allow)` | allow | 14 个技能全部可见可调 |
| 用户手动 `/compose-xxx`（任意 agent） | 不经过权限（斜杠走内容注入） | —— | 任何 agent 下均可强制加载 |

### 3.3 为何用 glob `compose-*` 而非枚举 14 名

- obra 未来新增第 15 个技能 → 自动落入 glob 覆盖，**权限零改动**。
- 只 deny `compose-*`，不误伤用户其它技能（PDF/docx/自定义/MCP 技能等）在内置
  agent 下仍可用。
- 避免 blanket `"skill": "deny"`（会让 `disabled()` 整块隐藏，连用户其它技能一起没）。

---

## 4. 前缀设计

### 4.1 命名规则

- 14 个技能的 frontmatter `name`：`<原名>` → `compose-<原名>`。
  例：`brainstorming` → `compose-brainstorming`；`using-superpowers` →
  `compose-using-superpowers`。
- **目录名保持 verbatim**（`skills/brainstorming/`），只改 frontmatter `name`。
  理由：目录名不影响 kilo 技能身份（身份是 `name`）；保留 obra 目录布局便于 vendor diff；
  技能内 `references/`、`scripts/` 等相对路径加载不受影响（按 SKILL.md location 解析）。
- **交叉引用同步前缀化**：所有 SKILL.md 正文 + 3 个 agent 提示词里，对每个技能裸名
  的整词引用改为 `compose-<原名>`（约 37 处文件级提及）。

### 4.2 前缀化的 14 个名字（完整清单）

```
compose-using-superpowers
compose-brainstorming
compose-test-driven-development
compose-systematic-debugging
compose-verification-before-completion
compose-writing-plans
compose-executing-plans
compose-subagent-driven-development
compose-requesting-code-review
compose-receiving-code-review
compose-using-git-worktrees
compose-finishing-a-development-branch
compose-dispatching-parallel-agents
compose-writing-skills
```

### 4.3 不特殊处理 `using-superpowers`

它是 compose 工作流的强制首技能，但机制上与其它技能无异——统一前缀化为
`compose-using-superpowers`，受同一 glob 管控。`compose.md` 的 bootstrap 行同步更新
引用名。

---

## 5. 维护者脚本（不进 npm 包）

`script/` 不在 `package.json` 的 `files` 白名单内（白名单 = `bin/skills/agents/plugin/NOTICE`），
故这两个脚本是维护者工具，不增加用户负担，不破坏零依赖 ESM 发布约束。

### 5.1 `script/prefix-skills.mjs`

**职责**：对 `skills/` 与 `agents/*.md` 幂等地施加 `compose-` 前缀。

**契约**：
1. 扫描 `skills/*/SKILL.md`，从 frontmatter 读出每个技能的当前 `name`。
2. 对每个**未带 `compose-` 前缀**的 name：写回 `name: compose-<原名>`。
3. 收集全部"原始裸名"（= 当前 name 去掉 `compose-` 前缀后的集合）。
4. 在每个 SKILL.md 正文 + 每个 `agents/*.md` 中，对每个裸名做**带负向断言的整词替换**：
   `(?<!compose-)\b<裸名>\b` → `compose-<裸名>`。
   - 负向断言保证幂等：已前缀化的不再叠加 `compose-compose-`。
   - 整词边界避免误伤子串。
5. **数据驱动**：裸名集合从磁盘发现，不硬编码 14 个名字——obra 新增技能自动覆盖。
6. 退出码 0；打印改动摘要（多少个 name 字段、多少处引用被改）。

**幂等性要求**：连续运行两次，第二次必须零改动。

**边角**：obra 技能名为独特的连字符复合词（`test-driven-development` 等），与正文英文
单词撞名概率近乎零；负向断言 + 整词边界进一步兜底。

### 5.2 `script/vendor.mjs`

**职责**：从 obra/superpowers 指定 tag 重新 vendor `skills/`（覆盖回 verbatim 原样）。

**契约**：
1. 参数：obra tag（如 `v6.2.0`）。
2. 从 `https://github.com/obra/superpowers` 拉 `skills/` 目录（用 `node:https` 取 tarball
   或 raw，零依赖；或文档化手动 `git sparse-checkout` 流程作为兜底）。
3. 覆盖本地 `skills/`（先清空旧内容，再写入新内容，保留目录结构）。
4. **不**施加前缀——vendor 只还原 verbatim；前缀由 `prefix-skills.mjs` 单独负责
  （职责分离，便于审 diff）。
5. 打印拉取的 tag、commit、技能数量。

> vendor 与 prefix 分两步、两个脚本，是为了让 maintainer 能在 vendor 后、prefix 前
> 审一次干净的 obra diff。

---

## 6. 安装器改动（`bin/lib.js`）

### 6.1 新增：全局 permission 块的幂等写入

`runInstall` 在现有"追加 skills.paths"步骤之后，新增一步：

- 读 `config.permission`（不存在则建 `{}`）。
- 读 `config.permission.skill`：
  - 不存在 → 建 `{}`。
  - 为**标量字符串**（如 `"ask"`）→ 升级为对象 `{"*": "<原值>"}`（`*` 匹配全部，
    语义等价；保留用户原意图）。
  - 已为对象 → 原样使用。
- 若 `config.permission.skill["compose-*"]` 已存在且为 `"deny"`：跳过（幂等）。
- 否则：置 `config.permission.skill["compose-*"] = "deny"`，写回 `kilo.jsonc`。
  **键顺序**：`compose-*` 必须在 `"*"` 之后（依赖 `findLast` 让 deny 赢过用户原
  `*` 规则）；实现时用"删后重插末尾"而非原地改值，保证顺序。
- **不动用户已有的其它 skill 规则**（只增不减，只改 `compose-*` 这一个键，且置于末尾）。

### 6.2 manifest 记录

清单（`.kilo-superpowers-compose.json`）新增字段：

```jsonc
{
  "permissionKey": "compose-*",          // 我们写入的 skill 规则键
  "skillPrefix": "compose-",             // 前缀（卸载/迁移用）
  "skillsLink": "<...>/compose",         // junction 新名（见 6.3）
  ...既有字段
}
```

### 6.3 junction 改名 `superpowers` → `compose`

- `resolvePaths` 中 `skillLink = path.join(skillsDir, 'compose')`。
- **迁移清理**：install/update 时，若发现旧 junction `~/.kilo/skills/superpowers`
  存在（老版本残留），主动 `safeRemove` 删除（它是指向旧 verbatim skills 的链接，
  换成新 prefixed 源后已无意义）。用 `safeRemove`（对 symlink 只删链接本身，安全）。
- manifest 的 `skillsLink` 记录新名，卸载按记录清理。

### 6.4 卸载精确移除 permission 块

`runUninstall` 在现有"移除 skills.paths 条目"步骤旁，新增：

- 从 `config.permission.skill` 删除键 `"compose-*"`（仅这一个键，不动用户其它 skill
  规则）。
- 若删除后 `config.permission.skill` 变空对象：删除整个 `skill` 键。
- 若删除后 `config.permission` 变空对象：删除整个 `permission` 键。
- 写回。

> 关键：卸载**绝不**清空用户整个 `permission` 或 `permission.skill`，只精确移除我们
> 写入的 `compose-*` 键。这是"未触碰用户自有配置"原则的延伸。

### 6.5 移除 `KILO_SUPERPOWERS_PREFIX` 死桩

- `readEnv` 删除 `USE_PREFIX` 字段。
- 前缀现在是内生的（始终 `compose-`），该环境变量已无意义（YAGNI 移除）。

### 6.6 既有保证不变

- 备份 `kilo.jsonc` → 解析失败恢复 → 退出码 2（EXIT.PARSE_ERROR）。
- skills.paths 幂等。
- agent `.md` 覆盖（新版带 `permission.skill: {compose-*: allow}` frontmatter）。
- 清单法归属判定。

---

## 7. Agent frontmatter 改动（`agents/*.md`）

三个文件 frontmatter 各新增：

```yaml
permission:
  skill:
    compose-*: allow
```

正文里所有技能裸名引用改为 `compose-` 前缀（如 `compose.md` 的 bootstrap 行
`invoke the compose-using-superpowers skill`；`compose-dev.md` 的 Mandatory skill load
order 四项；`compose-review.md` 的 skill load order 两项）。

---

## 8. 升级与迁移

### 8.1 终端用户更新（x.y.z → x.y.z+1）

```
npm update -g kilo-superpowers-compose
kilo-superpowers-compose update        # → runInstall()，幂等
```

installer 依次：迁移清理旧 `superpowers` junction → 创建新 `compose` junction（指向
prefixed skills/）→ 覆盖 agents（带 allow frontmatter）→ 确保 `compose-*:deny` 块存在
→ 刷新 manifest。

**老用户（≤ v0.1.5）无感迁移**：
- 旧 junction 一换，老裸名技能从 kilo 注册表自然消失（源已无裸名 SKILL.md），新
  `compose-*` 出现，无孤儿。
- v0.1.5 从未写过 permission 条目，无旧条目要清理。
- 无需专门迁移代码——幂等 install 自动完成。

### 8.2 维护者 vendor 升级（obra v6.1.1 → vN.N.N）

```
1. node script/vendor.mjs v6.2.0        # 还原 verbatim skills/
2. （审一次干净的 obra diff）
3. node script/prefix-skills.mjs        # 重新施加 compose- 前缀（幂等）
4. node --test                          # 验证
5. 更新 NOTICE 的 tag/commit；更新 DESIGN.md §10 Q3 的 pin
6. 审 prefixed diff，提交，发布
```

obra 新增技能时：prefix 脚本自动前缀化其 name + 引用；glob `compose-*` 自动覆盖其权限；
**唯一需要人手的是"要不要把它接进 compose 提示词工作流"这种内容决策**。

---

## 9. 文档修订

### 9.1 `NOTICE`

将 "**verbatim, unmodified copy**" 改为"**派生自 obra/superpowers v6.1.1**：
技能 `name` 字段命名空间化为 `compose-`，技能间交叉引用同步更新，以实现 compose
工作流的模型侧隔离；其余内容（正文、references、scripts、版权署名头）不变。MIT
许可下的修改与署名保留"。

新增 vendor + prefix 升级流程（§5、§8.2）。

### 9.2 `docs/DESIGN.md`

- **§6**：junction 名 `superpowers` → `compose`；补迁移清理说明。
- **§10 Q1（命名碰撞）**：状态从 ❓ 改为 ✅ 已解决——`compose-` 前缀彻底消除与用户
  同名技能的碰撞（发现层 + 权限层）。
- **§10 Q3（pin obra 版本）**：修订"verbatim vendored"为"derived/namespaced vendored"；
  补 prefix 脚本流程。
- **新增 §13（隔离机制）**：本规格 §2–§3 的摘要 + "模型侧隔离、用户侧逃生口"的明确
  声明 + glob `compose-*` 的理由。

### 9.3 `AGENTS.md`

修订"硬性约束"中"技能原样内嵌自 obra/superpowers"一条：改为"技能**派生**自
obra/superpowers v6.1.1，`name` 字段与交叉引用经 `compose-` 命名空间化以实现隔离；
正文与署名保留；重新 vendor 须跑 `script/prefix-skills.mjs`"。其余硬约束不变。

---

## 10. 测试矩阵（`node --test`，零依赖）

### 10.1 `script/prefix-skills.mjs` 测试

- `name` 字段前缀化：未前缀 → `compose-`；已前缀 → 不变。
- 交叉引用整词替换：正文里裸名 → `compose-`；已前缀 → 不叠加。
- **幂等**：连跑两次，第二次 diff 为空。
- 数据驱动：在一个临时 skills 目录放一个虚构新技能，脚本自动前缀化它。
- 不误伤子串：`brainstorm` 不被 `brainstorming` 规则误改（整词边界）。

### 10.2 安装器测试（扩展现有 `test/`）

- **permission 幂等写入**：空 config → 写入 `compose-*:deny`；已有该键 → 跳过；
  用户已有其它 skill 规则（如 `"pdf": "allow"`）→ 保留不动。
- **标量 skill 升级**：`"skill": "ask"` → 升级为 `{"compose-*":"deny"}` 且保留原 ask
  语义（注：标量→对象升级时原标量如何保留需在实现时定——倾向升级为
  `{"*":"ask","compose-*":"deny"}`）。
- **卸载精确移除**：只删 `compose-*` 键，保留用户其它 skill 规则；删后空对象 → 清键。
- **junction 迁移**：模拟旧 `superpowers` junction 存在 → install 后被删，新 `compose`
  junction 创建。
- **manifest 字段**：含 `permissionKey`、`skillPrefix`、新 `skillsLink`。

### 10.3 回归

- 既有安装/卸载/更新测试全部通过。
- `npm pack` 产物不含 `script/`。

---

## 11. 风险登记

| 风险 | 可能性 | 影响 | 缓解 |
|---|---|---|---|
| kilo 未来版本改权限优先级（`findLast`→first-match） | 低 | 隔离失效（compose 也被 deny，或内置 agent 反而能看） | 在 README 记录依赖的 kilo 版本行为；`verification-before-completion` 时实测一次 |
| 用户在项目级 `.kilo/kilo.json` 覆盖了 permission | 低 | 项目级优先级更高，可能盖过全局 deny | 文档说明；不影响 compose 三件套（它们靠 frontmatter allow，仍合并到最后） |
| obra 新技能名与某英文正文词撞名，prefix 脚本过度替换 | 极低 | 正文出现 `compose-<word>` | 整词边界 + 负向断言；技能名为独特连字符复合词；测试覆盖 |
| 用户侧 `/compose-xxx` 在其它 agent 仍可加载 | 确定（设计如此） | 无（逃生口，符合预期） | 文档明确声明，非缺陷 |
| 标量 `skill` 升级丢失用户原语义 | 中 | 用户原全局 skill 规则失效 | 实现时升级为对象并保留原标量为 `"*"` 键；测试覆盖 |

---

## 12. 实现顺序提示（供 writing-plans 参考）

建议任务切分（每项 2–5 分钟，TDD）：

1. `script/prefix-skills.mjs` + 测试（先做，因为后续改 skills/agents 依赖它的契约）。
2. 对仓库 `skills/` 与 `agents/` 跑一次 prefix 脚本，落地 14 个 name + 引用（一次性
   机械化产出，审 diff）。
3. `bin/lib.js`：permission 块幂等写入 + 测试。
4. `bin/lib.js`：junction 改名 + 迁移清理 + 测试。
5. `bin/lib.js`：卸载精确移除 + manifest 字段 + 测试。
6. `bin/lib.js`：移除 `USE_PREFIX` 死桩。
7. `script/vendor.mjs`（维护者工具，轻测试或手册式验证）。
8. 文档：NOTICE / DESIGN.md / AGENTS.md 修订。
9. `verification-before-completion`：隔离 `KILO_HOME` 实测（内置 agent 看不到、compose
   可用、手动 `/compose-xxx` 可加载）。

---

## 附录 A：为何不 fork kilo / 不做用户侧隔离

用户侧隔离（斜杠菜单 + Skills 对话框按 agent 过滤）需要 kilo 核心在 `command.list()`
与 Skills 弹窗接 `Skill.available(agent)`。这是 kilo 上游可接受的、有原则的小改动
（约 2 处调用点），但属于 fork/PR 范畴，不在本插件范围。本设计把"模型侧隔离"做到
插件可达的极限，用户侧保留手动逃生口，整体行为可预测、可文档化。

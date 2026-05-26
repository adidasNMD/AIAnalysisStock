# OpenClaw V4 系统升级计划 — P0+P1 核心体验 + 分析质量

## TL;DR
> **Summary**: 基于深度系统分析报告，将 12 项改进（P0 核心体验缺失 6 项 + P1 分析质量提升 6 项）转化为可执行任务，分 5 个并行波次推进。
> **Deliverables**: 前端图表能力、Watchlist CRUD、持仓追踪、通知中心、API 安全、报告结构化升级、数据层可靠性、移动端适配
> **Effort**: XL
> **Parallel**: YES - 5 waves
> **Critical Path**: Task 1 (Auth+限流) → Task 2 (Zustand) → Tasks 3-7 (前端功能) → Tasks 12-14 (移动端+CSS)

## Context

### Original Request
结合交易画像深度分析系统后，用户确认将 P0（6项）+ P1（6项）共 12 项改进全部转化为执行计划。

### Interview Summary
- 用户是"成长型机会猎手"，核心痛点"发现太晚"
- 系统核心价值已立住（双大脑、四级哨兵、铁血风控），但前端是"报告阅读器"，非"决策助手"
- 数据层缺乏重试/熔断/缓存，MacroEnvironment 是空壳
- 报告提取用正则匹配，容易被 LLM 输出漂移击穿

### Oracle Review (gaps addressed)
- Auth+限流必须作为 Wave 1 前置，保护所有新 API
- 引入 Zustand 作为基础设施，为前端功能页面提供共享状态
- Items 7（结构化输出）和 11（风格后处理器）需共享 JSON schema，避免冲突
- CSS 模块化应先于移动适配
- Lightweight Charts 优于 TradingView widget（个人工具，无许可证问题）
- 需要 SQLite migration 脚本保证向后兼容

## Work Objectives

### Core Objective
将 OpenClaw V4 从"报告阅读器"升级为"交易决策助手"，同时加固数据层可靠性和分析质量。

### Deliverables
1. 前端图表能力（K 线 + SMA 叠加）
2. Watchlist CRUD + 实时价格
3. 持仓追踪页面 + 仓位纪律自动校验
4. 通知中心（历史通知展示）
5. API 鉴权 + 限流
6. 报告结构化输出升级（正则→LLM JSON mode）
7. Yahoo Finance 重试 + 熔断
8. MacroEnvironment 真实数据接入
9. 止损红线完善
10. 报告风格后处理器
11. 移动端适配
12. TrendRadarRaw 去硬编码

### Definition of Done (verifiable conditions with commands)
- `curl -H "Authorization: Bearer wrong" http://localhost:3001/api/watchlist` 返回 401
- `npm run build` 无 TypeScript 错误
- `npm test` 全部通过（含新增测试）
- Watchlist 页面可添加/删除标的并持久化
- 持仓页面输入持仓后显示仓位合规状态
- MissionViewer 页面显示 K 线图表
- 通知中心页面显示历史止损/入场通知
- 手机浏览器可正常使用 Watchlist 和通知中心页面

### Must Have
- 所有新增 API 端点有 Auth 保护
- 所有修改带测试（后端 Vitest，前端至少 smoke test）
- 每个任务独立提交，可回滚
- 保持中文报告输出风格
- 不破坏现有 Pipeline 正常运行

### Must NOT Have (guardrails, AI slop patterns, scope boundaries)
- ❌ 不引入自动交易功能（画像明确"情报系统"）
- ❌ 不修改 vendor 代码（TradingAgents/OpenBB/TrendRadar 的 Python 核心）
- ❌ 不引入 Redux/MobX 等重量级状态管理
- ❌ 不做完整 PWA（Service Worker + Offline）
- ❌ 不做国际化（仅中文）
- ❌ 不添加用户注册/多用户系统（单用户个人工具）
- ❌ 前端不引入 Tailwind CSS（保持现有 CSS 架构，仅模块化拆分）
- ❌ 不做 WebSocket 实时推送（SSE 已够用）

## Verification Strategy
> ZERO HUMAN INTERVENTION - all verification is agent-executed.
- Test decision: tests-after + framework: Vitest (backend) + Vitest with jsdom (frontend smoke)
- QA policy: Every task has agent-executed scenarios
- Evidence: .sisyphus/evidence/task-{N}-{slug}.{ext}

## Execution Strategy

### Parallel Execution Waves

Wave 1 — Foundation (3 tasks parallel):
- Task 1: API Auth + Rate Limiting (quick) — 保护所有端点
- Task 2: Zustand 状态管理基础设施 (quick) — 为后续前端任务提供共享状态
- Task 3: TrendRadarRaw 去硬编码 + 全局 env 审计 (quick) — 消除硬编码

Wave 2 — Backend Data Layer (3 tasks parallel):
- Task 4: Yahoo Finance 重试 + 熔断器 (deep) — 数据可靠性
- Task 5: MacroEnvironment 真实数据接入 (deep) — 宏观环境数据
- Task 6: 通知持久化后端 (deep) — 通知存储到 SQLite

Wave 3 — Frontend Core Pages (4 tasks parallel):
- Task 7: Watchlist CRUD + 实时价格 (visual-engineering) — 可编辑监控池
- Task 8: 持仓追踪页面 (visual-engineering) — 仓位管理 + 纪律校验
- Task 9: 通知中心前端 (visual-engineering) — 历史通知展示
- Task 10: 前端图表能力 (visual-engineering) — K 线 + SMA 叠加

Wave 4 — Analysis Quality (3 tasks parallel):
- Task 11: 报告结构化输出升级 (deep) — 正则→JSON mode
- Task 12: 止损红线完善 (deep) — 20日均线 + 龙头SMA50
- Task 13: 报告风格后处理器 (deep) — 拒绝浮夸/打分/无推导

Wave 5 — Polish (1 task):
- Task 14: CSS 模块化 + 移动端适配 (visual-engineering) — 响应式布局

### Dependency Matrix

| Task | Depends On | Blocks |
|------|-----------|--------|
| 1 (Auth) | — | 7, 8, 9, 10 (新 API 需要 Auth) |
| 2 (Zustand) | — | 7, 8, 9, 10 (前端共享状态) |
| 3 (去硬编码) | — | — |
| 4 (重试熔断) | — | 5 (宏观数据也用 Yahoo) |
| 5 (宏观数据) | 4 | — |
| 6 (通知后端) | 1 | 9 (通知前端需要 API) |
| 7 (Watchlist) | 1, 2 | 14 (移动端适配) |
| 8 (持仓) | 1, 2 | 14 |
| 9 (通知前端) | 1, 2, 6 | 14 |
| 10 (图表) | 2 | — |
| 11 (结构化) | — | 13 (后处理器消费 JSON) |
| 12 (止损) | — | — |
| 13 (后处理器) | 11 | — |
| 14 (移动端) | 7, 8, 9 | — |

### Agent Dispatch Summary

| Wave | Tasks | Categories |
|------|-------|-----------|
| Wave 1 | 3 | quick ×3 |
| Wave 2 | 3 | deep ×3 |
| Wave 3 | 4 | visual-engineering ×4 |
| Wave 4 | 3 | deep ×3 |
| Wave 5 | 1 | visual-engineering ×1 |

## TODOs

<!-- TASKS START - do not remove this marker -->

- [ ] 1. API Auth + Rate Limiting

  **What to do**:
  1. 安装 `express-rate-limit` 依赖
  2. 在 `src/server/app.ts` 添加 Bearer Token Auth 中间件：
     - 从 `process.env.API_AUTH_TOKEN` 读取 token
     - 对所有 `/api/*` 路由（除 `/api/health`）执行校验
     - 未认证返回 `401 Unauthorized`
  3. 添加 rate limiter 中间件：
     - `/api/trigger` 等写操作端点：每分钟最多 5 次
     - `/api/*` 读操作端点：每分钟最多 60 次
  4. 在 `.env.example` 添加 `API_AUTH_TOKEN` 变量说明
  5. 编写 Vitest 测试：验证无 token 返回 401、正确 token 返回 200、超频返回 429

  **Must NOT do**: 不做用户注册/多用户鉴权，仅单 token 验证

  **Recommended Agent Profile**:
  - Category: `quick` — Reason: 单文件修改 + 1 个依赖安装，逻辑简单
  - Skills: [] — 无需额外技能
  - Omitted: [`playwright`] — 纯后端，无需浏览器

  **Parallelization**: Can Parallel: YES | Wave 1 | Blocks: [7, 8, 9, 10] | Blocked By: []

  **References**:
  - Pattern: `src/server/app.ts:1-30` — Express app 初始化和中间件注册位置
  - Pattern: `src/server/app.ts:540-560` — 现有 API 路由注册示例
  - Config: `src/config/constants.ts` — 常量定义位置

  **Acceptance Criteria**:
  - [ ] `curl -H "Authorization: Bearer wrong-token" http://localhost:3001/api/watchlist` 返回 HTTP 401
  - [ ] `curl -H "Authorization: Bearer $API_AUTH_TOKEN" http://localhost:3001/api/watchlist` 返回 HTTP 200
  - [ ] 连续 6 次快速调用 `/api/trigger` 后第 6 次返回 HTTP 429
  - [ ] `/api/health` 无需 token 即可访问
  - [ ] `npm test` 包含 auth 测试且全部通过

  **QA Scenarios**:
  ```
  Scenario: Unauthorized access rejected
    Tool: Bash
    Steps: curl -s -o /dev/null -w "%{http_code}" http://localhost:3001/api/watchlist
    Expected: 401
    Evidence: .sisyphus/evidence/task-1-auth-reject.txt

  Scenario: Authorized access succeeds
    Tool: Bash
    Steps: curl -s -o /dev/null -w "%{http_code}" -H "Authorization: Bearer $API_AUTH_TOKEN" http://localhost:3001/api/watchlist
    Expected: 200
    Evidence: .sisyphus/evidence/task-1-auth-success.txt

  Scenario: Rate limit triggers
    Tool: Bash
    Steps: for i in $(seq 1 6); do curl -s -o /dev/null -w "%{http_code}\n" -H "Authorization: Bearer $API_AUTH_TOKEN" http://localhost:3001/api/trigger -X POST; done
    Expected: First 5 return 200/202, 6th returns 429
    Evidence: .sisyphus/evidence/task-1-ratelimit.txt
  ```

  **Commit**: YES | Message: `feat(server): add API auth + rate limiting` | Files: [src/server/app.ts, src/__tests__/auth.test.ts, package.json, .env.example]

- [ ] 2. Zustand 状态管理基础设施

  **What to do**:
  1. 安装 `zustand` 依赖到 dashboard/
  2. 创建 `dashboard/src/stores/useAppStore.ts`：
     - `authToken: string` — API auth token（从 localStorage 读取）
     - `apiBase: string` — API base URL（从 env 或 window.location 推导）
     - `watchlist: Ticker[]` — 共享 watchlist 数据
     - `notifications: Notification[]` — 通知列表
  3. 创建 `dashboard/src/lib/api-client.ts` — 封装 fetch 带自动 Auth header
  4. 在 `Settings.tsx` 添加 API Token 输入框，保存到 localStorage
  5. 将现有 `api.ts` 中的 fetch 调用逐步迁移到 api-client（本任务仅做基础设施，不改页面逻辑）

  **Must NOT do**: 不重写现有页面逻辑，仅提供 store 和 api-client 基础设施

  **Recommended Agent Profile**:
  - Category: `quick` — Reason: 新增 2-3 个文件 + 小改 Settings
  - Skills: [] — 无需额外技能
  - Omitted: [`playwright`] — 无需浏览器验证

  **Parallelization**: Can Parallel: YES | Wave 1 | Blocks: [7, 8, 9, 10] | Blocked By: []

  **References**:
  - Pattern: `dashboard/src/api.ts:1-30` — 现有 API 调用方式
  - Pattern: `dashboard/src/pages/Settings.tsx` — Settings 页面结构
  - Config: `dashboard/package.json` — 前端依赖管理

  **Acceptance Criteria**:
  - [ ] `dashboard/src/stores/useAppStore.ts` 存在且 TypeScript 类型正确
  - [ ] `dashboard/src/lib/api-client.ts` 存在且自动携带 Auth header
  - [ ] Settings 页面有 API Token 输入框
  - [ ] `npm run build` 无错误（dashboard 目录）

  **QA Scenarios**:
  ```
  Scenario: Zustand store initializes correctly
    Tool: Bash
    Steps: cd dashboard && npm run build
    Expected: Build succeeds with 0 TypeScript errors
    Evidence: .sisyphus/evidence/task-2-build.txt

  Scenario: Store type checking
    Tool: Bash
    Steps: cd dashboard && npx tsc --noEmit
    Expected: 0 errors
    Evidence: .sisyphus/evidence/task-2-typecheck.txt
  ```

  **Commit**: YES | Message: `feat(dashboard): add Zustand store + API client infrastructure` | Files: [dashboard/src/stores/useAppStore.ts, dashboard/src/lib/api-client.ts, dashboard/src/pages/Settings.tsx, dashboard/package.json]

- [ ] 3. TrendRadarRaw 去硬编码 + 全局环境变量审计

  **What to do**:
  1. 在 `dashboard/src/pages/TrendRadarRaw.tsx` 中将 `localhost:3000` 替换为 `import.meta.env.VITE_TRENDRADAR_URL || '/api/trendradar'`
  2. 全局搜索 `localhost` 在 dashboard/src/ 中的所有出现，逐一替换为环境变量
  3. 在 `dashboard/.env.example` 添加所有新增环境变量的说明
  4. 在后端 `src/` 目录同样审计 `localhost` 硬编码（如 `src/server/app.ts` 中的 RSS proxy）

  **Must NOT do**: 不改变功能行为，仅参数化

  **Recommended Agent Profile**:
  - Category: `quick` — Reason: 搜索替换，逻辑简单
  - Skills: [] — 无需额外技能
  - Omitted: [] — 无需额外技能

  **Parallelization**: Can Parallel: YES | Wave 1 | Blocks: [] | Blocked By: []

  **References**:
  - Pattern: `dashboard/src/pages/TrendRadarRaw.tsx` — 硬编码位置
  - Pattern: `dashboard/src/api.ts` — 现有 API base URL 处理方式

  **Acceptance Criteria**:
  - [ ] `grep -rn 'localhost' dashboard/src/` 返回 0 个匹配（.env 文件除外）
  - [ ] `npm run build` 无错误（dashboard 目录）
  - [ ] `.env.example` 包含所有新增环境变量

  **QA Scenarios**:
  ```
  Scenario: No hardcoded localhost in frontend
    Tool: Bash
    Steps: grep -rn 'localhost' dashboard/src/ --include='*.ts' --include='*.tsx' | grep -v node_modules | grep -v '.env'
    Expected: 0 matches
    Evidence: .sisyphus/evidence/task-3-no-hardcode.txt

  Scenario: Build succeeds after changes
    Tool: Bash
    Steps: cd dashboard && npm run build
    Expected: Build succeeds
    Evidence: .sisyphus/evidence/task-3-build.txt
  ```

  **Commit**: YES | Message: `fix(dashboard): replace hardcoded localhost with env variables` | Files: [dashboard/src/pages/TrendRadarRaw.tsx, dashboard/.env.example, + any other files with localhost]

- [ ] 4. Yahoo Finance 重试 + 熔断器

  **What to do**:
  1. 在 `src/utils/` 创建 `circuit-breaker.ts`：
     - 实现简单熔断器：状态 CLOSED/OPEN/HALF_OPEN
     - 配置：failureThreshold=3, resetTimeout=300000 (5min), halfOpenMaxCalls=1
     - 导出 `CircuitBreaker` 类
  2. 在 `src/utils/` 创建 `retry.ts`：
     - 指数退避重试：maxRetries=3, baseDelay=1000, maxDelay=10000
     - 仅对网络错误和 5xx 重试，4xx 不重试
     - 导出 `withRetry<T>(fn: () => Promise<T>, opts?)` 函数
  3. 在 `src/tools/market-data.ts` 的 `getQuote()` 和 `calculateSMA()` 中接入重试+熔断：
     - 调用链：`circuitBreaker.execute(() => withRetry(() => fetchQuote(...)))`
  4. 在 `src/utils/openbb-provider.ts` 的关键数据获取函数中同样接入
  5. 编写 Vitest 测试：熔断器状态转换、重试行为、超时场景

  **Must NOT do**: 不改变现有函数签名，仅在内部包装

  **Recommended Agent Profile**:
  - Category: `deep` — Reason: 需理解数据流 + 设计可靠性模式
  - Skills: [] — 无需额外技能
  - Omitted: [`playwright`] — 纯后端

  **Parallelization**: Can Parallel: YES | Wave 2 | Blocks: [5] | Blocked By: []

  **References**:
  - Pattern: `src/tools/market-data.ts:36-58` — 现有 getQuote 实现（try/catch 返回 null）
  - Pattern: `src/utils/rate-limiter.ts` — 现有速率限制器模式
  - Pattern: `src/utils/openbb-provider.ts:330-340` — MacroEnvironment 占位符
  - API/Type: `src/models/types.ts` — 数据类型定义

  **Acceptance Criteria**:
  - [ ] `src/utils/circuit-breaker.ts` 存在且导出 `CircuitBreaker` 类
  - [ ] `src/utils/retry.ts` 存在且导出 `withRetry` 函数
  - [ ] `getQuote()` 在网络错误时重试 3 次后才返回 null
  - [ ] 连续 3 次失败后熔断器打开，5 分钟内所有调用立即返回 null（不发请求）
  - [ ] `npm test` 包含熔断器和重试测试且全部通过

  **QA Scenarios**:
  ```
  Scenario: Retry on transient failure
    Tool: Bash
    Steps: npm test -- --grep "retries on network error"
    Expected: Test passes, shows 3 retry attempts
    Evidence: .sisyphus/evidence/task-4-retry.txt

  Scenario: Circuit breaker opens after threshold
    Tool: Bash
    Steps: npm test -- --grep "circuit breaker opens"
    Expected: After 3 failures, subsequent calls fail fast without network request
    Evidence: .sisyphus/evidence/task-4-breaker.txt
  ```

  **Commit**: YES | Message: `feat(utils): add retry + circuit breaker for data sources` | Files: [src/utils/circuit-breaker.ts, src/utils/retry.ts, src/tools/market-data.ts, src/__tests__/circuit-breaker.test.ts, src/__tests__/retry.test.ts]

- [ ] 5. MacroEnvironment 真实数据接入

  **What to do**:
  1. 在 `src/utils/openbb-provider.ts` 的 `fetchMacroEnvironment()` 中：
     - 使用 Yahoo Finance 获取 VIX (`^VIX`)、DXY (`DX-Y.NYB`)、US10Y (`^TNX`)、SP500 (`^GSPC`)
     - 使用 Task 4 的重试+熔断包装
     - 返回实际数据而非 null
  2. 定义缓存策略：宏观数据 TTL = 15 分钟（盘中）/ 60 分钟（盘后）
  3. 在 `src/config/constants.ts` 添加宏观数据 ticker 符号常量
  4. 确保 `dispatchMission` 中 `fetchMacroEnvironment()` 的调用正确消费返回值
  5. 编写 Vitest 测试：mock Yahoo Finance 返回宏观数据

  **Must NOT do**: 不引入新的付费数据源

  **Recommended Agent Profile**:
  - Category: `deep` — Reason: 需理解数据流 + 缓存设计
  - Skills: [] — 无需额外技能
  - Omitted: [`playwright`] — 纯后端

  **Parallelization**: Can Parallel: NO | Wave 2 | Blocks: [] | Blocked By: [4]

  **References**:
  - Pattern: `src/utils/openbb-provider.ts:330-340` — 现有占位符
  - Pattern: `src/utils/openbb-provider.ts:53-59` — MacroEnvironment 接口定义
  - Pattern: `src/tools/market-data.ts` — Yahoo Finance 调用方式
  - Pattern: `src/workflows/dispatch-engine.ts:262-264` — macro data 在 pipeline 中的使用

  **Acceptance Criteria**:
  - [ ] `fetchMacroEnvironment()` 返回非 null 的 VIX/DXY/US10Y/SP500 值
  - [ ] 15 分钟内重复调用不发新请求（缓存命中）
  - [ ] Yahoo Finance 失败时返回上次缓存值（而非 null）
  - [ ] `npm test` 包含宏观数据测试且全部通过

  **QA Scenarios**:
  ```
  Scenario: Macro data returns real values
    Tool: Bash
    Steps: npm test -- --grep "fetchMacroEnvironment returns"
    Expected: VIX, DXY, US10Y, SP500 fields are non-null numbers
    Evidence: .sisyphus/evidence/task-5-macro.txt

  Scenario: Cache hit within TTL
    Tool: Bash
    Steps: npm test -- --grep "macro cache"
    Expected: Second call within 15min returns cached data without network request
    Evidence: .sisyphus/evidence/task-5-cache.txt
  ```

  **Commit**: YES | Message: `feat(data): wire MacroEnvironment to Yahoo Finance with caching` | Files: [src/utils/openbb-provider.ts, src/config/constants.ts, src/__tests__/macro-environment.test.ts]

- [ ] 6. 通知持久化后端

  **What to do**:
  1. 在 `src/models/types.ts` 添加 `NotificationRecord` Zod schema：
     - `id: string`, `type: 'stop_loss' | 'entry_signal' | 'info'`, `ticker: string`, `message: string`, `createdAt: string`, `read: boolean`
  2. 在 SQLite (`openclaw.db`) 创建 `notifications` 表（migration 脚本）
  3. 修改 `src/utils/telegram.ts`：在 `sendStopLossAlert` 和 `sendEntrySignal` 中同步写入 notifications 表
  4. 在 `src/server/app.ts` 添加 API 端点：
     - `GET /api/notifications` — 分页查询通知（最新在前）
     - `PATCH /api/notifications/:id/read` — 标记已读
     - `GET /api/notifications/unread-count` — 未读计数
  5. 编写 Vitest 测试

  **Must NOT do**: 不改变 Telegram 推送逻辑，仅新增 SQLite 持久化

  **Recommended Agent Profile**:
  - Category: `deep` — Reason: 涉及 DB migration + 多文件修改
  - Skills: [] — 无需额外技能
  - Omitted: [`playwright`] — 纯后端

  **Parallelization**: Can Parallel: YES | Wave 2 | Blocks: [9] | Blocked By: [1]

  **References**:
  - Pattern: `src/utils/telegram.ts:86-98` — sendStopLossAlert 实现
  - Pattern: `src/utils/telegram.ts:106+` — sendEntrySignal 实现
  - Pattern: `src/server/app.ts:40-53` — 现有 API 端点注册方式
  - Pattern: `src/utils/task-queue.ts` — SQLite 使用模式（WAL、migration）
  - API/Type: `src/models/types.ts` — Zod schema 定义位置

  **Acceptance Criteria**:
  - [ ] `notifications` 表在 SQLite 中存在
  - [ ] `sendStopLossAlert` 调用后 notifications 表新增一条记录
  - [ ] `GET /api/notifications` 返回分页通知列表
  - [ ] `PATCH /api/notifications/:id/read` 标记通知已读
  - [ ] `npm test` 包含通知 API 测试且全部通过

  **QA Scenarios**:
  ```
  Scenario: Notification persisted on alert
    Tool: Bash
    Steps: npm test -- --grep "notification persisted"
    Expected: After sendStopLossAlert, DB has 1 new notification record
    Evidence: .sisyphus/evidence/task-6-persist.txt

  Scenario: API returns paginated notifications
    Tool: Bash
    Steps: curl -H "Authorization: Bearer $API_AUTH_TOKEN" http://localhost:3001/api/notifications?page=1&limit=10
    Expected: JSON array with notification objects
    Evidence: .sisyphus/evidence/task-6-api.txt
  ```

  **Commit**: YES | Message: `feat(notifications): add SQLite persistence + REST API` | Files: [src/models/types.ts, src/utils/telegram.ts, src/server/app.ts, src/__tests__/notifications.test.ts]

- [ ] 7. Watchlist CRUD + 实时价格

  **What to do**:
  1. 在 `src/server/app.ts` 添加 API 端点：
     - `POST /api/watchlist/tickers` — 添加标的 `{ ticker, sector?, events? }`
     - `DELETE /api/watchlist/tickers/:ticker` — 删除标的
     - `PUT /api/watchlist/tickers/:ticker` — 编辑标的配置
     - `GET /api/watchlist/prices` — 批量获取 watchlist 所有标的实时价格（使用 Yahoo Finance）
  2. 后端修改 `data/watchlist.json` 读写：使用文件锁或 SQLite 替代纯 JSON 写入
  3. 前端重写 `dashboard/src/pages/Watchlist.tsx`：
     - 使用 Zustand store 管理 watchlist 数据
     - 添加"添加标的"表单（ticker + 行业选择）
     - 每行显示：标的名、行业、实时价格、日涨跌幅、操作按钮（编辑/删除）
     - 价格每 30 秒自动刷新
     - 添加确认删除对话框
  4. 将新增 CSS 样式放在独立文件 `dashboard/src/pages/Watchlist.css`（开始 CSS 模块化）

  **Must NOT do**: 不做港股适配（P2 范围），不做 WebSocket 实时推送

  **Recommended Agent Profile**:
  - Category: `visual-engineering` — Reason: 前端 CRUD 页面 + UI 交互
  - Skills: [] — 无需额外技能
  - Omitted: [`playwright`] — 可用 build 验证

  **Parallelization**: Can Parallel: YES | Wave 3 | Blocks: [14] | Blocked By: [1, 2]

  **References**:
  - Pattern: `dashboard/src/pages/Watchlist.tsx` — 现有只读 Watchlist 页面
  - Pattern: `src/server/app.ts` — 现有 watchlist GET 端点
  - Pattern: `data/watchlist.json` — 当前数据结构
  - Pattern: `dashboard/src/stores/useAppStore.ts` — Zustand store（Task 2 创建）
  - Pattern: `dashboard/src/lib/api-client.ts` — API client（Task 2 创建）

  **Acceptance Criteria**:
  - [ ] Watchlist 页面显示所有标的及实时价格
  - [ ] 可添加新标的并立即显示在列表中
  - [ ] 可删除标的（有确认对话框）
  - [ ] 价格每 30 秒自动刷新
  - [ ] `data/watchlist.json` 在添加/删除后正确更新
  - [ ] `npm run build` 无错误

  **QA Scenarios**:
  ```
  Scenario: Add ticker via API
    Tool: Bash
    Steps: curl -X POST -H "Authorization: Bearer $API_AUTH_TOKEN" -H "Content-Type: application/json" -d '{"ticker":"AAPL","sector":"Tech"}' http://localhost:3001/api/watchlist/tickers
    Expected: 201 Created, ticker appears in GET /api/watchlist
    Evidence: .sisyphus/evidence/task-7-add.txt

  Scenario: Delete ticker via API
    Tool: Bash
    Steps: curl -X DELETE -H "Authorization: Bearer $API_AUTH_TOKEN" http://localhost:3001/api/watchlist/tickers/AAPL
    Expected: 200 OK, ticker removed from GET /api/watchlist
    Evidence: .sisyphus/evidence/task-7-delete.txt

  Scenario: Prices endpoint returns data
    Tool: Bash
    Steps: curl -H "Authorization: Bearer $API_AUTH_TOKEN" http://localhost:3001/api/watchlist/prices
    Expected: JSON with price data for each ticker
    Evidence: .sisyphus/evidence/task-7-prices.txt
  ```

  **Commit**: YES | Message: `feat(watchlist): add CRUD operations + live prices` | Files: [src/server/app.ts, dashboard/src/pages/Watchlist.tsx, dashboard/src/pages/Watchlist.css, data/watchlist.json]

- [ ] 8. 持仓追踪页面

  **What to do**:
  1. 在 `src/models/types.ts` 添加 `Position` Zod schema：
     - `ticker: string`, `shares: number`, `avgCost: number`, `entryDate: string`, `notes?: string`
  2. 在 SQLite 创建 `positions` 表
  3. 在 `src/server/app.ts` 添加 API 端点：
     - `GET /api/positions` — 获取所有持仓
     - `POST /api/positions` — 添加持仓
     - `PUT /api/positions/:ticker` — 更新持仓
     - `DELETE /api/positions/:ticker` — 清仓
     - `GET /api/positions/discipline` — 仓位纪律检查（返回每个持仓占比 + 合规状态）
  4. 前端创建 `dashboard/src/pages/Portfolio.tsx`：
     - 持仓列表：标的、股数、成本、现价（从 Yahoo Finance）、盈亏、占比
     - 添加/编辑/清仓表单
     - 仓位纪律面板：
       - 每个持仓占比条形图（超过 20% 标红）
       - 总持仓数量提示（<5 或 >7 时警告）
       - 总仓位使用率
  5. 在 `dashboard/src/App.tsx` 添加 Portfolio 路由
  6. CSS 放在 `dashboard/src/pages/Portfolio.css`

  **Must NOT do**: 不做自动交易、不接入券商 API、不做实时 P&L 推送

  **Recommended Agent Profile**:
  - Category: `visual-engineering` — Reason: 新页面 + 数据可视化
  - Skills: [] — 无需额外技能
  - Omitted: [`playwright`] — build 验证

  **Parallelization**: Can Parallel: YES | Wave 3 | Blocks: [14] | Blocked By: [1, 2]

  **References**:
  - Pattern: `src/server/app.ts` — API 端点注册方式
  - Pattern: `src/utils/task-queue.ts` — SQLite migration 模式
  - Pattern: `dashboard/src/pages/Watchlist.tsx` — 页面组件结构参考
  - Pattern: `dashboard/src/App.tsx` — 路由注册
  - Config: `investor_profile.md` — 仓位纪律规则（单标的≤20%，5-7只持仓）

  **Acceptance Criteria**:
  - [ ] `positions` 表在 SQLite 中存在
  - [ ] `GET /api/positions/discipline` 返回每个持仓的占比和合规状态
  - [ ] 持仓超过 20% 时 discipline API 返回违规标记
  - [ ] Portfolio 页面可添加/编辑/删除持仓
  - [ ] `/portfolio` 路由可访问
  - [ ] `npm run build` 无错误

  **QA Scenarios**:
  ```
  Scenario: Position discipline check
    Tool: Bash
    Steps: |
      # Add position via API
      curl -X POST -H "Authorization: Bearer $API_AUTH_TOKEN" -H "Content-Type: application/json" -d '{"ticker":"NVDA","shares":100,"avgCost":120}' http://localhost:3001/api/positions
      # Check discipline
      curl -H "Authorization: Bearer $API_AUTH_TOKEN" http://localhost:3001/api/positions/discipline
    Expected: JSON showing position percentage and compliance status
    Evidence: .sisyphus/evidence/task-8-discipline.txt

  Scenario: Over-concentration warning
    Tool: Bash
    Steps: Add single position worth >20% of total, check discipline endpoint
    Expected: Position flagged as non-compliant (>20%)
    Evidence: .sisyphus/evidence/task-8-overconcentration.txt
  ```

  **Commit**: YES | Message: `feat(portfolio): add position tracking + discipline checks` | Files: [src/models/types.ts, src/server/app.ts, dashboard/src/pages/Portfolio.tsx, dashboard/src/pages/Portfolio.css, dashboard/src/App.tsx]

- [ ] 9. 通知中心前端

  **What to do**:
  1. 创建 `dashboard/src/pages/NotificationCenter.tsx`：
     - 通知列表：类型图标（🔴止损/🟠入场/🟡信息）、标的、消息摘要、时间、已读状态
     - 未读通知有视觉高亮
     - 点击通知标记已读
     - 未读数量 badge 显示在侧边栏导航上
     - 支持按类型筛选
     - 分页加载（每页 20 条）
  2. 在 `dashboard/src/App.tsx` 添加 `/notifications` 路由
  3. 修改 `dashboard/src/components/Layout.tsx`：
     - 在"通知中心"导航项旁显示未读数量 badge
     - 使用 Zustand store 中的 unreadCount
  4. CSS 放在 `dashboard/src/pages/NotificationCenter.css`

  **Must NOT do**: 不做 Web Push Notification、不做实时 WebSocket 推送

  **Recommended Agent Profile**:
  - Category: `visual-engineering` — Reason: 新页面 + 交互设计
  - Skills: [] — 无需额外技能
  - Omitted: [`playwright`] — build 验证

  **Parallelization**: Can Parallel: YES | Wave 3 | Blocks: [14] | Blocked By: [1, 2, 6]

  **References**:
  - Pattern: `dashboard/src/pages/MissionTimeline.tsx` — 列表页面结构参考
  - Pattern: `dashboard/src/components/Layout.tsx` — 侧边栏导航
  - Pattern: `dashboard/src/stores/useAppStore.ts` — Zustand store（Task 2）
  - API: `GET /api/notifications` — 通知 API（Task 6 创建）

  **Acceptance Criteria**:
  - [ ] `/notifications` 路由可访问
  - [ ] 通知列表按时间倒序显示
  - [ ] 点击通知后标记已读（调用 PATCH API）
  - [ ] 侧边栏显示未读数量 badge
  - [ ] 可按类型筛选（止损/入场/信息）
  - [ ] `npm run build` 无错误

  **QA Scenarios**:
  ```
  Scenario: Notification list renders
    Tool: Bash
    Steps: cd dashboard && npm run build
    Expected: Build succeeds, NotificationCenter component compiled
    Evidence: .sisyphus/evidence/task-9-build.txt

  Scenario: Mark as read API call
    Tool: Bash
    Steps: curl -X PATCH -H "Authorization: Bearer $API_AUTH_TOKEN" http://localhost:3001/api/notifications/test-id/read
    Expected: 200 OK
    Evidence: .sisyphus/evidence/task-9-markread.txt
  ```

  **Commit**: YES | Message: `feat(dashboard): add notification center page` | Files: [dashboard/src/pages/NotificationCenter.tsx, dashboard/src/pages/NotificationCenter.css, dashboard/src/App.tsx, dashboard/src/components/Layout.tsx]

- [ ] 10. 前端图表能力（K 线 + SMA 叠加）

  **What to do**:
  1. 安装 `lightweight-charts` 依赖到 dashboard/
  2. 创建 `dashboard/src/components/CandlestickChart.tsx`：
     - 接收 props: `ticker: string`, `data: OHLCV[]`, `sma250?: number[]`
     - 使用 Lightweight Charts 渲染 K 线
     - 叠加 SMA250 线（如提供）
     - 支持缩放和十字线
     - 响应容器尺寸变化（ResizeObserver）
  3. 在 `src/server/app.ts` 添加 API 端点：
     - `GET /api/chart/:ticker?period=6m` — 返回 OHLCV 数据（从 Yahoo Finance）
  4. 在 `dashboard/src/pages/MissionViewer.tsx` 中集成图表：
     - 在报告上方显示标的 K 线图
     - 叠加 SMA250（如有否决显示否决价位）
  5. 在 `dashboard/src/pages/Watchlist.tsx` 的每个标的行添加 sparkline（小型简化图表）

  **Must NOT do**: 不做 TradingView 高级功能（画线、指标叠加面板），仅 K 线 + SMA

  **Recommended Agent Profile**:
  - Category: `visual-engineering` — Reason: 图表组件 + 前端集成
  - Skills: [] — 无需额外技能
  - Omitted: [`playwright`] — build 验证

  **Parallelization**: Can Parallel: YES | Wave 3 | Blocks: [] | Blocked By: [2]

  **References**:
  - Pattern: `dashboard/src/pages/MissionViewer.tsx` — 报告展示页面
  - Pattern: `src/tools/market-data.ts` — Yahoo Finance 数据获取
  - Pattern: `src/server/app.ts` — API 端点注册
  - External: `https://github.com/nicehash/Lightweight-Charts` — Lightweight Charts API

  **Acceptance Criteria**:
  - [ ] `CandlestickChart` 组件存在且 TypeScript 类型正确
  - [ ] `GET /api/chart/NVDA?period=6m` 返回 OHLCV 数据
  - [ ] MissionViewer 页面显示 K 线图表
  - [ ] 图表支持缩放和十字线
  - [ ] `npm run build` 无错误

  **QA Scenarios**:
  ```
  Scenario: Chart API returns OHLCV data
    Tool: Bash
    Steps: curl -H "Authorization: Bearer $API_AUTH_TOKEN" http://localhost:3001/api/chart/NVDA?period=6m
    Expected: JSON array with objects containing open, high, low, close, volume, time fields
    Evidence: .sisyphus/evidence/task-10-api.txt

  Scenario: Dashboard builds with chart component
    Tool: Bash
    Steps: cd dashboard && npm run build
    Expected: Build succeeds
    Evidence: .sisyphus/evidence/task-10-build.txt
  ```

  **Commit**: YES | Message: `feat(dashboard): add K-line chart with SMA overlay` | Files: [dashboard/src/components/CandlestickChart.tsx, dashboard/src/pages/MissionViewer.tsx, src/server/app.ts, dashboard/package.json]

- [ ] 11. 报告结构化输出升级

  **What to do**:
  1. 修改 `src/agents/intelligence/synthesis.ts`（或相关报告合成文件）：
     - 在 LLM prompt 中要求 JSON mode 输出（`response_format: { type: "json_object" }`）
     - 定义结构化输出 schema：包含 `verdict`, `driverType`, `positionSize`, `stopLosses`, `bullCase`, `bearCase`, `confidenceLevel`
  2. 修改 `src/utils/report-validator.ts`：
     - `validateTradeDecision()` 优先从 JSON 结构化输出解析
     - 保留正则 fallback 但标记为 `@deprecated`，加日志警告
     - 添加 Zod schema 严格校验
  3. 确保 `parseStructuredVerdicts()` 和新的 `validateTradeDecision()` 使用同一套 schema
  4. 编写测试：JSON 输出解析、fallback 触发、schema 校验失败

  **Must NOT do**: 不删除 legacy fallback（渐进迁移），不改变下游消费接口

  **Recommended Agent Profile**:
  - Category: `deep` — Reason: 修改 LLM 集成 + 报告管道核心逻辑
  - Skills: [] — 无需额外技能
  - Omitted: [`playwright`] — 纯后端

  **Parallelization**: Can Parallel: YES | Wave 4 | Blocks: [13] | Blocked By: []

  **References**:
  - Pattern: `src/utils/report-validator.ts:1-102` — 现有正则提取逻辑
  - Pattern: `src/utils/report-validator.ts:108-157` — parseStructuredVerdicts（已有 JSON 提取）
  - Pattern: `src/agents/intelligence/synthesis.ts` — 报告合成 Agent
  - API/Type: `src/models/types.ts:136-144` — TradeDecision schema
  - Pattern: `src/utils/llm.ts` — LLM 调用接口

  **Acceptance Criteria**:
  - [ ] LLM 报告合成使用 `response_format: { type: "json_object" }` 或等效结构化输出
  - [ ] `validateTradeDecision()` 优先解析 JSON 数据
  - [ ] 正则 fallback 触发时打印 `[DEPRECATED]` 警告日志
  - [ ] 两套提取逻辑使用同一 Zod schema
  - [ ] `npm test` 全部通过

  **QA Scenarios**:
  ```
  Scenario: JSON mode extraction
    Tool: Bash
    Steps: npm test -- --grep "structured JSON extraction"
    Expected: TradeDecision correctly parsed from JSON output
    Evidence: .sisyphus/evidence/task-11-json.txt

  Scenario: Fallback triggers warning
    Tool: Bash
    Steps: npm test -- --grep "deprecated fallback"
    Expected: Legacy fallback used with DEPRECATED warning logged
    Evidence: .sisyphus/evidence/task-11-fallback.txt
  ```

  **Commit**: YES | Message: `feat(reports): upgrade to LLM JSON mode structured output` | Files: [src/agents/intelligence/synthesis.ts, src/utils/report-validator.ts, src/models/types.ts, src/__tests__/report-validator.test.ts]

- [ ] 12. 止损红线完善

  **What to do**:
  1. 在 `src/worker.ts` 的 T1 哨兵（5min 扫描）中添加：
     - **20日均线带量跌破3天检测**：
       - 计算 20 日 SMA
       - 如果当前价格 < SMA20 且成交量 > 20日均量 1.5倍，开始计数
       - 连续 3 天符合条件 → 触发 `sendStopLossAlert`
       - 需要持久化计数器（SQLite 或文件）
     - **龙头 SMA50 跌破 5% 板块止损检测**：
       - 对 `LEADER_TICKERS` 中的龙头股检查 SMA50
       - 如果龙头股价格 < SMA50 * 0.95 → 对该板块所有持仓触发 `sendStopLossAlert`
  2. 在 `src/config/constants.ts` 添加相关常量：
     - `SMA20_VOLUME_MULTIPLIER = 1.5`
     - `SMA20_BREAK_DAYS = 3`
     - `LEADER_SMA50_DROP_THRESHOLD = 0.05`
  3. 编写 Vitest 测试：模拟各种止损触发场景

  **Must NOT do**: 不做自动清仓操作（仅告警）

  **Recommended Agent Profile**:
  - Category: `deep` — Reason: 涉及技术分析逻辑 + worker 修改
  - Skills: [] — 无需额外技能
  - Omitted: [`playwright`] — 纯后端

  **Parallelization**: Can Parallel: YES | Wave 4 | Blocks: [] | Blocked By: []

  **References**:
  - Pattern: `src/worker.ts:50-100` — T1 哨兵扫描逻辑
  - Pattern: `src/tools/market-data.ts` — SMA 计算函数
  - Pattern: `src/config/constants.ts:23` — LEADER_TICKERS 定义
  - Config: `investor_profile.md` — 4 条红线止损规则原文

  **Acceptance Criteria**:
  - [ ] 20日均线带量跌破3天检测逻辑存在且有测试
  - [ ] 龙头 SMA50 跌破5%板块止损检测逻辑存在且有测试
  - [ ] 触发条件满足时调用 `sendStopLossAlert`
  - [ ] 计数器在进程重启后不丢失
  - [ ] `npm test` 全部通过

  **QA Scenarios**:
  ```
  Scenario: SMA20 volume breakdown detection
    Tool: Bash
    Steps: npm test -- --grep "SMA20 volume breakdown"
    Expected: After 3 consecutive days below SMA20 with high volume, alert triggered
    Evidence: .sisyphus/evidence/task-12-sma20.txt

  Scenario: Leader SMA50 sector stop-loss
    Tool: Bash
    Steps: npm test -- --grep "leader SMA50 sector"
    Expected: When leader drops >5% below SMA50, sector alert triggered
    Evidence: .sisyphus/evidence/task-12-leader.txt
  ```

  **Commit**: YES | Message: `feat(worker): add SMA20 volume breakdown + leader SMA50 sector stop-loss` | Files: [src/worker.ts, src/config/constants.ts, src/__tests__/stop-loss-redlines.test.ts]

- [ ] 13. 报告风格后处理器

  **What to do**:
  1. 创建 `src/utils/report-style-guard.ts`：
     - 导出 `enforceReportStyle(report: string): { cleaned: string, violations: string[] }`
     - 检测规则（来自 `investor_profile.md`）：
       a. **浮夸用语检测**：正则匹配"重磅"、"震撼"、"颠覆"、"史诗级"等词汇 → 替换为中性表述
       b. **1-10分打分检测**：匹配 `\d+\/10` 或 `评分.*\d+` → 删除打分句子，加注释"[已移除主观打分]"
       c. **无推导结论检测**：如果报告中有"建议买入"但没有"因为"/"由于"/"原因"等推导词 → 添加警告
       d. **止损未置顶检测**：如果报告包含止损内容但不在前 20% → 添加警告
     - 返回清理后的报告 + 违规列表
  2. 在报告合成 pipeline（`synthesis.ts` 或 `dispatch-engine.ts`）中调用后处理器
  3. 违规信息记录到日志
  4. 编写 Vitest 测试：各种违规场景

  **Must NOT do**: 不拒绝整个报告（仅清理+警告），不改变报告语义

  **Recommended Agent Profile**:
  - Category: `deep` — Reason: 文本处理逻辑 + pipeline 集成
  - Skills: [] — 无需额外技能
  - Omitted: [`playwright`] — 纯后端

  **Parallelization**: Can Parallel: NO | Wave 4 | Blocks: [] | Blocked By: [11]

  **References**:
  - Pattern: `src/utils/report-validator.ts` — 现有报告验证模式
  - Pattern: `src/agents/intelligence/synthesis.ts` — 报告合成位置
  - Config: `investor_profile.md` — 报告风格要求原文
  - Pattern: `src/workflows/dispatch-engine.ts` — pipeline 中报告处理位置

  **Acceptance Criteria**:
  - [ ] `report-style-guard.ts` 存在且导出 `enforceReportStyle`
  - [ ] 包含"重磅突破"的报告被清理为中性表述
  - [ ] 包含"8/10"评分的报告中评分被移除
  - [ ] pipeline 中报告经过后处理器
  - [ ] `npm test` 全部通过

  **QA Scenarios**:
  ```
  Scenario: Pompous language removed
    Tool: Bash
    Steps: npm test -- --grep "pompous language"
    Expected: "重磅突破" replaced with neutral phrasing, violation logged
    Evidence: .sisyphus/evidence/task-13-pompous.txt

  Scenario: Score removal
    Tool: Bash
    Steps: npm test -- --grep "score removal"
    Expected: "评分 8/10" sentence removed with "[已移除主观打分]" marker
    Evidence: .sisyphus/evidence/task-13-score.txt
  ```

  **Commit**: YES | Message: `feat(reports): add style guard post-processor` | Files: [src/utils/report-style-guard.ts, src/agents/intelligence/synthesis.ts, src/__tests__/report-style-guard.test.ts]

- [ ] 14. CSS 模块化 + 移动端适配

  **What to do**:
  1. **CSS 拆分**（从 App.css 930 行单文件）：
     - `dashboard/src/index.css` — 保留全局变量、reset、字体
     - `dashboard/src/components/Layout.css` — 侧边栏、导航、布局 grid
     - 每个页面的样式移到对应 `PageName.css`（部分在前序任务已创建）
     - `App.css` 仅保留跨页面共享样式（<100行）
  2. **移动端适配**：
     - 在 `Layout.css` 添加 `@media (max-width: 768px)` 断点：
       - 侧边栏折叠为底部导航栏（hamburger menu）
       - 主内容区域全宽
     - 在 Watchlist.css 和 NotificationCenter.css 添加移动端断点：
       - 表格转为卡片列表
       - 按钮尺寸增大（touch-friendly）
     - 添加 viewport meta tag（如尚未添加）
  3. 验证所有页面在 375px 宽度下无水平滚动

  **Must NOT do**: 不做完整 PWA，不引入 Tailwind，不做 CSS-in-JS

  **Recommended Agent Profile**:
  - Category: `visual-engineering` — Reason: CSS 重构 + 响应式设计
  - Skills: [`frontend-ui-ux`] — 响应式设计最佳实践
  - Omitted: [`playwright`] — build 验证即可

  **Parallelization**: Can Parallel: NO | Wave 5 | Blocks: [] | Blocked By: [7, 8, 9]

  **References**:
  - Pattern: `dashboard/src/App.css` — 当前 930 行单文件
  - Pattern: `dashboard/src/index.css` — 现有 base styles
  - Pattern: `dashboard/src/components/Layout.tsx` — 布局组件
  - Pattern: `dashboard/index.html` — viewport meta tag

  **Acceptance Criteria**:
  - [ ] `App.css` 缩减到 <100 行
  - [ ] 每个页面有独立 CSS 文件
  - [ ] `@media (max-width: 768px)` 断点在 Layout.css 中存在
  - [ ] Watchlist 和 NotificationCenter 在 375px 宽度下无水平滚动
  - [ ] `npm run build` 无错误

  **QA Scenarios**:
  ```
  Scenario: CSS split verification
    Tool: Bash
    Steps: wc -l dashboard/src/App.css
    Expected: < 100 lines
    Evidence: .sisyphus/evidence/task-14-css-split.txt

  Scenario: Mobile breakpoint exists
    Tool: Bash
    Steps: grep -c "@media" dashboard/src/components/Layout.css dashboard/src/pages/Watchlist.css dashboard/src/pages/NotificationCenter.css
    Expected: At least 1 @media query per file
    Evidence: .sisyphus/evidence/task-14-responsive.txt

  Scenario: Build succeeds after CSS refactor
    Tool: Bash
    Steps: cd dashboard && npm run build
    Expected: Build succeeds
    Evidence: .sisyphus/evidence/task-14-build.txt
  ```

  **Commit**: YES | Message: `refactor(dashboard): modularize CSS + add mobile responsiveness` | Files: [dashboard/src/App.css, dashboard/src/components/Layout.css, dashboard/src/pages/*.css, dashboard/index.html]

<!-- TASKS END - do not remove this marker -->

## Final Verification Wave (MANDATORY — after ALL implementation tasks)
> 4 review agents run in PARALLEL. ALL must APPROVE. Present consolidated results to user and get explicit "okay" before completing.
> **Do NOT auto-proceed after verification. Wait for user's explicit approval before marking work complete.**
> **Never mark F1-F4 as checked before getting user's okay.** Rejection or user feedback -> fix -> re-run -> present again -> wait for okay.
- [ ] F1. Plan Compliance Audit — oracle
- [ ] F2. Code Quality Review — unspecified-high
- [ ] F3. Real Manual QA — unspecified-high (+ playwright for dashboard pages)
- [ ] F4. Scope Fidelity Check — deep

## Commit Strategy
- 每个 Task 独立提交，commit message 格式：`type(scope): description`
- Wave 完成后 squash 为功能分支合并提交（可选）
- 不 force push，不 rebase 已推送的 commits

## Success Criteria
1. Dashboard 从"报告阅读器"变为"决策助手"：有图表、有持仓追踪、有通知中心
2. 数据层可靠性：Yahoo Finance 有重试+熔断，宏观数据不再是空壳
3. 分析质量：报告用 JSON 结构化输出，风格经过后处理器清理
4. 交易纪律：4 条红线止损全部硬编码实现
5. 安全：API 有鉴权+限流
6. 移动端：Watchlist 和通知中心可在手机上使用

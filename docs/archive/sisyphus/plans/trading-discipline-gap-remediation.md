# 交易纪律硬编码缺陷修复计划 — Trading Discipline Gap Remediation

## TL;DR
> **Summary**: 对照《交易者完整画像 v2.0》系统性审计了代码实现，发现10个关键缺陷——核心交易纪律（市值过滤、共识否决、止损告警、报告标注、防卖飞、拥挤高潮、龙头板块止损、入场信号、仓位纪律）均停留在 Prompt 软约束层面，未被硬编码为不可绕过的代码逻辑。本计划将逐一将这些"纸上纪律"升级为"铁血代码"。
> **Deliverables**: 7个独立的代码加固任务，每个包含硬编码逻辑实现 + 自动化验证测试
> **Effort**: Large
> **Parallel**: YES - 2 waves
> **Critical Path**: Task 1 (市值统一) → Task 2 (共识否决) → Task 3 (止损+入场接线) + Task 5 (防卖飞+拥挤高潮)

## Context

### Original Request
对照《交易者完整画像 v2.0》和 TrendRadar 新闻打分法则，从5个维度（硬性过滤/反人性弱点/双脑共识/推送告警/发现及时性）审计全量代码，找出"理想画像 vs 代码现实"的 Gap，输出 Top 5 缺陷清单和具体优化方案。

### Interview Summary
此为审计型任务，无需用户交互式访谈。直接基于 `investor_profile.md`（交易者画像 v2.0）与代码探索结果生成。

### Metis Review (gaps addressed)
- Metis 确认了6个 Gap 的分类和优先级排序
- 补充了依赖关系：市值统一 → 共识否决 → 止损/防卖飞
- 强调了每个任务需要可自动化执行的验收标准
- 建议原子提交策略，每个 Gap 独立可回滚

## Work Objectives

### Core Objective
将交易者画像中10条核心纪律从"Prompt 软约束"升级为"代码硬编码逻辑"，使 AI Agent 无法通过幻觉或提示注入绕过这些规则。

### Deliverables
1. 统一的市值过滤守门函数（$200M-$50B 硬编码 + 早期管道拦截）
2. 共识否决机制（双脑冲突时的硬性阻断/升级逻辑）
3. 止损告警运行时接线（从死代码到真实触发链路）+ 龙头 SMA50 跌破5%板块止损检测 + 入场信号接线
4. 报告结构化强制验证层（驱动力标签 + 试探仓位 + 止损价 = 必填字段）
5. 防卖飞引擎回注决策循环（龙头健康时阻断清仓信号）+ `crowdedClimax` 拥挤高潮阶段处理
6. 发现延迟优化方案设计（从60分钟降至15-20分钟）
7. 仓位纪律硬编码提醒（单标的20%上限检测 + 报告/告警中嵌入仓位合规提示）

### Definition of Done (verifiable conditions with commands)
- `grep -rn '200_000_000\|200000000' src/` 在所有市值过滤点找到一致的下界
- `grep -rn '50_000_000_000\|50000000000' src/` 在所有市值过滤点找到一致的上界
- `sendStopLossAlert` 被至少一个运行时代码路径实际调用
- `computeConsensus` 在 disagree 时触发可观测的阻断/升级动作
- 合成报告经过后处理验证器，缺少必填字段时抛错
- `NarrativeLifecycleEngine` 输出被注入到 `dispatchMission` 决策流中

### Must Have
- 所有修改都带自动化测试（单元测试或集成测试）
- 每个 Gap 独立提交，可回滚
- 不破坏现有 Pipeline 的正常运行
- 保持中文报告输出风格

### Must NOT Have (guardrails, AI slop patterns, scope boundaries)
- ❌ 不要重写 TradingAgents 的 Python 核心辩论逻辑（那是第三方开源框架）
- ❌ 不要修改 OpenBB 平台的底层数据查询（vendor 代码不碰）
- ❌ 不要引入新的外部依赖或付费 API
- ❌ 不要将验证逻辑放在 Prompt 层（本计划的核心宗旨就是从 Prompt 移到代码）
- ❌ 不要添加自动交易功能（画像明确说"情报系统，不是交易机器人"）

## Verification Strategy
> ZERO HUMAN INTERVENTION - all verification is agent-executed.
- Test decision: tests-after + framework: vitest (Node.js side) / pytest (Python side if needed)
- QA policy: Every task has agent-executed scenarios
- Evidence: .sisyphus/evidence/task-{N}-{slug}.{ext}

## Execution Strategy

### Parallel Execution Waves

Wave 1 (Foundation — 4 tasks parallel):
- Task 1: 市值过滤统一 (quick)
- Task 2: 共识否决机制 (deep) — 与 Task 1 可并行，因为它在 mission-dispatcher.ts 中修改的函数与市值过滤函数不重叠
- Task 4: 报告结构化验证 (deep)
- Task 6: 发现延迟优化设计 (unspecified-high)

Wave 2 (Integration — 依赖 Wave 1):
- Task 3: 止损告警接线 + 龙头SMA50板块止损 + 入场信号 (deep) — Blocked by Task 2 (需要共识否决的事件钩子)
- Task 5: 防卖飞引擎集成 + crowdedClimax阶段处理 (deep) — Blocked by Task 2 (需要共识否决提供的信号阻断接口)
- Task 7: 仓位纪律硬编码提醒 (quick) — Blocked by Task 4 (共享 synthesis.ts 修改区域)

### Dependency Matrix

| Task | Depends On | Blocks |
|------|-----------|--------|
| 1. 市值过滤统一 | — | 4, 6 |
| 2. 共识否决机制 | — | 3, 5 |
| 3. 止损+入场告警接线 | 2 | — |
| 4. 报告结构化验证 | 1 | 7 |
| 5. 防卖飞+拥挤高潮 | 2 | — |
| 6. 发现延迟优化 | — | — |
| 7. 仓位纪律提醒 | 4 | — |

> ⚠️ **注意**: Task 4 和 Task 7 都修改 `synthesis.ts` 的同一区域（lines 83-86，report 生成后 return 前）。Task 7 必须在 Task 4 完成后执行，以避免合并冲突。Task 7 移至 Wave 2。

### Agent Dispatch Summary

| Wave | Task Count | Categories |
|------|-----------|------------|
| Wave 1 | 4 | quick, deep, deep, unspecified-high |
| Wave 2 | 3 | deep, deep, quick |

## TODOs

<!-- TASKS_START -->

- [ ] 1. 市值过滤统一守门函数 — Market Cap Gate Unification

  **What to do**:
  1. **创建新文件** `src/utils/market-cap-gate.ts`（此文件不存在，需新建），导出两个常量和一个纯函数：
     ```typescript
     export const MARKET_CAP_MIN = 200_000_000;      // $200M — 画像下界
     export const MARKET_CAP_MAX = 50_000_000_000;   // $50B — 画像上界
     export function isMarketCapInRange(marketCap: number | null): { pass: boolean; reason: string }
     ```
     - `marketCap === null` → `{ pass: false, reason: '市值数据缺失' }`
     - `< MARKET_CAP_MIN` → `{ pass: false, reason: '市值 $XXM < $200M 红线' }`
     - `> MARKET_CAP_MAX` → `{ pass: false, reason: '市值 $XXB > $50B 红线' }`
     - 范围内 → `{ pass: true, reason: '' }`
  2. **修改 `src/utils/openbb-provider.ts`** (lines 365-372)：
     - `import { isMarketCapInRange } from './market-cap-gate';`
     - 将 `computeVerdict` 中的硬编码 `300_000_000` / `100_000_000_000` 替换为调用 `isMarketCapInRange(core.marketCap)`
     - 若 `pass === false` → 直接 `return { verdict: 'FAIL', verdictReason: reason }`
  3. **修改 `src/agents/discovery/ticker-discovery.ts`** (line 122)：
     - `import { MARKET_CAP_MIN, MARKET_CAP_MAX } from '../../utils/market-cap-gate';`
     - 删除 `const MEGA_CAP_THRESHOLD = 500_000_000_000;`
     - 在 `if (quote.marketCap > MEGA_CAP_THRESHOLD)` 处改为双边过滤：
       ```typescript
       if (quote.marketCap < MARKET_CAP_MIN || quote.marketCap > MARKET_CAP_MAX) {
         console.log(`[TickerDiscovery] 🚫 排除: ${symbol} ($${(quote.marketCap / 1e9).toFixed(1)}B) — 不在 $200M-$50B 范围`);
         continue;
       }
       ```
  4. **修改 `src/agents/trend/trend-radar.ts`**：
     - 在 `TickerDiscoveryEngine` 发现标的后，如果 TrendRadar 有直接使用这些 ticker 的地方，确保都经过 `isMarketCapInRange` 过滤。检查 `scan()` 方法中 `mentionedTickers` 是否有市值校验。若无，在 `scan()` 中对 `mentionedTickers` 增加市值过滤。
  5. **修改 `src/agents/swarm/strategist.ts`**：
     - 将 prompt 中的 `$300M-$100B` 文本改为 `$200M-$50B`，与画像保持一致（注意：这只是文档性修改，核心过滤已移到代码层）

  **Must NOT do**:
  - 不要修改 `vendors/` 下的任何文件
  - 不要移除 `computeVerdict` 中市值以外的评分逻辑（机构持仓、内部人、均线等保留不动）

  **Recommended Agent Profile**:
  - Category: `quick` - Reason: 单一函数提取 + 3处调用点替换，逻辑简单
  - Skills: [] - 无需特殊技能
  - Omitted: [`playwright`] - 纯后端逻辑，无UI

  **Parallelization**: Can Parallel: YES | Wave 1 | Blocks: [4, 6] | Blocked By: []

  **References**:
  - New file: `src/utils/market-cap-gate.ts` - 本 Task 创建的新文件（当前不存在）
  - Pattern: `src/utils/openbb-provider.ts:357-399` - `computeVerdict` 函数，市值红线在 lines 365-372
  - Pattern: `src/agents/discovery/ticker-discovery.ts:122-135` - `MEGA_CAP_THRESHOLD` 定义和过滤逻辑
  - Pattern: `src/agents/trend/trend-radar.ts:1-50` - TrendRadar 类定义，无市值过滤
  - Pattern: `src/agents/swarm/strategist.ts` - prompt 中的 `$300M-$100B` 文本
  - Source of truth: `investor_profile.md` - 画像要求 `$200M-$50B`

  **Acceptance Criteria**:
  - [ ] `grep -rn 'MARKET_CAP_MIN\|MARKET_CAP_MAX' src/` 显示至少4个文件引用统一常量
  - [ ] `grep -rn '300_000_000\|100_000_000_000' src/` 返回空（旧值已全部清除）
  - [ ] `grep -rn '200_000_000' src/utils/market-cap-gate.ts` 确认下界正确
  - [ ] `grep -rn '50_000_000_000' src/utils/market-cap-gate.ts` 确认上界正确
  - [ ] `npx ts-node -e "import {isMarketCapInRange} from './src/utils/market-cap-gate'; console.log(JSON.stringify([isMarketCapInRange(100_000_000), isMarketCapInRange(1_000_000_000), isMarketCapInRange(60_000_000_000), isMarketCapInRange(null)]))"` 输出 `[{pass:false,...},{pass:true,...},{pass:false,...},{pass:false,...}]`
  - [ ] TypeScript 编译无错误: `npx tsc --noEmit`

  **QA Scenarios**:
  ```
  Scenario: Happy path — 市值在合法范围内
    Tool: Bash
    Steps: 运行 ts-node 脚本调用 isMarketCapInRange(5_000_000_000)
    Expected: { pass: true, reason: '' }
    Evidence: .sisyphus/evidence/task-1-market-cap-pass.txt

  Scenario: 下界拒绝 — 市值过小
    Tool: Bash
    Steps: 运行 ts-node 脚本调用 isMarketCapInRange(100_000_000)
    Expected: { pass: false, reason: '...$200M 红线' }
    Evidence: .sisyphus/evidence/task-1-market-cap-reject-low.txt

  Scenario: 上界拒绝 — 市值过大
    Tool: Bash
    Steps: 运行 ts-node 脚本调用 isMarketCapInRange(60_000_000_000)
    Expected: { pass: false, reason: '...$50B 红线' }
    Evidence: .sisyphus/evidence/task-1-market-cap-reject-high.txt

  Scenario: null 处理
    Tool: Bash
    Steps: 运行 ts-node 脚本调用 isMarketCapInRange(null)
    Expected: { pass: false, reason: '市值数据缺失' }
    Evidence: .sisyphus/evidence/task-1-market-cap-null.txt
  ```

  **Commit**: YES | Message: `fix(filter): unify market-cap gate to $200M-$50B across all pipelines` | Files: [src/utils/market-cap-gate.ts, src/utils/openbb-provider.ts, src/agents/discovery/ticker-discovery.ts, src/agents/trend/trend-radar.ts, src/agents/swarm/strategist.ts]

---

- [ ] 2. 共识否决机制 — Dual-Brain Consensus Veto

  **What to do**:
  1. **在 `src/workflows/mission-dispatcher.ts` 中扩展 `TickerConsensus` 接口**（line 72-78）：
     ```typescript
     export interface TickerConsensus {
       ticker: string;
       openclawVerdict: 'BUY' | 'HOLD' | 'SELL' | 'SKIP' | null;
       taVerdict: 'BUY' | 'HOLD' | 'SELL' | 'UNKNOWN' | null;
       agreement: 'agree' | 'disagree' | 'partial' | 'pending';
       openbbVerdict: 'PASS' | 'WARN' | 'FAIL' | null;
       vetoed: boolean;          // 新增：是否被否决
       vetoReason: string | null; // 新增：否决原因
     }
     ```
  2. **重写 `computeConsensus` 函数**（lines 403-447）：
     - 当 `agreement === 'disagree'` 时：
       - 设置 `vetoed = true`
       - 设置 `vetoReason = '双脑冲突: OpenClaw=${ocVerdict} vs TradingAgents=${taVerdict}。右侧跟风纪律要求：双脑一致方可行动'`
     - 当 `openbbVerdict === 'FAIL'` 时：
       - 也设置 `vetoed = true`
       - 设置 `vetoReason = 'OpenBB 基本面红线不通过: ${openbbResult.verdictReason}'`
     - 当 `agreement === 'agree'` 且 `openbbVerdict !== 'FAIL'` 时：`vetoed = false`
  3. **在 `dispatchMission` 中，`computeConsensus` 调用之后**（line 234 之后）添加否决响应逻辑：
     ```typescript
     // 共识否决响应
     const vetoedTickers = mission.consensus.filter(c => c.vetoed);
     if (vetoedTickers.length > 0) {
       for (const vt of vetoedTickers) {
         eventBus.emitSystem('info',
           `🚫 [VETO] ${vt.ticker}: ${vt.vetoReason}`
         );
       }
       // 发送 Telegram 否决通知
       const vetoMsg = vetoedTickers.map(v =>
         `🚫 *${v.ticker}*: ${v.vetoReason}`
       ).join('\n');
       await sendMessage(`⚠️ *双脑共识否决报告*\n\n${vetoMsg}\n\n_右侧跟风纪律: 双脑冲突时不行动_`);
     }
     ```
     需要在文件顶部 import `sendMessage` from `../utils/telegram`。
  4. **在 `worker.ts` 的 taskQueue.onProcess 回调中**（line 86-91），将现有的纯日志共识输出改为：对 `vetoed` 的 ticker 追加 `🚫VETOED` 标记：
     ```typescript
     const consensusSummary = mission.consensus
       .map(c => `${c.ticker}: OC=${c.openclawVerdict || '-'} TA=${c.taVerdict || '-'} → ${c.agreement}${c.vetoed ? ' 🚫VETOED' : ''}`)
       .join(' | ');
     ```

  **Must NOT do**:
  - 不要修改 TradingAgents 的 Python PM 决策逻辑
  - 不要引入"自动下单"或"自动平仓"行为 — 否决只产生告警和标记
  - 不要删除 `partial` 或 `pending` 状态的现有逻辑

  **Recommended Agent Profile**:
  - Category: `deep` - Reason: 涉及核心决策流改造，需要理解多个交互点之间的数据流
  - Skills: [] - 无需特殊技能
  - Omitted: [`playwright`] - 纯后端逻辑

  **Parallelization**: Can Parallel: YES | Wave 1 | Blocks: [3, 5] | Blocked By: []

  **References**:
  - Pattern: `src/workflows/mission-dispatcher.ts:72-78` - `TickerConsensus` 接口定义
  - Pattern: `src/workflows/mission-dispatcher.ts:403-447` - `computeConsensus` 函数（核心修改点）
  - Pattern: `src/workflows/mission-dispatcher.ts:233-246` - consensus 计算后的日志输出（插入否决逻辑的位置）
  - Pattern: `src/worker.ts:86-91` - worker 中共识日志格式化
  - Pattern: `src/utils/telegram.ts:22-31` - `sendMessage` 函数签名
  - Pattern: `src/utils/event-bus.ts:24-33` - `emitSystem` 方法签名
  - Source of truth: `investor_profile.md` - "右侧跟风" 纪律，要求两个信号源一致

  **Acceptance Criteria**:
  - [ ] `grep -n 'vetoed' src/workflows/mission-dispatcher.ts` 显示 `vetoed` 字段在接口和逻辑中被使用
  - [ ] `grep -n 'VETO' src/workflows/mission-dispatcher.ts` 显示至少1个 eventBus.emitSystem 调用
  - [ ] `grep -n 'sendMessage' src/workflows/mission-dispatcher.ts` 确认 Telegram 推送被调用
  - [ ] TypeScript 编译无错误: `npx tsc --noEmit`

  **QA Scenarios**:
  ```
  Scenario: Happy path — 双脑同意
    Tool: Bash
    Steps: 构造 mock mission 数据（OC=BUY, TA=BUY），调用 computeConsensus
    Expected: agreement='agree', vetoed=false, vetoReason=null
    Evidence: .sisyphus/evidence/task-2-consensus-agree.txt

  Scenario: 否决触发 — 双脑冲突
    Tool: Bash
    Steps: 构造 mock mission 数据（OC=BUY, TA=SELL），调用 computeConsensus
    Expected: agreement='disagree', vetoed=true, vetoReason 包含 '双脑冲突'
    Evidence: .sisyphus/evidence/task-2-consensus-veto.txt

  Scenario: OpenBB 红线否决
    Tool: Bash
    Steps: 构造 mock mission 数据（OC=BUY, TA=BUY, openbbVerdict='FAIL'），调用 computeConsensus
    Expected: vetoed=true, vetoReason 包含 '基本面红线'
    Evidence: .sisyphus/evidence/task-2-consensus-openbb-fail.txt

  Scenario: 部分共识不否决
    Tool: Bash
    Steps: 构造 mock（OC=BUY, TA=HOLD），调用 computeConsensus
    Expected: agreement='partial', vetoed=false（部分共识不触发否决）
    Evidence: .sisyphus/evidence/task-2-consensus-partial.txt
  ```

  **Commit**: YES | Message: `feat(consensus): enforce right-side veto when dual-brain disagrees` | Files: [src/workflows/mission-dispatcher.ts, src/worker.ts]

---

- [ ] 3. 止损告警 + 龙头板块止损 + 入场信号运行时接线 — Stop-Loss & Entry Signal Wiring

  **What to do**:
  1. **在 `src/workflows/mission-dispatcher.ts` 的 `dispatchMission` 函数中**，在共识否决逻辑之后（Task 2 新增的代码块之后），添加止损告警触发逻辑：
     ```typescript
     // 止损告警：对所有 OpenBB 评级为 FAIL 的持仓标的发送紧急告警
     for (const consensus of mission.consensus) {
       if (consensus.openbbVerdict === 'FAIL') {
         const openbbData = mission.openbbData.find(d => d.ticker === consensus.ticker);
         const details = [
           `OpenBB 评级: FAIL`,
           openbbData?.verdictReason ? `原因: ${openbbData.verdictReason}` : '',
           consensus.vetoed ? `共识状态: 🚫 VETOED` : `共识状态: ${consensus.agreement}`,
         ].filter(Boolean).join('\n');
         await sendStopLossAlert(consensus.ticker, details);
       }
     }
     ```
  2. **在 `src/worker.ts` 的文件顶部**（line 6），确认 `sendStopLossAlert` 已被 import（当前已 import 但未使用）。
  3. **在 `src/worker.ts` 的 T3 每日日报 cron 中**（lines 193-258），在叙事生命周期评估之后（line 243），添加：
     ```typescript
     // 叙事跌破生命线 → 触发止损告警
     if (messages.length > 0) {
       for (const msg of messages) {
         if (msg.includes('跌破') || msg.includes('崩溃') || msg.includes('衰竭')) {
           // 从消息中提取 ticker
           const tickerMatch = msg.match(/龙头\s+(\$?[A-Z]{1,5})/);
           if (tickerMatch) {
             const ticker = tickerMatch[1].replace('$', '');
             await sendStopLossAlert(ticker, `叙事生命周期引擎警告:\n${msg}`);
           }
         }
       }
     }
     ```
  4. **在 `src/agents/lifecycle/engine.ts`**，为 `narrativeFatigue` → `postCollapse` 转换和 `mainExpansion` → `narrativeFatigue` 转换，在 messages 中加入结构化标记 `[STOP_LOSS_TRIGGER]` 以便 worker 精确匹配（避免误触发）：
     - line 48-49: reason 前缀加 `[STOP_LOSS_TRIGGER] `
     - line 53-55: reason 前缀加 `[STOP_LOSS_TRIGGER] `
  5. **[新增 — Gap B] 龙头 SMA50 跌破5%板块止损检测**：
     - 在 `src/worker.ts` 的 T1 五分钟扫描 cron 中（或 T3 日报 cron 中），添加龙头 SMA50 跌破检测：
       ```typescript
       // 画像红线: 龙头放量跌破50日均线5%+ → 板块全线防御减仓
       import { checkSMACross, getQuote } from '../tools/market-data';
       
       const LEADER_TICKERS = ['NVDA', 'AVGO']; // 板块龙头列表（可配置）
       for (const leader of LEADER_TICKERS) {
         const smaResults = await checkSMACross(leader, [50]);
         const sma50 = smaResults.find(r => r.period === 50);
         if (sma50 && sma50.position === 'below') {
           const dropPercent = ((sma50.smaValue - sma50.currentPrice) / sma50.smaValue) * 100;
           if (dropPercent >= 5) {
             await sendStopLossAlert(leader,
               `🔴 [板块止损红线] 龙头 ${leader} 放量跌破 50日均线 ${dropPercent.toFixed(1)}%!\n` +
               `当前: $${sma50.currentPrice} | SMA50: $${sma50.smaValue}\n` +
               `画像纪律: 板块全线防御减仓！`
             );
           }
         }
       }
       ```
     - 注意：`checkSMACross` 返回 `SMACheckResult[]`，包含 `period`, `smaValue`, `currentPrice`, `position`（确认 `market-data.ts:93` 签名支持）
     - `LEADER_TICKERS` 可定义为模块常量，或从 watchlist.json 中读取龙头标的
  6. **[新增 — Gap C] `sendEntrySignal` 入场信号接线**：
     - `sendEntrySignal` 已在 `telegram.ts:53` 正确实现（`🟠 入场信号触发` 推送格式），已在 `worker.ts:6` import，但从未被调用
     - 在 `src/workflows/mission-dispatcher.ts` 的 consensus 后处理中，当 `agreement === 'agree'` 且 `openbbVerdict !== 'FAIL'` 且 `NOT vetoed` 时，调用：
       ```typescript
       // 入场信号：双脑共识 + OpenBB 通过 + 未被否决 → 推送入场信号
       const entryTickers = mission.consensus.filter(c =>
         c.agreement === 'agree' && c.openbbVerdict !== 'FAIL' && !c.vetoed
       );
       for (const entry of entryTickers) {
         await sendEntrySignal(entry.ticker,
           `双脑共识: ${entry.openclawVerdict}\n` +
           `OpenBB: ${entry.openbbVerdict}\n` +
           `建议: 试探仓位 5% 入场`
         );
       }
       ```
     - 在 `src/workflows/mission-dispatcher.ts` 顶部添加 `sendEntrySignal` import（从 `../utils/telegram`）

  **Must NOT do**:
  - 不要实现自动卖出/买入逻辑 — 所有信号都是告警/提示性质
  - 不要修改 `sendStopLossAlert` 和 `sendEntrySignal` 函数本身（它们已正确实现）
  - 不要在龙头列表中硬编码过多标的，保持可配置
  - 不要将 SMA50 检测频率设得太高（每日一次或每小时一次即可，避免 rate limit）

  **Recommended Agent Profile**:
  - Category: `deep` - Reason: 涉及3个新增逻辑（SMA50检测、入场信号、止损接线），跨多个文件，需理解数据流
  - Skills: [] - 无需特殊技能
  - Omitted: [`playwright`] - 纯后端

  **Parallelization**: Can Parallel: NO | Wave 2 | Blocks: [] | Blocked By: [2]

  **References**:
  - Pattern: `src/utils/telegram.ts:37-48` - `sendStopLossAlert` 函数定义（已正确实现，只需调用）
  - Pattern: `src/utils/telegram.ts:53-56` - `sendEntrySignal` 函数定义（已正确实现，只需调用）
  - Pattern: `src/worker.ts:6` - `sendStopLossAlert` + `sendEntrySignal` 的 import 语句（已存在）
  - Pattern: `src/worker.ts:237-245` - T3 日报中叙事生命周期评估代码
  - Pattern: `src/agents/lifecycle/engine.ts:44-59` - 阶段跃迁逻辑和 reason 文本
  - Pattern: `src/workflows/mission-dispatcher.ts:233-246` - consensus 计算后的位置（Task 2 的否决逻辑之后）
  - Pattern: `src/tools/market-data.ts:93` - `checkSMACross(symbol, periods[])` 函数签名
  - Pattern: `src/utils/llm.ts:117` - 画像止损规则在 prompt 中的位置（龙头 NVDA 跌破 50日线 5%+）
  - Source of truth: `investor_profile.md:165` - "龙头放量跌破50日均线5%+" → 🔴强制板块全线防御减仓
  - Dependency: Task 2 的 `sendMessage` import 和共识否决代码块 — 止损/入场逻辑紧接其后

  **Acceptance Criteria**:
  - [ ] `grep -rn 'sendStopLossAlert(' src/ | grep -v 'import\|export\|function\|//'` 显示至少3个运行时调用点（OpenBB FAIL + 叙事跌破 + 龙头SMA50）
  - [ ] `grep -rn 'sendEntrySignal(' src/ | grep -v 'import\|export\|function\|//'` 显示至少1个运行时调用点
  - [ ] `grep -n 'STOP_LOSS_TRIGGER' src/agents/lifecycle/engine.ts` 显示结构化标记
  - [ ] `grep -n 'LEADER_TICKERS\|龙头.*SMA50\|板块止损' src/worker.ts` 显示龙头板块止损逻辑
  - [ ] TypeScript 编译无错误: `npx tsc --noEmit`

  **QA Scenarios**:
  ```
  Scenario: OpenBB FAIL 触发止损告警
    Tool: Bash
    Steps: 在 dispatchMission 流程中构造一个 openbbVerdict='FAIL' 的 ticker，观察 sendStopLossAlert 被调用
    Expected: console 输出 '[Telegram] 🚨 CRITICAL ALERT: {ticker}'
    Evidence: .sisyphus/evidence/task-3-stoploss-openbb.txt

  Scenario: 叙事跌破生命线触发止损告警
    Tool: Bash
    Steps: 模拟 lifecycleEngine 产生包含 [STOP_LOSS_TRIGGER] 的消息
    Expected: sendStopLossAlert 被调用，console 显示 CRITICAL ALERT
    Evidence: .sisyphus/evidence/task-3-stoploss-lifecycle.txt

  Scenario: 龙头 SMA50 跌破5% 触发板块止损
    Tool: Bash
    Steps: 模拟 NVDA checkSMACross 返回 position='below' 且跌幅 >=5%
    Expected: sendStopLossAlert 被调用，消息包含 '板块止损红线'
    Evidence: .sisyphus/evidence/task-3-stoploss-leader-sma50.txt

  Scenario: 龙头 SMA50 跌幅 <5% → 不触发
    Tool: Bash
    Steps: 模拟 NVDA checkSMACross 返回 position='below' 但跌幅仅 2%
    Expected: sendStopLossAlert 不被调用（低于5%红线）
    Evidence: .sisyphus/evidence/task-3-stoploss-leader-below-threshold.txt

  Scenario: 入场信号 — 双脑同意且未被否决
    Tool: Bash
    Steps: 构造 consensus 数据：agreement='agree', openbbVerdict='PASS', vetoed=false
    Expected: sendEntrySignal 被调用，消息包含 '双脑共识' + '试探仓位 5%'
    Evidence: .sisyphus/evidence/task-3-entry-signal.txt

  Scenario: 正常运行不误触发止损
    Tool: Bash
    Steps: 构造所有 openbbVerdict='PASS' 的 consensus
    Expected: sendStopLossAlert 不被调用
    Evidence: .sisyphus/evidence/task-3-stoploss-no-false-alarm.txt
  ```

  **Commit**: YES | Message: `fix(alert): wire stop-loss + leader SMA50 sector defense + entry signal into runtime` | Files: [src/workflows/mission-dispatcher.ts, src/worker.ts, src/agents/lifecycle/engine.ts]

---

- [ ] 4. 报告结构化强制验证层 — Report Structural Validator

  **What to do**:
  1. **创建新文件** `src/utils/report-validator.ts`（此文件不存在，需新建），导出一个报告后处理验证函数：
     ```typescript
     export interface ReportValidationResult {
       valid: boolean;
       missingFields: string[];
       warnings: string[];
     }

     export function validateReport(report: string): ReportValidationResult
     ```
     验证规则（全部基于正则/文本检测，不依赖 LLM）：
     - **驱动力标签**: 报告中必须包含以下之一：`基本面驱动`、`叙事驱动`、`政策驱动`、`Fundamental`、`Policy`、`Narrative`。缺少 → `missingFields.push('驱动力类型标签')`
     - **试探仓位**: 报告中必须出现仓位相关关键词（`仓位`、`%`、`试探`、`position`）。缺少 → `missingFields.push('仓位建议')`
     - **止损条件**: 报告中必须出现止损相关关键词（`止损`、`stop`、`风控`、`证伪`）。缺少 → `missingFields.push('止损条件')`
     - **标的代码**: 报告中必须出现至少一个 `$TICKER` 格式标注（正则: `/\$[A-Z]{1,5}\b/`）。缺少 → `missingFields.push('标的代码($TICKER)')`
     - `valid = missingFields.length === 0`
  2. **修改 `src/agents/intelligence/synthesis.ts`**（line 83-86）：
     - `import { validateReport } from '../../utils/report-validator';`
     - 在 `const report = await generateTextCompletion(...)` 之后，在 return 之前，添加：
       ```typescript
       const validation = validateReport(report);
       if (!validation.valid) {
         console.warn(`[SynthesisAgent] ⚠️ 报告结构验证失败，缺少: ${validation.missingFields.join(', ')}`);
         // 追加缺失字段警告到报告末尾
         const warning = `\n\n---\n⚠️ **报告结构验证警告**: 缺少必填字段: ${validation.missingFields.join(', ')}。请人工补充。`;
         return report + warning;
       }
       ```
     - 注意：不要 throw error（会中断整个 pipeline），而是追加警告文本并继续。

  **Must NOT do**:
  - 不要修改 LLM prompt 内容（那正是本计划要摆脱的"软约束"）
  - 不要阻断 pipeline（报告缺字段时追加警告，不要 throw）
  - 不要引入新的 LLM 调用来"修复"报告

  **Recommended Agent Profile**:
  - Category: `deep` - Reason: 需要理解报告文本格式和验证逻辑的边界条件
  - Skills: [] - 无需特殊技能
  - Omitted: [`playwright`] - 纯后端

  **Parallelization**: Can Parallel: YES | Wave 1 | Blocks: [7] | Blocked By: []

  **References**:
  - New file: `src/utils/report-validator.ts` - 本 Task 创建的新文件（当前不存在）
  - Pattern: `src/agents/intelligence/synthesis.ts:83-86` - report 生成和 return 语句（插入验证逻辑的位置）
  - Pattern: `src/agents/intelligence/synthesis.ts:59-81` - prompt 中请求的报告结构（驱动类型、操作建议等）
  - Pattern: `src/models/types.ts:51` - `narrativeType` 枚举已定义了 `Fundamental | Policy_Driven | Narrative_Hype`
  - Source of truth: `investor_profile.md` - 要求报告必须包含驱动力标签、试探仓位(5%)、止损价格

  **Acceptance Criteria**:
  - [ ] `ls src/utils/report-validator.ts` 文件存在
  - [ ] `grep -n 'validateReport' src/agents/intelligence/synthesis.ts` 确认验证器被调用
  - [ ] TypeScript 编译无错误: `npx tsc --noEmit`

  **QA Scenarios**:
  ```
  Scenario: Happy path — 完整报告通过验证
    Tool: Bash
    Steps: 调用 validateReport 传入包含所有必填字段的报告文本
    Expected: { valid: true, missingFields: [], warnings: [] }
    Evidence: .sisyphus/evidence/task-4-report-valid.txt

  Scenario: 缺少止损条件
    Tool: Bash
    Steps: 调用 validateReport 传入不含止损/stop/风控关键词的报告
    Expected: { valid: false, missingFields: ['止损条件'] }
    Evidence: .sisyphus/evidence/task-4-report-missing-stoploss.txt

  Scenario: 缺少所有必填字段
    Tool: Bash
    Steps: 调用 validateReport 传入空字符串或纯 "hello" 文本
    Expected: { valid: false, missingFields: ['驱动力类型标签', '仓位建议', '止损条件', '标的代码($TICKER)'] }
    Evidence: .sisyphus/evidence/task-4-report-all-missing.txt

  Scenario: 只有 $TICKER 但缺少其他字段
    Tool: Bash
    Steps: 调用 validateReport 传入 "分析 $AAPL 走势"
    Expected: { valid: false, missingFields 不含 '标的代码' 但包含其他3个 }
    Evidence: .sisyphus/evidence/task-4-report-partial.txt
  ```

  **Commit**: YES | Message: `feat(report): add post-LLM structural validation for mandatory fields` | Files: [src/utils/report-validator.ts, src/agents/intelligence/synthesis.ts]

---

- [ ] 5. 防卖飞引擎集成 + crowdedClimax 阶段处理 — Anti-Premature-Sell Guard + Crowded Climax

  **What to do**:
  1. **扩展 `src/agents/lifecycle/engine.ts` 的 `evaluateAllActiveNarratives` 方法**：
     - 新增 SMA50 监控：在 line 29 的 `checkSMACross(coreTicker, [20])` 改为 `checkSMACross(coreTicker, [20, 50])`
     - 提取 SMA50 结果：`const sma50 = smaResults.find(r => r.period === 50);`
     - 新增龙头健康综合判定：`const leaderHealthy = sma20?.position === 'above' && sma50?.position === 'above';`
     - 当 `mainExpansion` 阶段且 `leaderHealthy === true` 时，在 messages 中添加防卖飞标记：
       ```typescript
       messages.push(`🛡️ [ANTI_SELL_GUARD] ${coreTicker} 站稳 SMA20+SMA50，处于主升浪。任何 SELL 信号应被否决。`);
       ```
  2. **[新增 — Gap A] 补全 `crowdedClimax` 阶段跃迁逻辑**：
     - 当前 `engine.ts` 完全缺少 `crowdedClimax` 阶段的处理，而 `types.ts:38` 和 `narrative-store.ts:21` 都定义了这个阶段
     - 画像定义：`crowdedClimax`（拥挤高潮）→ 控制风险
     - 在 `engine.ts` 的阶段跃迁逻辑中（line 44 和 line 52 之间），添加 `mainExpansion` → `crowdedClimax` 的检测条件和 `crowdedClimax` 自身的跃迁逻辑：
       ```typescript
       // mainExpansion → crowdedClimax 的跃迁条件:
       // 当 SMA20 above 但 SMA50 below（均线开始收敛，趋势动能减弱）
       // 或者可以用更简单的逻辑：当 mainExpansion 阶段持续超过 N 个评估周期（时间衰减）
       else if (record.stage === 'mainExpansion') {
           if (isHealthy && sma50?.position === 'below') {
               // SMA20 还在上方但 SMA50 已跌破 → 趋势开始分化，进入拥挤高潮
               newStage = 'crowdedClimax';
               reason = `[RISK_CONTROL] 龙头 ${coreTicker} SMA20 仍上方但 SMA50 已跌破，趋势动能减弱，进入 [拥挤高潮] 阶段。请控制仓位风险！`;
           } else if (isHealthy) {
               reason = `龙头 ${coreTicker} 走势依然强劲 (站稳 20日线)。强制维持 [主升浪] 判定，不要被短期波动洗下车！`;
           } else if (isBroken) {
               newStage = 'narrativeFatigue';
               reason = `[STOP_LOSS_TRIGGER] 龙头 ${coreTicker} 跌破 20日均线生命线！自动降级为 [叙事疲劳]。建议减仓或止盈。`;
           }
       }
       // crowdedClimax 阶段的跃迁逻辑
       else if (record.stage === 'crowdedClimax') {
           if (isHealthy && sma50?.position === 'above') {
               // 两条均线都站回 → 重新进入主升浪
               newStage = 'mainExpansion';
               reason = `龙头 ${coreTicker} SMA20+SMA50 均站稳，拥挤高潮解除，回到 [主升浪]。`;
           } else if (isBroken) {
               newStage = 'narrativeFatigue';
               reason = `[STOP_LOSS_TRIGGER] 龙头 ${coreTicker} 从拥挤高潮跌破20日线，进入 [叙事疲劳]。建议立即减仓。`;
           } else {
               // SMA20 above 但 SMA50 仍 below → 维持 crowdedClimax
               reason = `⚠️ 龙头 ${coreTicker} 仍处于 [拥挤高潮]，SMA50 未收回。保持风险意识，控制仓位。`;
           }
       }
       ```
     - 当 `crowdedClimax` 阶段时，在 `antiSellGuards` 中不加入该 ticker（因为拥挤高潮阶段不应阻断卖出）
     - 在 messages 中对 `crowdedClimax` 维持状态也产出提醒消息（类似 mainExpansion 的镇痛维稳）
  3. **修改返回类型**，增加一个结构化的防卖飞信号列表：
     ```typescript
     async evaluateAllActiveNarratives(): Promise<{
       updated: number;
       messages: string[];
       antiSellGuards: Array<{ ticker: string; reason: string }>; // 新增
     }>
     ```
     当龙头健康（mainExpansion + SMA20&SMA50 above）时填充 `antiSellGuards`。`crowdedClimax` 阶段的 ticker 不加入此列表。
  4. **修改 `src/workflows/mission-dispatcher.ts`**：
     - 在 `dispatchMission` 函数中，consensus 计算之前（line 233 附近），调用 lifecycle engine：
       ```typescript
       // 防卖飞：检查龙头叙事健康状态
       const lifecycleEngine = new NarrativeLifecycleEngine();
       const { antiSellGuards } = await lifecycleEngine.evaluateAllActiveNarratives();
       ```
     - 在 `computeConsensus` 调用之后，对 consensus 结果进行防卖飞修正：
       ```typescript
       // 防卖飞修正：龙头健康时阻断 SELL
       for (const consensus of mission.consensus) {
         const guard = antiSellGuards.find(g => g.ticker === consensus.ticker);
         if (guard && (consensus.taVerdict === 'SELL' || consensus.openclawVerdict === 'SELL')) {
           consensus.vetoed = true;
           consensus.vetoReason = `🛡️ 防卖飞: ${guard.reason}`;
           eventBus.emitSystem('info', `🛡️ [ANTI_SELL] ${consensus.ticker}: TA/OC 发出 SELL 但龙头健康 → 否决清仓`);
         }
       }
       ```
     - 在文件顶部 import `NarrativeLifecycleEngine`。
  5. **修改 `src/worker.ts` 的 T3 日报 cron 中**（line 238），确保 `evaluateAllActiveNarratives()` 的新返回值（含 `antiSellGuards`）被正确解构：
     ```typescript
     const { messages, antiSellGuards } = await lifecycleEngine.evaluateAllActiveNarratives();
     ```
     在日报中追加防卖飞摘要和 crowdedClimax 风险提示（如果有的话）。

  **Must NOT do**:
  - 不要修改 TradingAgents 的 Python PM 代码
  - 不要自动执行交易操作
  - 不要移除现有的 SMA20 监控逻辑（在其基础上扩展）
  - 不要在 lifecycle engine 中引入新的外部 API 调用
  - 不要在 `crowdedClimax` 阶段的 ticker 加入 `antiSellGuards`（该阶段应允许卖出）

  **Recommended Agent Profile**:
  - Category: `deep` - Reason: 跨两个核心模块（lifecycle + mission-dispatcher）的集成 + 新增完整的 crowdedClimax 阶段逻辑，需要理解数据流和阶段状态机
  - Skills: [] - 无需特殊技能
  - Omitted: [`playwright`] - 纯后端

  **Parallelization**: Can Parallel: NO | Wave 2 | Blocks: [] | Blocked By: [2]

  **References**:
  - Pattern: `src/agents/lifecycle/engine.ts:29-70` - 完整的阶段跃迁逻辑（扩展 SMA50 + 补全 crowdedClimax）
  - Pattern: `src/agents/lifecycle/engine.ts:11` - `evaluateAllActiveNarratives` 方法签名（修改返回类型）
  - Pattern: `src/models/types.ts:34-41` - `NarrativeStageSchema` 枚举，包含全部6个阶段（earlyFermentation → emergingConsensus → mainExpansion → **crowdedClimax** → narrativeFatigue → postCollapse）
  - Pattern: `src/utils/narrative-store.ts:21` - `NarrativeRecord.stage` 类型定义，已包含 `crowdedClimax`
  - Pattern: `src/tools/market-data.ts:93` - `checkSMACross` 函数签名（确认支持 [20, 50] 数组参数）
  - Pattern: `src/workflows/mission-dispatcher.ts:233-246` - consensus 后处理位置（Task 2 的否决逻辑之后插入）
  - Pattern: `src/worker.ts:237-245` - T3 日报中 lifecycle 调用（需更新解构）
  - Dependency: Task 2 的 `vetoed` / `vetoReason` 字段和 sendMessage import — 本 Task 复用这些字段

  **Acceptance Criteria**:
  - [ ] `grep -n 'sma50\|SMA50\|period === 50' src/agents/lifecycle/engine.ts` 显示 SMA50 监控被添加
  - [ ] `grep -n 'antiSellGuards' src/agents/lifecycle/engine.ts` 确认新返回字段
  - [ ] `grep -n 'crowdedClimax' src/agents/lifecycle/engine.ts` 显示拥挤高潮阶段跃迁逻辑被实现
  - [ ] `grep -n 'ANTI_SELL' src/workflows/mission-dispatcher.ts` 确认防卖飞修正逻辑
  - [ ] `grep -n 'NarrativeLifecycleEngine' src/workflows/mission-dispatcher.ts` 确认 import
  - [ ] TypeScript 编译无错误: `npx tsc --noEmit`

  **QA Scenarios**:
  ```
  Scenario: 龙头健康 + TA 发 SELL → 否决
    Tool: Bash
    Steps: 模拟龙头 SMA20+SMA50 均 above，且 TA verdict 为 SELL
    Expected: consensus.vetoed=true, vetoReason 包含 '防卖飞'
    Evidence: .sisyphus/evidence/task-5-antisell-veto.txt

  Scenario: 龙头跌破 SMA20 + TA 发 SELL → 不干预
    Tool: Bash
    Steps: 模拟龙头 SMA20 below，TA verdict 为 SELL
    Expected: 防卖飞逻辑不触发（不影响正常止损）
    Evidence: .sisyphus/evidence/task-5-antisell-passthrough.txt

  Scenario: 龙头健康 + 双脑同意 BUY → 正常通过
    Tool: Bash
    Steps: 模拟龙头健康，OC=BUY, TA=BUY
    Expected: vetoed=false, antiSellGuard 存在但不触发否决
    Evidence: .sisyphus/evidence/task-5-antisell-agree-buy.txt

  Scenario: mainExpansion → crowdedClimax 跃迁
    Tool: Bash
    Steps: 模拟 record.stage='mainExpansion', SMA20 above, SMA50 below
    Expected: newStage='crowdedClimax', reason 包含 'RISK_CONTROL'
    Evidence: .sisyphus/evidence/task-5-crowded-climax-transition.txt

  Scenario: crowdedClimax 维持 → 风险提示
    Tool: Bash
    Steps: 模拟 record.stage='crowdedClimax', SMA20 above, SMA50 below
    Expected: 维持 crowdedClimax，messages 包含 '拥挤高潮' + '控制仓位'
    Evidence: .sisyphus/evidence/task-5-crowded-climax-hold.txt

  Scenario: crowdedClimax → mainExpansion 恢复
    Tool: Bash
    Steps: 模拟 record.stage='crowdedClimax', SMA20 above, SMA50 above
    Expected: newStage='mainExpansion'
    Evidence: .sisyphus/evidence/task-5-crowded-climax-recover.txt

  Scenario: crowdedClimax 阶段不阻断 SELL
    Tool: Bash
    Steps: 模拟 record 在 crowdedClimax 阶段，TA 发 SELL
    Expected: antiSellGuards 不包含该 ticker → SELL 不被防卖飞否决
    Evidence: .sisyphus/evidence/task-5-crowded-climax-allow-sell.txt
  ```

  **Commit**: YES | Message: `feat(lifecycle): integrate anti-sell guard + crowdedClimax stage into consensus loop` | Files: [src/agents/lifecycle/engine.ts, src/workflows/mission-dispatcher.ts, src/worker.ts]

---

- [ ] 6. 发现延迟优化 — Discovery Latency Reduction

  **What to do**:
  1. **修改 `src/worker.ts` 的 TRIGGER 4 cron 表达式**（line 263）：
     - 将 `cron.schedule('0 * * * *', ...)` 改为 `cron.schedule('*/15 * * * *', ...)`
     - 从每小时一次 → 每15分钟一次
     - 在 cron 回调开头添加去重机制，避免在同一叙事未冷却前重复分析：
       ```typescript
       // 去重：记录最近已分析的主题 hash，30分钟内不重复
       const TREND_COOLDOWN_MS = 30 * 60 * 1000;
       ```
     - 新建模块级变量 `const recentTrendHashes = new Map<string, number>();` 存储 `hash → timestamp`
     - 在 `taskQueue.enqueue` 之前检查冷却期
  2. **在 `src/agents/trend/trend-radar.ts` 的 `scan()` 方法中**添加执行时间日志：
     - 在方法开头 `const scanStart = Date.now();`
     - 在方法结尾 `console.log(\`[TrendRadar] ⏱️ 扫描完成，耗时 ${Math.round((Date.now() - scanStart) / 1000)}s\`);`
     - 这为后续延迟监控提供基线数据
  3. **在 `src/worker.ts` 中添加端到端延迟指标记录**：
     - 在 T4 cron 回调中，记录从 cron 触发到 taskQueue.enqueue 的时间：
       ```typescript
       const t4Start = Date.now();
       // ... existing scan logic ...
       const scanLatency = Date.now() - t4Start;
       eventBus.emitSystem('info', `📡 T4 趋势扫描延迟: ${Math.round(scanLatency / 1000)}s`);
       ```

  **Must NOT do**:
  - 不要引入 WebSocket 或 SSE 推送（超出当前架构复杂度）
  - 不要修改 TrendRadar Python 端的轮询逻辑
  - 不要将轮询间隔设置到5分钟以下（API rate limit 风险）

  **Recommended Agent Profile**:
  - Category: `unspecified-high` - Reason: 涉及 cron 调度和去重逻辑设计
  - Skills: [] - 无需特殊技能
  - Omitted: [`playwright`] - 纯后端

  **Parallelization**: Can Parallel: YES | Wave 1 | Blocks: [] | Blocked By: []

  **References**:
  - Pattern: `src/worker.ts:263-283` - TRIGGER 4 TrendRadar cron 配置（核心修改点）
  - Pattern: `src/agents/trend/trend-radar.ts` - `scan()` 方法（添加计时日志）
  - Pattern: `src/worker.ts:147-188` - TRIGGER 2 的 cron 模式（参考其 30分钟间隔的配置）
  - 画像要求: "第一波 0-2 倍涨幅窗口内发现" → 需降低端到端延迟

  **Acceptance Criteria**:
  - [ ] `grep -n '*/15' src/worker.ts` 显示 TrendRadar cron 已改为 15 分钟间隔
  - [ ] `grep -n 'TREND_COOLDOWN\|recentTrendHashes' src/worker.ts` 显示去重机制
  - [ ] `grep -n 'scanStart\|⏱️' src/agents/trend/trend-radar.ts` 显示计时日志
  - [ ] TypeScript 编译无错误: `npx tsc --noEmit`

  **QA Scenarios**:
  ```
  Scenario: 缩短轮询间隔生效
    Tool: Bash
    Steps: grep 确认 cron 表达式为 '*/15 * * * *'
    Expected: 匹配成功
    Evidence: .sisyphus/evidence/task-6-cron-15min.txt

  Scenario: 去重机制防止重复分析
    Tool: Bash
    Steps: 模拟连续两次相同主题的 scan 结果，第二次应被冷却期拦截
    Expected: 第二次 taskQueue.enqueue 不被调用，日志显示冷却期跳过
    Evidence: .sisyphus/evidence/task-6-dedup-cooldown.txt

  Scenario: 延迟指标正确记录
    Tool: Bash
    Steps: 检查 eventBus.emitSystem 调用包含 T4 延迟信息
    Expected: 日志输出 '📡 T4 趋势扫描延迟: Xs'
    Evidence: .sisyphus/evidence/task-6-latency-metric.txt
  ```

  **Commit**: YES | Message: `perf(discovery): reduce TrendRadar polling + pipeline latency to <20min` | Files: [src/worker.ts, src/agents/trend/trend-radar.ts]

---

- [ ] 7. 仓位纪律硬编码提醒 — Position Sizing Discipline Guard

  **What to do**:
  1. **创建新文件** `src/utils/position-guard.ts`（此文件不存在，需新建），导出仓位纪律常量和检测函数：
     ```typescript
     // 画像 line 151: 单标的上限 20%
     export const MAX_SINGLE_POSITION_PCT = 20;
     // 画像 line 152: 同时持有 5-7 只
     export const MAX_CONCURRENT_HOLDINGS = 7;
     // 画像 line 156: 试探仓位 5%
     export const PROBE_POSITION_PCT = 5;
     // 画像 line 155: 杠杆/期权禁止
     export const LEVERAGE_FORBIDDEN = true;

     export interface PositionAdvice {
       suggestedSizePct: number;  // 建议仓位百分比
       warnings: string[];        // 纪律提醒
     }

     /**
      * 根据信号类型返回仓位建议和纪律提醒
      * @param signalType - 'entry_agree' (双脑共识) | 'probe' (试探仓位) | 'add' (加仓)
      * @param narrativeStage - 当前叙事阶段
      */
     export function getPositionAdvice(
       signalType: 'entry_agree' | 'probe' | 'add',
       narrativeStage?: string
     ): PositionAdvice
     ```
     逻辑：
     - `signalType === 'probe'` → `suggestedSizePct = 5`, warnings: `['⚠️ 试探仓位，严格5%上限']`
     - `signalType === 'entry_agree'` → `suggestedSizePct = 10`, warnings: `['⚠️ 单标的不超过20%总仓位', '⚠️ 同时持有不超过7只']`
     - `signalType === 'add'` 且 `narrativeStage === 'mainExpansion'` → `suggestedSizePct = 15`, warnings: `['⚠️ 加仓后确保单标的不超过20%', '⚠️ 禁止杠杆和期权']`
     - 任何情况都附加: `['📋 画像纪律: 纯股票策略，永远不全仓一只股票']`
  2. **修改 `src/agents/intelligence/synthesis.ts`**：
     - `import { getPositionAdvice, MAX_SINGLE_POSITION_PCT } from '../../utils/position-guard';`
     - 在报告生成（`generateTextCompletion` 调用后），在 Task 4 的 `validateReport` 调用之前或之后，追加仓位纪律提示到报告末尾：
       ```typescript
       const posAdvice = getPositionAdvice('entry_agree');
       const positionReminder = `\n\n---\n📋 **仓位纪律提醒**\n${posAdvice.warnings.join('\n')}\n建议仓位: ${posAdvice.suggestedSizePct}%`;
       report += positionReminder;
       ```
  3. **修改 Task 3 中新增的入场信号推送**（`sendEntrySignal` 调用处）：
     - 在 `src/workflows/mission-dispatcher.ts` 中，入场信号的 details 参数中嵌入仓位纪律提示：
       ```typescript
       import { getPositionAdvice } from '../utils/position-guard';
       // 在 sendEntrySignal 调用处
       const posAdvice = getPositionAdvice('entry_agree');
       await sendEntrySignal(entry.ticker,
         `双脑共识: ${entry.openclawVerdict}\n` +
         `OpenBB: ${entry.openbbVerdict}\n` +
         `建议仓位: ${posAdvice.suggestedSizePct}%\n` +
         posAdvice.warnings.join('\n')
       );
       ```
     - 注意：这与 Task 3 修改同一文件，但 Task 7 在 Wave 1 而 Task 3 在 Wave 2。解决方案：Task 7 只创建 `position-guard.ts` 新文件 + 修改 `synthesis.ts`。Task 3 执行时再在 `mission-dispatcher.ts` 中使用 `position-guard` 的函数。

  **Must NOT do**:
  - 不要实现自动仓位控制/自动下单（系统是情报系统，仓位由用户自己管理）
  - 不要在 position-guard 中引入外部 API 或真实持仓数据（纯规则提示）
  - 不要修改 `interactive-bot.ts` 中现有的 prompt 文本（那里的仓位描述保留不动）

  **Recommended Agent Profile**:
  - Category: `quick` - Reason: 新建一个纯逻辑文件 + synthesis.ts 小改动，无复杂依赖
  - Skills: [] - 无需特殊技能
  - Omitted: [`playwright`] - 纯后端

  **Parallelization**: Can Parallel: YES (with Task 3/5 in Wave 2, NOT with Task 4) | Wave 2 | Blocks: [] | Blocked By: [4]

  **References**:
  - New file: `src/utils/position-guard.ts` - 本 Task 创建的新文件（当前不存在）
  - Pattern: `src/agents/intelligence/synthesis.ts:83-86` - report 生成和 return 语句
  - Pattern: `src/agents/telegram/interactive-bot.ts:69` - 现有 prompt 中的仓位纪律描述（参考但不修改）
  - Source of truth: `investor_profile.md:147-156` - 仓位管理规则完整定义

  **Acceptance Criteria**:
  - [ ] `ls src/utils/position-guard.ts` 文件存在
  - [ ] `grep -n 'MAX_SINGLE_POSITION_PCT\|PROBE_POSITION_PCT' src/utils/position-guard.ts` 显示常量定义
  - [ ] `grep -n 'getPositionAdvice\|position-guard' src/agents/intelligence/synthesis.ts` 确认被调用
  - [ ] `grep -n '仓位纪律' src/agents/intelligence/synthesis.ts` 确认提醒文本被追加
  - [ ] TypeScript 编译无错误: `npx tsc --noEmit`

  **QA Scenarios**:
  ```
  Scenario: 入场共识 → 返回正确仓位建议
    Tool: Bash
    Steps: 调用 getPositionAdvice('entry_agree')
    Expected: suggestedSizePct=10, warnings 包含 '单标的不超过20%'
    Evidence: .sisyphus/evidence/task-7-position-entry.txt

  Scenario: 试探仓位 → 返回5%
    Tool: Bash
    Steps: 调用 getPositionAdvice('probe')
    Expected: suggestedSizePct=5, warnings 包含 '试探仓位'
    Evidence: .sisyphus/evidence/task-7-position-probe.txt

  Scenario: 主升浪加仓 → 15%但有上限提醒
    Tool: Bash
    Steps: 调用 getPositionAdvice('add', 'mainExpansion')
    Expected: suggestedSizePct=15, warnings 包含 '不超过20%' + '禁止杠杆'
    Evidence: .sisyphus/evidence/task-7-position-add.txt

  Scenario: 报告末尾包含仓位纪律提醒
    Tool: Bash
    Steps: 模拟完整 synthesis 流程，检查报告输出
    Expected: 报告末尾包含 '仓位纪律提醒' 和 '建议仓位'
    Evidence: .sisyphus/evidence/task-7-report-position-reminder.txt
  ```

  **Commit**: YES | Message: `feat(position): add position sizing discipline guard with report integration` | Files: [src/utils/position-guard.ts, src/agents/intelligence/synthesis.ts]

---

## Test Infrastructure Setup (前置任务 — 所有 Task 共享)

> 当前项目 `package.json` 的 test script 是 `echo "Error: no test specified" && exit 1`，无 vitest。
> 每个 Task 的 QA 场景使用 `npx ts-node` 一次性脚本执行验证，无需正式测试框架。
> 如果后续需要正式化测试，可在 Final Verification Wave 中追加 vitest 配置任务。

## Final Verification Wave

- [ ] F1. Plan Compliance Audit — oracle
- [ ] F2. Code Quality Review — unspecified-high
- [ ] F3. Real Manual QA — unspecified-high (+ playwright if UI)
- [ ] F4. Scope Fidelity Check — deep

## Commit Strategy

每个 Task 独立一个 atomic commit：
1. `fix(filter): unify market-cap gate to $200M-$50B across all pipelines`
2. `feat(consensus): enforce right-side veto when dual-brain disagrees`
3. `fix(alert): wire stop-loss + leader SMA50 sector defense + entry signal into runtime`
4. `feat(report): add post-LLM structural validation for mandatory fields`
5. `feat(lifecycle): integrate anti-sell guard + crowdedClimax stage into consensus loop`
6. `perf(discovery): reduce TrendRadar polling + pipeline latency to <20min`
7. `feat(position): add position sizing discipline guard with report integration`

## Success Criteria

| GAP | 画像要求 | 代码现状 | 修复后验证命令 |
|-----|---------|---------|--------------|
| 1 | 市值 $200M-$50B | 三处不一致（$300M-$100B / 只过滤>$500B / 无过滤） | `grep -rn 'MARKET_CAP' src/utils/market-cap-gate.ts` 显示统一常量 |
| 2 | 右侧跟风纪律 | 共识 disagree 仅打标签 | 单元测试断言 disagree 时触发 veto 事件 |
| 3 | 止损 URGENT 推送 | sendStopLossAlert 从未被调用 | `grep -rn 'sendStopLossAlert(' src/` 显示至少3个运行时调用点 |
| 3+ | 龙头 SMA50 跌破5% 板块止损 | 仅在 prompt 字符串中 | `grep -n 'LEADER_TICKERS\|板块止损' src/worker.ts` 显示硬编码检测 |
| 3+ | 入场信号推送 | sendEntrySignal 从未被调用 | `grep -rn 'sendEntrySignal(' src/` 显示至少1个运行时调用点 |
| 4 | 报告标注驱动力类型+试探仓位+止损价 | 全靠 Prompt | 验证器测试：缺少字段时断言抛错 |
| 5 | 龙头 SMA 健康时阻断清仓 | 引擎输出未注入决策流 | 集成测试：模拟龙头健康+TA发SELL → 断言 SELL 被阻断 |
| 5+ | crowdedClimax 拥挤高潮阶段处理 | types.ts 定义了但 engine.ts 无对应逻辑 | `grep -n 'crowdedClimax' src/agents/lifecycle/engine.ts` 显示跃迁逻辑 |
| 6 | 第一波 0-2 倍涨幅窗口内发现 | 轮询间隔60分钟 | 端到端延迟基线测试 <20min |
| 7 | 单标的20%仓位上限 | 仅在 interactive-bot prompt 中 | `grep -n 'MAX_SINGLE_POSITION_PCT' src/utils/position-guard.ts` 显示硬编码常量 |

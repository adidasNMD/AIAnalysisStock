# Sineige Alpha Engine 系统改造总方案

分支：`codex/system-redesign-plan`

本文档基于当前仓库真实实现制定，目标不是抽象地“重构一下”，而是在不打断现有能力的前提下，把系统从“强大的实验型操作台”升级成“可维护、可扩展、可观测的产品级情报平台”。

---

## 1. 背景与结论

当前系统已经具备非常强的核心能力：

- 有真实的多服务拓扑：OpenClaw、OpenBB、TradingAgents、TrendRadar、Dashboard。
- 有真实的任务调度、SSE 日志流、SQLite 持久化、报告归档、Telegram 推送。
- 有可用的任务时间线、任务详情、趋势雷达、监控池、设置页等前端入口。

但系统目前的主要瓶颈已经不再是“功能不够多”，而是以下三类问题：

1. 任务对象模型不统一
2. 服务运行与任务执行的可靠性边界不清晰
3. 前端交互更像面向操作者的控制台，而不是面向决策的产品

一句话判断：

> 当前系统已经证明了“AI 驱动的事件-叙事-量化联动”方向成立，下一阶段最值得投入的是统一任务模型、重构任务与证据流、重建前端信息架构，并补上工程化基础设施。

---

## 2. 当前系统的核心问题

### 2.1 任务生命周期被拆成两套系统

相关实现：

- `POST /api/missions` 在 `src/server/app.ts` 中返回一个假的 `pending_*` mission id，但实际只是把请求再次塞进旧的 `taskQueue`
- 真正的 mission 对象是在 `dispatchMission()` 中临时创建并写入 `out/missions`
- `CommandCenter` 发的是 mission，但 UI 展示运行态时读取的是 queue

这会带来几个直接问题：

- 前端无法在提交后拿到真实 mission id 并跳转到任务详情
- “任务”和“mission”是两个概念，用户心智混乱
- queue 状态与 mission 状态可能分叉
- 后续所有日志、重试、取消、部分完成、重新运行都很难做干净

### 2.2 任务执行层可靠性还停留在单节点实验级

当前已有基础：

- SQLite 持久化 queue
- 任务恢复 `recover()`
- 最大并发控制
- 取消标记

但还有明显短板：

- `cancelTask()` 只改数据库状态，不是真正的可传播取消
- 长链路任务没有“租约 / heartbeat / 重试 / 死信”
- 任务、mission、trace、report 之间缺乏统一关联 id 设计
- 外部依赖异常时只存在“成功/失败”的粗粒度语义，缺少“部分成功”“服务降级”“数据过期”等中间态

### 2.3 API 层过于集中，边界模糊

`src/server/app.ts` 当前承担了过多职责：

- mission API
- queue API
- health/diagnostics
- trendradar 数据访问
- config 读写
- report/trace 文件访问
- SSE 事件流

这会导致：

- 路由与领域逻辑耦合
- 修改一个领域容易影响其他领域
- 难以做独立测试
- 后续扩展权限、版本控制、分页、缓存策略都不顺

### 2.4 事件流与监听器管理存在隐患

`eventBus.cleanupMission()` 当前的实现是全局式移除 listener，而不是 mission 级、请求级的精准释放。

风险：

- 未来并发用户增加后，可能出现 listener 生命周期不可预期
- SSE 链路与内部 event bus 之间没有清晰的订阅边界
- 后续若新增更多流式通道，会越来越难维护

### 2.5 前端信息架构不够“决策导向”

目前 dashboard 的优点是内容丰富、观测面广，但主要问题是：

- 首页不是“今天应该看什么”，而是“系统现在在跑什么”
- 任务发起、任务跟踪、任务结论、可执行建议分散在多个页面
- 前端同时使用 SSE 和多组轮询，状态来源碎片化
- 页面明显偏大屏控制台，响应式不足

具体表现：

- `CommandCenter` 更像调度台，不像产品首页
- `MissionTimeline` 是历史流水，不是决策收件箱
- `MissionViewer` 内容深，但“结论层”不够前置
- `TrendRadarHub` 中的完整 HTML 报告 iframe 很重，缺少摘要层

### 2.6 配置、启动与验证链路还不够稳定

当前问题：

- `start-all.sh` 假设多个本地环境存在，路径耦合强
- Docker 与本地脚本两套启动路径并存，但缺少统一的“主路线”
- 根目录 `npm test` 目前在本工作区无法执行，说明依赖一致性存在缺口
- 健康检查很多是基于日志或配置推断，不是强语义探测

---

## 3. 改造目标

本轮改造的总体目标分成四层。

### 3.1 产品目标

- 让用户可以用一个统一对象理解系统：`Mission`
- 把首页变成“信号收件箱 + 今日重点”
- 让任务从“发起 -> 处理中 -> 富化 -> 结论 -> 归档”全程可追踪
- 让任何一个结论都能回答：为什么得出、基于哪些证据、哪些服务参与了、哪些环节降级了

### 3.2 架构目标

- 统一任务模型与执行模型
- API 按领域拆分
- 后端模块边界清晰
- 前端状态源统一

### 3.3 工程目标

- 建立可迁移的数据结构
- 建立分阶段可回滚的重构路径
- 建立可观测、可测试、可诊断的执行链路

### 3.4 运营目标

- 更容易定位失败原因
- 更容易看出服务是否真的健康
- 更容易从“海量原始信号”提炼成“少量高价值任务”

---

## 4. 目标架构

本轮建议采用“Mission 中心化”的新架构。

### 4.1 核心领域对象

建议引入以下稳定领域对象：

#### Mission

代表一次用户可理解的完整分析任务。

建议字段：

- `id`
- `mode`: `explore | analyze | review`
- `query`
- `source`
- `priority`
- `requestedDepth`
- `status`
- `createdAt`
- `updatedAt`
- `submittedBy`
- `summary`
- `primaryThemeId`
- `latestRunId`

#### MissionRun

代表 mission 的一次具体执行实例，用于支持重试、重新运行、回放。

建议字段：

- `id`
- `missionId`
- `status`
- `stage`
- `workerLeaseId`
- `attempt`
- `startedAt`
- `heartbeatAt`
- `completedAt`
- `failureCode`
- `failureMessage`
- `degradedFlags`

#### EvidenceBundle

代表一次执行中采集或生成的证据集。

建议字段：

- `id`
- `missionRunId`
- `openclawReport`
- `openclawStructuredVerdicts`
- `openclawTickers`
- `openbbSnapshots`
- `taResults`
- `macroSnapshot`
- `serviceHealthAtRun`
- `completeness`

#### TickerCandidate

代表 mission 中的候选标的。

建议字段：

- `id`
- `missionRunId`
- `ticker`
- `sourceStage`
- `rank`
- `openclawVerdict`
- `taVerdict`
- `openbbVerdict`
- `consensus`
- `actionability`
- `blockedReason`

#### Theme

代表叙事 / 主题本体，连接 narrative memory 和具体任务。

建议字段：

- `id`
- `title`
- `normalizedTitle`
- `coreTicker`
- `status`
- `stage`
- `firstSeenAt`
- `lastSeenAt`
- `evidenceCount`
- `latestMissionId`

#### AlertEvent

统一记录 Telegram、站内 signal、风控警报等。

建议字段：

- `id`
- `missionRunId`
- `ticker`
- `type`
- `severity`
- `channel`
- `status`
- `message`
- `sentAt`

### 4.2 目标状态机

当前 `MissionStatus` 过于扁平，建议改为显式状态机。

建议 mission 状态：

- `queued`
- `claiming`
- `running_openclaw`
- `running_enrichment`
- `running_consensus`
- `partially_completed`
- `completed`
- `failed`
- `canceled`
- `stale`

建议 run stage：

- `bootstrap`
- `scout`
- `normalize`
- `analyze`
- `strategize`
- `debate`
- `synthesize`
- `enrich_openbb`
- `enrich_ta`
- `consensus`
- `publish`

### 4.3 数据流重构

目标数据流：

1. UI/API 创建 mission
2. 后端立即生成真实 `missionId`
3. queue 只负责任务领取与执行，不再代表产品对象
4. worker 领取 `missionRun`
5. OpenClaw 产出主报告和 ticker candidates
6. OpenBB / TradingAgents / macro 并行富化
7. consensus 计算统一写入 candidate/evidence
8. publish 层决定 Telegram / UI signal / report archive
9. SSE/轮询统一围绕 `missionId` 输出

### 4.4 API 分层

建议拆成以下路由模块：

- `routes/missions.ts`
- `routes/mission-runs.ts`
- `routes/evidence.ts`
- `routes/themes.ts`
- `routes/watchlist.ts`
- `routes/trendradar.ts`
- `routes/config.ts`
- `routes/diagnostics.ts`
- `routes/alerts.ts`

建议拆出 service 层：

- `services/mission-service.ts`
- `services/run-service.ts`
- `services/evidence-service.ts`
- `services/theme-service.ts`
- `services/diagnostics-service.ts`

建议拆出 repository 层：

- `repositories/mission-repo.ts`
- `repositories/run-repo.ts`
- `repositories/theme-repo.ts`
- `repositories/alert-repo.ts`

---

## 5. 数据层改造方案

### 5.1 数据库存储策略

当前使用 SQLite 是可以接受的，短期不建议直接迁移到 Postgres。

原因：

- 当前是单机/单节点操作平台
- SQLite 足够支撑任务队列、mission 元数据、叙事和配置
- 重点问题不在数据库类型，而在领域建模和状态语义

建议：

- 继续保留 SQLite
- 引入 schema migration 管理
- 把 `tasks` 表升级为更清晰的 `missions` + `mission_runs`

### 5.2 新表建议

建议新增：

- `missions`
- `mission_runs`
- `mission_candidates`
- `mission_events`
- `mission_artifacts`
- `themes`
- `theme_events`
- `alerts`
- `service_probes`

### 5.3 文件系统归档策略

当前 `out/` 目录继续保留，但角色要降级为“归档层”，而不是“主状态源”。

建议原则：

- 数据库是真实状态源
- `out/` 是导出和调试材料
- 任意 report/trace 文件都必须能回溯到 `missionRunId`

建议目录：

- `out/missions/{date}/{missionRunId}/report.md`
- `out/missions/{date}/{missionRunId}/trace.json`
- `out/missions/{date}/{missionRunId}/decision-trail.md`
- `out/debug/{date}/{missionRunId}.json`

---

## 6. 后端改造方案

### 6.1 queue 改造

目标：让 queue 变成“执行层基础设施”，而不是“产品层对象”。

改造点：

- queue 入参改为 `missionRunId`
- worker 领取任务时写 lease 与 heartbeat
- 新增可中断执行上下文 `ExecutionContext`
- 所有长耗时调用接受取消检查函数

建议新增结构：

```ts
interface ExecutionContext {
  missionId: string;
  missionRunId: string;
  signal: AbortSignal;
  isCanceled: () => Promise<boolean>;
  heartbeat: () => Promise<void>;
  emit: (event: MissionEvent) => Promise<void>;
}
```

### 6.2 Mission Orchestrator 改造

当前 `dispatchMission()` 已经承担了事实上的统一 orchestrator 角色，建议保留思路，但改造边界。

建议拆分：

- `mission-dispatcher.ts`: 只负责任务编排
- `openclaw-runner.ts`: 只负责 OpenClaw pipeline 执行
- `enrichment-runner.ts`: 只负责 OpenBB / TA / macro 富化
- `consensus-runner.ts`: 只负责共识合成
- `publish-runner.ts`: 只负责 alert/report/event 输出

### 6.3 服务降级语义

建议所有运行结果统一携带 completeness：

- `complete`
- `partial_openbb_missing`
- `partial_ta_missing`
- `partial_macro_missing`
- `degraded_openclaw_fallback`
- `degraded_publish_failed`

UI 不再只显示“完成/失败”，而要显示“完成但量化富化缺失”等更真实状态。

### 6.4 diagnostics 改造

建议把 diagnostics 从“静态检查”升级成“真实探针”：

- OpenClaw：API ready + db write/read smoke test
- OpenBB：health + 一个低成本行情请求 latency
- TradingAgents：health + 队列 backlog 或平均耗时
- TrendRadar：最近数据库更新时间 + 最近成功运行时间 + 最近日志级别统计
- LLM：配置存在 + 一条超轻量 test prompt 可选探针

---

## 7. 前端重构方案

### 7.1 信息架构重组

建议从“页面按内部模块分”转成“页面按用户任务分”。

建议一级结构：

- `Today`
  - 今日重点信号
  - 最新可执行机会
  - 服务异常与风险提示
- `Missions`
  - 任务列表
  - 任务详情
  - 重跑 / 取消 / 查看证据
- `Themes`
  - 叙事主题
  - 主题演化轨迹
  - 主题关联标的
- `Radar`
  - TrendRadar 摘要
  - 原始信号透视
- `Watchlist`
  - 静态池
  - 动态池
- `Ops`
  - 服务诊断
  - 配置管理

### 7.2 首页重构

新增 `Today` 页面作为默认 landing page，替代当前 `CommandCenter` 的产品首页角色。

首页建议区块：

- `Top Signals`
- `New Themes`
- `Running Missions`
- `Degraded Services`
- `Needs Attention`
- `Recent Decisions`

### 7.3 Command Center 角色调整

`CommandCenter` 不应再承担首页职责，而应改成“分析发起器”。

建议：

- 保留 explore / analyze 模式
- 提交后立即跳转到真实 mission 详情页
- 发起区旁边显示最近 5 个相关任务建议，而不是原始日志流

### 7.4 Mission Viewer 重构

目标：把“结论层”前置，把“证据层”分层展开。

建议布局：

1. 顶部结论卡
   - 最终建议
   - 可信度
   - 服务完整度
   - 主要风险
2. 候选 ticker 对比卡
3. 双脑共识卡
4. 关键证据摘要
5. 原始 trace / 原始 markdown / 原始报告

### 7.5 前端数据层统一

当前问题：

- 不同页面各自轮询
- 有的走 API_BASE，有的硬写 localhost
- SSE 与 polling 缺乏统一抽象

建议：

- 引入 TanStack Query
- 所有 API 调用统一走 `dashboard/src/api.ts`
- SSE 只负责 mission live events
- 其余数据使用 query cache + invalidation

### 7.6 响应式与布局策略

建议至少支持三档：

- Desktop Workstation
- Laptop Compact
- Mobile Review

最低要求：

- sidebar 可折叠
- 核心卡片可堆叠
- 报告 iframe 在小屏改成“摘要 + 打开新页”

---

## 8. 观测与运营能力方案

### 8.1 事件模型

建议把所有状态变化写入 `mission_events`：

- mission created
- run claimed
- stage entered
- stage completed
- service degraded
- candidate added
- consensus computed
- alert sent
- run failed

这样可以同时服务：

- 时间线
- 审计
- 诊断
- 调试
- 将来的 replay

### 8.2 关键指标

建议引入以下指标：

- mission submit-to-start latency
- mission total duration
- openclaw duration
- openbb success rate
- TA success rate
- partial completion rate
- alert send failure rate
- TrendRadar freshness
- stale mission count

### 8.3 统一健康视图

建议把健康状态分成：

- `healthy`
- `degraded`
- `stale`
- `offline`

而不是简单在线/离线。

---

## 9. 测试策略

### 9.1 当前测试问题

当前已经有不错的测试意图，但仍存在不足：

- queue / worker 等单点测试较多
- 缺少真正覆盖 mission 生命周期的集成测试
- 缺少前端页面级交互测试
- 缺少 API contract 测试

### 9.2 建议测试分层

#### 单元测试

- mission state machine
- run lease / heartbeat
- consensus 规则
- narrative/theme 关联逻辑
- diagnostics service

#### 集成测试

- create mission -> queue claim -> run -> evidence persist -> mission detail read
- partial OpenBB failure
- TA offline
- cancel mission
- rerun mission

#### API 合约测试

- `/api/missions`
- `/api/missions/:id`
- `/api/missions/:id/events`
- `/api/themes`
- `/api/diagnostics`

#### 前端测试

- Today 页面渲染
- mission 提交后跳转
- mission 状态更新
- degraded badge 显示
- mobile sidebar collapse

### 9.3 工具链建议

- 修复根项目 test 环境一致性
- 保留 Vitest
- 前端补充 React Testing Library
- 若未来需要，可加入 Playwright 做核心路径 E2E

---

## 10. 分阶段实施方案

本次改造建议拆成 5 个阶段，避免一次性大爆炸。

### Phase 0：稳定基线

目标：

- 修复测试/构建一致性
- 明确唯一主启动路径
- 添加 preflight/doctor

产出：

- `npm test` 可运行
- `docker compose up --build` 作为主推荐路径
- `scripts/doctor.*`

### Phase 1：任务模型统一

目标：

- 引入 `missions` 和 `mission_runs`
- `POST /api/missions` 返回真实 mission id
- queue 以 `missionRunId` 为执行目标

产出：

- 新数据库 migration
- 新 repository/service 层
- mission API 改造

### Phase 2：执行链路重构

目标：

- execution context
- heartbeat / lease / cancel propagation
- partial completion 语义

产出：

- 新 orchestrator 模块拆分
- 统一 mission events
- service degradation flags

### Phase 3：前端信息架构重构

目标：

- 新增 Today 页面
- Command Center 降级为发起器
- Mission Viewer 重构
- 数据层统一

产出：

- 新路由结构
- query cache 层
- mission live event 订阅

### Phase 4：叙事与主题中心化

目标：

- narrative store 升级为 theme 中心模型
- mission 与 theme 绑定
- 主题视图和主题时间线

产出：

- `themes` 相关表与 API
- Theme 页面
- 主题摘要能力

### Phase 5：观测与运维强化

目标：

- 真实探针
- 统一 ops 页面
- 指标面板

产出：

- diagnostics service 重构
- `service_probes` 表
- ops dashboard

---

## 11. 任务拆分建议

为了避免多人或多轮改造互相覆盖，建议按工作流拆分。

### Workstream A：数据模型与后端骨架

范围：

- db migration
- repository
- service layer
- mission API

### Workstream B：执行引擎

范围：

- queue
- worker
- dispatcher
- cancellation
- mission events

### Workstream C：前端数据层与信息架构

范围：

- API client 统一
- Today 页面
- Mission 详情重构
- query cache

### Workstream D：诊断与运维

范围：

- health probe
- diagnostics service
- service status UI

### Workstream E：测试与开发体验

范围：

- test env
- integration tests
- doctor/preflight
- build consistency

---

## 12. 风险与规避方案

### 风险 1：重构期间旧数据无法兼容

规避：

- 保留旧 `tasks` 表只读兼容一段时间
- migration 时做增量而非替换
- 提供 data backfill 脚本

### 风险 2：前后端同时重构导致页面失效

规避：

- API 增量新增，不先删旧接口
- 前端以 feature flag 或路由级切换过渡

### 风险 3：执行链路重构后导致任务卡住

规避：

- Phase 2 前先补集成测试
- 引入 heartbeat watchdog
- 增加 stuck-run recovery 脚本

### 风险 4：过度设计拖慢交付

规避：

- 坚持 SQLite，不先换数据库
- 不在本轮引入 auth、多租户、复杂权限
- 优先完成 mission 模型统一和首页重构

---

## 13. 本轮明确不做的事情

为了保证节奏，本轮建议不纳入：

- 多租户系统
- 用户认证与 RBAC
- 云端分布式调度
- 全量迁移到 Postgres
- 引入消息队列中间件
- 完整 portfolio management 子系统

这些方向未来可以做，但不是当前收益最高的改造点。

---

## 14. 验收标准

当以下条件成立时，视为本轮重构成功。

### 14.1 用户体验验收

- 用户提交任务后立即拿到真实 mission id
- 首页能直接看到“今天该看什么”
- mission 详情页先显示结论，再显示证据
- 页面在 laptop 宽度下仍然可用

### 14.2 后端验收

- queue 与 mission 不再是两套对象模型
- 任务可取消、可重试、可识别部分成功
- mission/run/event/evidence 之间可追踪

### 14.3 诊断验收

- 健康页能区分健康、降级、过期、离线
- 至少能定位 OpenBB、TA、TrendRadar 哪个环节异常

### 14.4 工程验收

- 构建通过
- 测试可执行
- 关键 mission 生命周期具备集成测试

---

## 15. 建议的第一批实际改造顺序

如果马上开始做，我建议严格按下面顺序推进：

1. 修复 test/build/dev consistency
2. 引入 `missions` / `mission_runs` 数据结构
3. 改 `POST /api/missions` 返回真实 mission id
4. queue 改成基于 `missionRunId`
5. 新增 mission events
6. 前端提交后跳 mission 详情页
7. 新增 Today 页面
8. Mission Viewer 前置结论层
9. diagnostics service 重构
10. theme 中心模型升级

---

## 16. 最终建议

本系统已经非常接近一个有差异化价值的产品雏形，真正需要的不是继续堆更多 agent，而是把已有能力重新编织成一个稳定、统一、可信的系统。

最重要的改造抓手只有两个：

1. 以 `Mission` 为中心统一整个后端执行模型
2. 以前端“决策流”重构整个用户界面

只要这两个抓手落下去，后续无论是扩展主题追踪、加组合管理、做历史回放，还是引入更多信号源，系统都会明显更顺。


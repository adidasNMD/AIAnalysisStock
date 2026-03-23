# 🦅 OpenClaw V4 — 供应链异动雷达 + 铁血风控哨兵

> **不拼速度，拼深度推演。做趋势的第二位，而非第一位。**

一套面向事件驱动型右侧套利交易者的 AI 多智能体分析系统。核心武器是顶级大模型（GPT-4o / Claude）的深度产业链推理能力，而非高频量化速度。

---

## ⚡ 核心能力

| 模块 | 功能 | 数据源 |
|---|---|---|
| 📈 实时行情 | 价格/成交量/SMA均线/放量突破/跳空检测 | Yahoo Finance (免费) |
| 🏛️ 政策事件 | 白宫/NRC核管会/DOE能源部公告监控 | RSS (免费) |
| 📄 IPO 追踪 | S-1/424B 文件监控 | SEC EDGAR (免费) |
| 🧠 产业链推导 | 两阶段 LLM 动态分析 (第一层→第二层→第三层洼地) | GPT-4o / Claude |
| 👥 多角度验证 | 7 位市场角色并发辩论 (技术/宏观/空头/量化...) | GPT-4o / Claude |
| 💾 叙事记忆 | 跨天追踪同一叙事演化 + 增量更新 | 本地 JSON |
| 📱 实时推送 | 🔴止损/🟠入场/🟡信息 分级通知 | Telegram Bot (免费) |

## 🎯 Watchlist 标的

| 赛道 | 标的 |
|---|---|
| 光通信 | AAOI · LITE |
| 存储 | WDC · MU |
| 核电 | SMR · OKLO · CEG |
| AI 云 | CRWV (CoreWeave) |
| AI 应用 | PL (Planet Labs) |

## 🏗️ 架构

```
数据层 (免费API)      触发层 (三级哨兵)      大脑层 (AI推理)
┌──────────────┐    ┌──────────────┐    ┌──────────────────┐
│Yahoo Finance │    │5min 价量扫描  │    │DataScout 情报过滤 │
│SEC EDGAR     │───▶│15min RSS+EDGAR│───▶│LeadAnalyst 提纯   │
│政府 RSS      │    │08:30 全量日报 │    │QuantStrat 产业链  │
│Desearch/Web  │    └──────────────┘    │Council x7 辩论    │
└──────────────┘                        │Arbitrator 汇总    │
                                        └────────┬─────────┘
       记忆层                                     │
┌──────────────┐                        ┌────────▼─────────┐
│narratives.json│◀──────回写─────────────│Telegram Bot 推送  │
│supply_chain   │                       │out/reports/ 归档  │
└──────────────┘                        └──────────────────┘
```

## 🚀 快速开始

```bash
# 安装依赖
npm install

# 配置环境变量
cp .env.example .env
# 编辑 .env 填入你的 API Key 和 Telegram Bot Token

# 启动哨兵模式（后台自动扫描）
npm run daemon

# 手动立刻扫描 Watchlist
npm run daemon -- --run-now

# 手动触发深度分析
npm run daemon -- --run-now --deep "AI数据中心光互联瓶颈"
```

## ⚙️ 环境变量

| 变量 | 说明 |
|---|---|
| `LLM_API_KEY` | OpenAI / Claude API Key |
| `LLM_BASE_URL` | API 端点 (默认 OpenAI) |
| `LLM_MODEL` | 模型名 (推荐 gpt-4o) |
| `DESEARCH_API_KEY` | X/Twitter 搜索 |
| `TELEGRAM_BOT_TOKEN` | Telegram Bot Token |
| `TELEGRAM_CHAT_ID` | 你的 Telegram Chat ID |

## 📁 项目结构

```
src/
├── agents/
│   ├── core/agent.ts          # 自治智能体基类
│   ├── swarm/
│   │   ├── scout.ts           # DataScout 情报搜集
│   │   ├── analyst.ts         # LeadAnalyst 事件提纯
│   │   ├── strategist.ts      # QuantStrategist 产业链推导
│   │   └── council.ts         # Council 7角色辩论
│   └── intelligence/
│       ├── debate.ts          # Arbitrator 仲裁
│       ├── synthesis.ts       # 报告合成器
│       └── extractor.ts       # 事件结构化提取
├── tools/
│   ├── market-data.ts         # Yahoo Finance 行情
│   ├── rss-monitor.ts         # 政府 RSS 监控
│   ├── edgar-monitor.ts       # SEC EDGAR 监控
│   ├── desearch.ts            # X/Twitter 搜索
│   └── firecrawl.ts           # Web 爬虫
├── utils/
│   ├── llm.ts                 # 大模型统一接口
│   ├── telegram.ts            # Telegram 推送
│   ├── narrative-store.ts     # 叙事持久化
│   └── storage.ts             # 报告归档
├── workflows/
│   └── swarm-pipeline.ts      # V4 主流水线
├── worker.ts                  # 三级触发哨兵
└── models/types.ts            # Zod 数据模型
data/
├── watchlist.json             # 自选股 + 事件源配置
└── supply_chain.json          # 产业链种子图谱
```

---

*Built with TypeScript · Powered by GPT-4o / Claude · Data from Yahoo Finance & SEC EDGAR*

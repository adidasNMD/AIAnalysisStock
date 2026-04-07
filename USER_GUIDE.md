# 🧬 Sineige Alpha Intelligence Engine — 使用说明书

> 一套集成了 40+ 全球消息源、AI 深度筛选、多 Agent 投研辩论的自动化投研系统。

---

## 📋 目录

1. [系统架构总览](#1-系统架构总览)
2. [一键启动](#2-一键启动)
3. [手动逐个启动](#3-手动逐个启动)
4. [日常使用流程](#4-日常使用流程)
5. [访问入口一览](#5-访问入口一览)
6. [消息源清单](#6-消息源清单)
7. [API 密钥配置](#7-api-密钥配置)
8. [常见问题](#8-常见问题)

---

## 1. 系统架构总览

```
┌─────────────────────────────────────────────────────────────┐
│                    浏览器访问入口                              │
│                 http://localhost:5173                        │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐    │
│  │ 指挥中心  │  │ 情报雷达  │  │ 任务时线  │  │ 系统设置  │    │
│  └────┬─────┘  └────┬─────┘  └────┬─────┘  └────┬─────┘    │
└───────┼─────────────┼────────────┼──────────────┼───────────┘
        │             │            │              │
        ▼             ▼            ▼              ▼
┌─────────────────────────────────────────────────────────────┐
│           OpenClaw 核心调度引擎 (Node.js)                     │
│                 http://localhost:3000                        │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐                   │
│  │ RSS代理   │  │ 报告API  │  │ 任务调度  │                   │
│  │(X/Reddit) │  │(HTML嵌入)│  │(Agent)   │                   │
│  └──────────┘  └──────────┘  └──────────┘                   │
└────────┬────────────────────────┬────────────────────────────┘
         │                        │
    ┌────▼────┐             ┌─────▼─────┐
    │ OpenBB  │             │ Trading   │
    │ 量化数据 │             │ Agents    │
    │ :8000   │             │ 第二大脑   │
    └─────────┘             │ :8001     │
                            └───────────┘

┌─────────────────────────────────────────────────────────────┐
│           TrendRadar 情报爬虫（手动/定时触发）                  │
│  11 个国内热榜 + 34 个国际 RSS 源 = 40+ 消息通道              │
│  → AI 筛选 → HTML 深度报告 → 推送到 Dashboard                │
└─────────────────────────────────────────────────────────────┘
```

| 服务 | 端口 | 用途 |
|------|------|------|
| **Dashboard 前端** | `5173` | Web 可视化看板（你日常打开的页面） |
| **OpenClaw 后端** | `3000` | Node.js API 服务器，连接所有模块 |
| **OpenBB** | `8000` | 量化金融数据引擎（股票、期权、宏观） |
| **TradingAgents** | `8001` | Python AI 第二大脑（多空辩论决策） |

---

## 2. 一键启动

```bash
cd /Users/sineige/Desktop/AIAnalysisStock
bash scripts/start-all.sh
```

这会自动依次启动：OpenBB → TradingAgents → OpenClaw → Dashboard。
启动成功后终端会打印所有服务的 URL，直接在浏览器打开 `http://localhost:5173` 即可。

> ⚠️ TrendRadar 爬虫需要单独手动触发（见第4节）。

---

## 3. 手动逐个启动

如果一键脚本有问题，可以逐个启动：

```bash
# ── 终端1: OpenBB 量化数据引擎 ──
cd /Users/sineige/Desktop/AIAnalysisStock/vendors/openbb
.venv/bin/python3 -c "
from openbb_core.api.rest_api import app
import uvicorn
uvicorn.run(app, host='0.0.0.0', port=8000)
"

# ── 终端2: TradingAgents 第二大脑 ──
cd /Users/sineige/Desktop/AIAnalysisStock/vendors/trading-agents
/Users/sineige/Desktop/AIAnalysisStock/vendors/openbb/.venv/bin/python3 api_server.py

# ── 终端3: OpenClaw 核心后端 ──
cd /Users/sineige/Desktop/AIAnalysisStock
npm run daemon

# ── 终端4: Dashboard 前端 ──
cd /Users/sineige/Desktop/AIAnalysisStock/dashboard
npm run dev
```

---

## 4. 日常使用流程

### 📡 每日情报采集（TrendRadar）

这是你每天第一件要做的事——拉取全球最新资讯：

```bash
cd /Users/sineige/Desktop/AIAnalysisStock/vendors/trendradar
/Users/sineige/Desktop/AIAnalysisStock/vendors/openbb/.venv/bin/python3 -m trendradar
```

**运行过程：**
1. 爬取 11 个国内热榜平台（微博、知乎、华尔街见闻等）
2. 爬取 34 个国际 RSS 源（Reddit、X/Twitter、Bloomberg、BBC 等）
3. Zhipu AI 对 700+ 条原始资讯进行智能筛选
4. 生成精美 HTML 深度分析报告
5. 数据自动推送到 Dashboard

**查看报告：** 打开 `http://localhost:5173/radar`，在页面底部的 "AI 深度分析报告" 区域选择日期。

### ⚡ 个股深度调研

1. 打开 `http://localhost:5173/command_center`
2. 输入股票代码（如 `NVDA`、`AAPL`）
3. AI Swarm 自动启动多空辩论 → 风控评估 → 投资决策

### 📜 回溯历史任务

打开 `http://localhost:5173/timeline` 查看所有历史分析记录。

---

## 5. 访问入口一览

| 页面 | URL | 用途 |
|------|-----|------|
| 🏠 **主页** | http://localhost:5173 | 系统总览 |
| ⚡ **指挥中心** | http://localhost:5173/command_center | 发起个股分析任务 |
| 📡 **情报雷达** | http://localhost:5173/radar | 全球消息源 + AI 报告 |
| 📜 **任务时间线** | http://localhost:5173/timeline | 历史任务记录 |
| 👁 **观察列表** | http://localhost:5173/watchlist | 标的跟踪池 |
| ⚙️ **系统设置** | http://localhost:5173/settings | 配置 & 诊断 |
| 🔬 **OpenBB Docs** | http://localhost:8000/docs | 量化数据 API 文档 |
| 🧠 **TradingAgents** | http://localhost:8001/docs | 第二大脑 API 文档 |

---

## 6. 消息源清单

### 🇨🇳 国内热榜（11个）
| 平台 | 说明 |
|------|------|
| 今日头条 | 综合新闻热搜 |
| 百度热搜 | 搜索引擎热点 |
| 华尔街见闻 | 财经快讯 |
| 澎湃新闻 | 时政深度 |
| Bilibili 热搜 | 年轻人关注方向 |
| 财联社热门 | A股/港股快讯 |
| 凤凰网 | 综合时政 |
| 贴吧 | 社区情绪 |
| 微博 | 社交热点 |
| 抖音 | 短视频热搜 |
| 知乎 | 深度讨论 |

### 🌍 国际 RSS 源（34个）

#### 前沿科技
| 源 | RSS URL |
|----|---------|
| TechCrunch | `https://techcrunch.com/feed/` |
| IEEE Spectrum | `https://spectrum.ieee.org/feeds/feed.rss` |
| Singularity Hub | `https://singularityhub.com/feed/` |
| MIT Technology Review | `https://www.technologyreview.com/feed/` |
| The Verge - AI | `https://www.theverge.com/rss/ai-artificial-intelligence/index.xml` |
| Ars Technica | `https://feeds.arstechnica.com/arstechnica/index` |
| VentureBeat | `https://venturebeat.com/feed/` |
| ScienceDaily Tech | `https://www.sciencedaily.com/rss/top/technology.xml` |
| ScienceDaily Health | `https://www.sciencedaily.com/rss/top/health.xml` |

#### 生物科技 & 医疗
| 源 | RSS URL |
|----|---------|
| STAT News | `https://www.statnews.com/feed/` |
| FierceBiotech | `https://www.fiercebiotech.com/rss/xml` |
| Nature Biotechnology | `https://www.nature.com/nbt.rss` |
| GEN - Genetic Engineering | `https://www.genengnews.com/feed/` |

#### 金融 & 宏观经济
| 源 | RSS URL |
|----|---------|
| Financial Times | `https://www.ft.com/world?format=rss` |
| CNBC Top News | `https://search.cnbc.com/rs/search/combinedcms/view.xml?partnerId=wrss01&id=100003114` |
| Bloomberg Markets | `https://feeds.bloomberg.com/markets/news.rss` |

#### 地缘政治 & 时事
| 源 | RSS URL |
|----|---------|
| BBC World | `https://feeds.bbci.co.uk/news/world/rss.xml` |
| Al Jazeera | `https://www.aljazeera.com/xml/rss/all.xml` |
| Foreign Affairs | `https://www.foreignaffairs.com/rss.xml` |
| 南华早报 SCMP | `https://www.scmp.com/rss/4/feed` |

#### X (Twitter) 代理 — 通过 Telegram 镜像
| 源 | 代理 URL |
|----|----------|
| ZeroHedge | `http://localhost:3000/api/rss/x-zerohedge` |
| Unusual Whales | `http://localhost:3000/api/rss/x-unusual_whales` |
| Wu Blockchain | `http://localhost:3000/api/rss/x-wublockchain` |

#### Reddit 代理 — 通过内部 JSON API
| 源 | 代理 URL |
|----|----------|
| r/wallstreetbets | `http://localhost:3000/api/rss/reddit-wallstreetbets` |
| r/Economics | `http://localhost:3000/api/rss/reddit-economics` |
| r/Superstonk | `http://localhost:3000/api/rss/reddit-superstonk` |
| r/stocks | `http://localhost:3000/api/rss/reddit-stocks` |
| r/biotech | `http://localhost:3000/api/rss/reddit-biotech` |
| r/MachineLearning | `http://localhost:3000/api/rss/reddit-MachineLearning` |
| r/geopolitics | `http://localhost:3000/api/rss/reddit-geopolitics` |
| r/Futurology | `http://localhost:3000/api/rss/reddit-Futurology` |
| r/Singularity | `http://localhost:3000/api/rss/reddit-singularity` |

---

## 7. API 密钥配置

所有密钥都在项目根目录的 `.env` 文件里：

```bash
# 编辑密钥配置
vim /Users/sineige/Desktop/AIAnalysisStock/.env
```

| 密钥 | 用途 | 当前状态 |
|------|------|----------|
| `LLM_API_KEY` / `ZHIPUAI_API_KEY` | 智谱 GLM 大模型（核心 AI） | ✅ 已配置 |
| `FMP_API_KEY` | Financial Modeling Prep 财务数据 | ✅ 已配置（免费版） |
| `FIRECRAWL_API_KEY` | 网页深度抓取 | ✅ 已配置 |
| `DESEARCH_API_KEY` | 去中心化搜索 | ✅ 已配置 |
| `ALPHA_VANTAGE_API_KEY` | Alpha Vantage 股票数据 | ⚠️ 需在 .env 中添加 |
| `POLYGON_API_KEY` | Polygon.io 实时行情 | ⚠️ 需在 .env 中添加 |
| `TELEGRAM_BOT_TOKEN` | Telegram 推送 | ❌ 未配置 |

---

## 8. 常见问题

### Q: 启动后浏览器打不开？
确认四个服务都在运行：
```bash
lsof -i:3000 -i:5173 -i:8000 -i:8001 -P -n | grep LISTEN
```
应该看到 4 行 LISTEN。如果缺少，参考第 3 节手动启动。

### Q: TrendRadar 爬虫报错 "No module named xxx"？
依赖必须装在 OpenBB 的 Python 虚拟环境里：
```bash
/Users/sineige/Desktop/AIAnalysisStock/vendors/openbb/.venv/bin/python3 -m pip install <缺失模块>
```

### Q: Dashboard 显示"信号静默"？
表示未检测到新增的热点数据。运行一次 TrendRadar 爬虫即可：
```bash
cd /Users/sineige/Desktop/AIAnalysisStock/vendors/trendradar
/Users/sineige/Desktop/AIAnalysisStock/vendors/openbb/.venv/bin/python3 -m trendradar
```

### Q: X/Reddit 数据抓不到？
X 和 Reddit 通过内部代理获取，**必须确保 OpenClaw 后端 (port 3000) 正在运行**。
确认方法：`curl http://localhost:3000/api/rss/reddit-wallstreetbets`

### Q: 如何停止所有服务？
```bash
pkill -f "node.*daemon" && pkill -f "npm.*dev" && pkill -f "uvicorn"
```

---

> 📝 本文档版本: 2026-04-06 | 系统版本: Sineige Alpha v2.0

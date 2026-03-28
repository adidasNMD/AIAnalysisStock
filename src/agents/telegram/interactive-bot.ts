import TelegramBot from 'node-telegram-bot-api';
import * as fs from 'fs';
import * as path from 'path';
import { generateTextCompletion } from '../../utils/llm';
import { getActiveTickers } from '../../utils/dynamic-watchlist';
import * as dotenv from 'dotenv';
dotenv.config();

/**
 * 检索并组装历史报告作为 RAG 上下文
 */
function retrieveRAGContext(query: string): string {
  console.log(`[InteractiveBot] 🔍 正在检索 RAG 上下文: "${query}"`);
  let context = '';

  // 1. 最近的趋势雷达概览
  const intelDir = path.join(process.cwd(), 'out', 'intelligence');
  if (fs.existsSync(intelDir)) {
    const files = fs.readdirSync(intelDir).filter(f => f.endsWith('.md')).sort().reverse();
    if (files.length > 0) {
      // 取最近的一份雷达报告
      const latestRadar = fs.readFileSync(path.join(intelDir, files[0]!), 'utf-8');
      context += `\n\n【最近的趋势雷达概览】:\n${latestRadar.substring(0, 1500)}...\n`;
    }
  }

  // 2. 动态观察池现状
  const tickers = getActiveTickers();
  if (tickers.length > 0) {
    context += `\n\n【当前动态观察池标的】:\n`;
    tickers.forEach(t => {
      context += `- ${t.symbol} (${t.name}): ${t.chainLevel}, 评分${t.multibaggerScore}, 状态:${t.status}, 来源:${t.discoverySource}\n`;
    });
  }

  // 3. 关键词匹配最近深度研报
  const reportsDir = path.join(process.cwd(), 'out', 'reports');
  if (fs.existsSync(reportsDir)) {
    const reports = fs.readdirSync(reportsDir).filter(f => f.endsWith('.md')).sort().reverse();
    for (const report of reports.slice(0, 5)) { // 检查最近 5 份报告
      const content = fs.readFileSync(path.join(reportsDir, report), 'utf-8');
      // 如果用户的查询包含研报里的词（简单匹配），则将研报摘录加入上下文
      const keywords = query.split(/\s+/).filter(k => k.length > 2);
      if (keywords.some(k => content.toLowerCase().includes(k.toLowerCase()) || report.toLowerCase().includes(k.toLowerCase()))) {
        context += `\n\n【历史相关深度分析摘要 (${report})】:\n${content.substring(0, 2000)}...\n`;
        break; // 只要匹配到一份最相关的就够了，避免 Token 爆炸
      }
    }
  }

  return context || '暂无相关历史本地上下文。';
}

export function startInteractiveBot() {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const authorizedChatId = process.env.TELEGRAM_CHAT_ID;

  if (!token || token.includes('your_')) {
    console.log('[TelegramBot] ⚠️ Bot token not configured. Interactive Mode DISABLED.');
    return;
  }

  console.log('[TelegramBot] 🟢 Interactive Polling Mode STARTED.');

  const bot = new TelegramBot(token, { polling: true });

  const systemPrompt = `你是一个名为 OpenClaw 的顶级私人 AI 投资助理。
你的主人是一位具有深刻产业理解力但往往"发现过晚"的成长型投资者。
他的仓位纪律是单只标的绝不超过 20%。
他不喜欢听废话，喜欢直接的结论和逻辑链条。

你的工作模式：
1. 结合主人提供的【本地系统环境上下文】（包含最近发现的标的、趋势雷达、深度研报）回答他的问题。
2. 如果他问"现在还能买吗/追吗"，你必须结合标的的属性（有产业逻辑基本面的标的 vs 纯情绪炒作标的）给出极其坦诚的建议。如果是纯炒作标的，强制提醒"此为纯情绪博弈，只建议 5%-10% 观察仓"。
3. 你的语气要专业、极其冷静、客观揭示风险，像一个高级参谋。
4. 回复使用 Markdown，尽量简洁清晰。`;

  bot.on('message', async (msg) => {
    const chatId = msg.chat.id.toString();
    const text = msg.text;

    // 简单授权验证：仅回复指定用户
    if (authorizedChatId && chatId !== authorizedChatId) {
      console.log(`[TelegramBot] 🛑 未授权用户尝试访问: ${chatId}`);
      return;
    }

    if (!text) return;

    if (text.startsWith('/start')) {
      bot.sendMessage(chatId, "👋 **OpenClaw Sentinel Online.**\n\n我已开启实时轮询，您可以随时向我询问市场信息、观察池标的现状、或要求检索历史研报。", { parse_mode: 'Markdown' });
      return;
    }

    // 聊天回复逻辑
    try {
      console.log(`[TelegramBot] 💬 User: ${text}`);
      
      // 显示 "正在输入..."
      bot.sendChatAction(chatId, 'typing');

      // 1. 组装 RAG
      const ragContext = retrieveRAGContext(text);
      const userPrompt = `用户的问题/指令：\n"${text}"\n\n=== 本地系统环境上下文 ===\n${ragContext}`;

      // 2. 调用 LLM
      const reply = await generateTextCompletion(systemPrompt, userPrompt);

      console.log(`[TelegramBot] 🤖 Bot: 发送回复...`);
      bot.sendMessage(chatId, reply, { parse_mode: 'Markdown' });

    } catch (e: any) {
      console.error(`[TelegramBot] ❌ Error handling message: ${e.message}`);
      bot.sendMessage(chatId, `⚠️ OpenClaw 核心脑力异常，请检查 API Key 额度或重试。\n错误: ${e.message}`);
    }
  });

  // 错误处理
  bot.on('polling_error', (err) => {
    console.error(`[TelegramBot] Polling Error: ${err.message}`);
  });
}

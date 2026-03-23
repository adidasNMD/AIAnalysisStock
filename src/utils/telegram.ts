import TelegramBot from 'node-telegram-bot-api';
import * as dotenv from 'dotenv';
dotenv.config();

let bot: TelegramBot | null = null;
const chatId = process.env.TELEGRAM_CHAT_ID || '';

function getBot(): TelegramBot | null {
  if (bot) return bot;
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token || token.includes('your_')) {
    console.log('[Telegram] ⚠️ Bot token not configured. Alerts will only be logged to console.');
    return null;
  }
  bot = new TelegramBot(token, { polling: false });
  return bot;
}

/**
 * 发送普通消息
 */
export async function sendMessage(message: string): Promise<void> {
  console.log(`[Telegram] 📤 ${message.substring(0, 80)}...`);
  const b = getBot();
  if (b && chatId) {
    try {
      await b.sendMessage(chatId, message, { parse_mode: 'Markdown' });
    } catch (e: any) {
      console.error(`[Telegram] Failed to send: ${e.message}`);
    }
  }
}

/**
 * 🔴 发送紧急止损警报
 */
export async function sendStopLossAlert(symbol: string, details: string): Promise<void> {
  const msg = `🔴🔴🔴 *紧急止损警报*\n\n*标的:* \`${symbol}\`\n${details}\n\n⚠️ *立即检查持仓，考虑是否执行止损！*`;
  console.log(`[Telegram] 🚨 CRITICAL ALERT: ${symbol}`);
  const b = getBot();
  if (b && chatId) {
    try {
      await b.sendMessage(chatId, msg, { parse_mode: 'Markdown' });
    } catch (e: any) {
      console.error(`[Telegram] Failed to send stop loss alert: ${e.message}`);
    }
  }
}

/**
 * 🟠 发送入场信号
 */
export async function sendEntrySignal(symbol: string, details: string): Promise<void> {
  const msg = `🟠 *入场信号触发*\n\n*标的:* \`${symbol}\`\n${details}`;
  await sendMessage(msg);
}

/**
 * 📝 发送完整研报摘要
 */
export async function sendReportSummary(title: string, highlights: string): Promise<void> {
  const msg = `📊 *OpenClaw 研报速递*\n\n*${title}*\n\n${highlights}`;
  await sendMessage(msg);
}

/**
 * 发送批量异动汇总
 */
export async function sendAlertBatch(alerts: Array<{ symbol: string; details: string; severity: string }>): Promise<void> {
  if (alerts.length === 0) return;

  const critical = alerts.filter(a => a.severity === 'critical');
  const action = alerts.filter(a => a.severity === 'action');
  const info = alerts.filter(a => a.severity === 'info');

  let msg = `⚡ *Watchlist 异动扫描报告* (${alerts.length} 条)\n\n`;

  if (critical.length > 0) {
    msg += `🔴 *紧急:*\n`;
    critical.forEach(a => msg += `• ${a.details}\n`);
    msg += `\n`;
  }
  if (action.length > 0) {
    msg += `🟠 *关注:*\n`;
    action.forEach(a => msg += `• ${a.details}\n`);
    msg += `\n`;
  }
  if (info.length > 0) {
    msg += `🟡 *信息:*\n`;
    info.forEach(a => msg += `• ${a.details}\n`);
  }

  await sendMessage(msg);
}

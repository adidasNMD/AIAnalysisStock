import * as fs from 'fs';
import * as path from 'path';

/**
 * 严格按照 YYYY-MM-DD/HH-mm-ss_query.md 格式归档持久化简报
 */
export function saveReport(query: string, content: string): string {
  const now = new Date();
  
  // Format YYYY-MM-DD
  const dateStr = now.toISOString().split('T')[0] || '1970-01-01';
  
  // Format HH-mm-ss
  const timeStr = [
    now.getHours().toString().padStart(2, '0'),
    now.getMinutes().toString().padStart(2, '0'),
    now.getSeconds().toString().padStart(2, '0')
  ].join('-');

  // Sanitize the query string so it's a safe filename (allow alphanumeric and chinese characters)
  const safeQuery = query.replace(/[^a-zA-Z0-9\u4e00-\u9fa5]/g, '_').substring(0, 30);
  const filename = `${timeStr}_${safeQuery}.md`;
  
  // Ensure the directory exists relative to the project root
  const dirPath = path.join(process.cwd(), 'out', 'reports', dateStr);
  
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
  }

  const fullPath = path.join(dirPath, filename);
  fs.writeFileSync(fullPath, content, 'utf-8');
  
  console.log(`[StorageSystem] 💾 情报简报归档成功! 路径: ${fullPath}`);
  return fullPath;
}

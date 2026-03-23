import * as dotenv from 'dotenv';
dotenv.config();

export interface EdgarFiling {
  companyName: string;
  formType: string;
  filedAt: string;
  accessionNumber: string;
  url: string;
  description: string;
}

// SEC EDGAR Full-Text Search API (完全免费，无需 API Key)
const EDGAR_SEARCH_URL = 'https://efts.sec.gov/LATEST/search-index';
const EDGAR_FILING_URL = 'https://www.sec.gov/cgi-bin/browse-edgar';

// 已推送过的 filing 缓存
const seenFilings = new Set<string>();

/**
 * 搜索 SEC EDGAR 全文索引
 */
export async function searchFilings(
  query: string,
  formTypes: string[] = ['S-1', 'S-1/A', '10-K', '8-K'],
  limit: number = 10
): Promise<EdgarFiling[]> {
  const filings: EdgarFiling[] = [];

  try {
    // 使用 SEC EDGAR FULL-TEXT SEARCH API
    const params = new URLSearchParams({
      q: query,
      dateRange: 'custom',
      startdt: getDateDaysAgo(30),
      enddt: getTodayDate(),
      forms: formTypes.join(',')
    });

    const response = await fetch(
      `https://efts.sec.gov/LATEST/search-index?${params.toString()}`,
      {
        headers: {
          'User-Agent': 'OpenClaw-Sentinel/1.0 (contact@openclaw.dev)',
          'Accept': 'application/json'
        }
      }
    );

    if (!response.ok) {
      // 备用：使用更简单的 EDGAR full-text search
      return await searchEdgarFullText(query, formTypes, limit);
    }

    const data: any = await response.json();
    const hits = data.hits?.hits || [];

    for (const hit of hits.slice(0, limit)) {
      const source = hit._source || {};
      const accessionNumber = source.file_num || source.accession_no || '';
      
      if (seenFilings.has(accessionNumber)) continue;
      seenFilings.add(accessionNumber);

      filings.push({
        companyName: source.display_names?.[0] || source.entity_name || query,
        formType: source.form_type || 'Unknown',
        filedAt: source.file_date || source.period_of_report || '',
        accessionNumber,
        url: `https://www.sec.gov/Archives/edgar/data/${source.entity_id}/${accessionNumber.replace(/-/g, '')}`,
        description: source.display_names?.join(', ') || ''
      });
    }
  } catch (e: any) {
    console.error(`[EDGAR] Primary search failed, trying fallback: ${e.message}`);
    return await searchEdgarFullText(query, formTypes, limit);
  }

  return filings;
}

/**
 * 备用搜索：SEC EDGAR Full-Text Search REST API
 */
async function searchEdgarFullText(
  query: string,
  formTypes: string[],
  limit: number
): Promise<EdgarFiling[]> {
  const filings: EdgarFiling[] = [];

  try {
    const url = `https://efts.sec.gov/LATEST/search-index?q=%22${encodeURIComponent(query)}%22&dateRange=custom&startdt=${getDateDaysAgo(90)}&enddt=${getTodayDate()}&forms=${formTypes.join(',')}`;
    
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'OpenClaw-Sentinel/1.0 (contact@openclaw.dev)',
        'Accept': 'application/json'
      }
    });

    if (!response.ok) {
      console.error(`[EDGAR] Fallback search also failed: ${response.status}`);
      return filings;
    }

    const data: any = await response.json();
    const hits = data.hits?.hits || [];

    for (const hit of hits.slice(0, limit)) {
      const source = hit._source || {};
      const accessionNumber = source.accession_no || '';
      
      if (seenFilings.has(accessionNumber)) continue;
      seenFilings.add(accessionNumber);

      filings.push({
        companyName: source.entity_name || query,
        formType: source.form_type || 'Unknown',
        filedAt: source.file_date || '',
        accessionNumber,
        url: `https://www.sec.gov/cgi-bin/browse-edgar?action=getcompany&company=${encodeURIComponent(query)}&type=${formTypes[0]}&dateb=&owner=include&count=10`,
        description: `${source.entity_name || query} filed ${source.form_type || 'document'}`
      });
    }
  } catch (e: any) {
    console.error(`[EDGAR] Fallback search error: ${e.message}`);
  }

  return filings;
}

/**
 * 监控特定公司的 IPO 相关文件 (S-1, S-1/A, 424B)
 */
export async function watchIPO(
  companyNames: string[]
): Promise<EdgarFiling[]> {
  console.log(`[EDGAR] 🔍 监控 IPO 文件: ${companyNames.join(', ')}`);
  
  const allFilings: EdgarFiling[] = [];

  for (const company of companyNames) {
    const filings = await searchFilings(company, ['S-1', 'S-1/A', '424B4', '424B1'], 5);
    allFilings.push(...filings);
  }

  if (allFilings.length > 0) {
    console.log(`[EDGAR] 📄 发现 ${allFilings.length} 份 IPO 相关文件！`);
    allFilings.forEach(f => {
      console.log(`  📌 [${f.formType}] ${f.companyName} — ${f.filedAt}`);
    });
  } else {
    console.log(`[EDGAR] ✅ 无新 IPO 文件。`);
  }

  return allFilings;
}

/**
 * 将 EDGAR filing 转换为可喂给 AI 的文本
 */
export function filingsToContext(filings: EdgarFiling[]): string {
  if (filings.length === 0) return '';
  return filings.map(f =>
    `[SEC EDGAR] ${f.companyName} | Form: ${f.formType} | Filed: ${f.filedAt}\nURL: ${f.url}\n${f.description}`
  ).join('\n\n---\n\n');
}

// Helpers
function getTodayDate(): string {
  return new Date().toISOString().split('T')[0] || '2026-01-01';
}

function getDateDaysAgo(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return d.toISOString().split('T')[0] || '2026-01-01';
}

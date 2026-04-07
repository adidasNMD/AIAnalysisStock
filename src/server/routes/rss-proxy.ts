import { Request, Response } from 'express';

const USER_AGENT = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

export async function rssProxyHandler(req: Request, res: Response) {
  const source = req.params.source as string;
  if (!source) return res.status(400).send('Missing source');
  res.setHeader('Content-Type', 'application/xml');

  try {
    if (source.startsWith('reddit-')) {
      const subreddit = source.replace('reddit-', '');
      const url = `https://www.reddit.com/r/${subreddit}/hot.json?limit=25`;
      const response = await fetch(url, { headers: { 'User-Agent': USER_AGENT } });
      const data: any = await response.json();
      
      let xml = `<?xml version="1.0" encoding="UTF-8" ?>\n<rss version="2.0">\n<channel>\n<title>Reddit - r/${subreddit}</title>\n<link>https://www.reddit.com/r/${subreddit}</link>\n<description>Reddit feed</description>\n`;
      if (data && data.data && data.data.children) {
        data.data.children.forEach((child: any) => {
          const item = child.data;
          xml += `<item>\n<title><![CDATA[${item.title}]]></title>\n<link>https://www.reddit.com${item.permalink}</link>\n<pubDate>${new Date(item.created_utc * 1000).toUTCString()}</pubDate>\n</item>\n`;
        });
      }
      xml += `</channel>\n</rss>`;
      return res.send(xml);
    }
    
    if (source.startsWith('x-')) {
      // Mock accessing X by accessing their Telegram public mirror feeds, because X blocks all scraping
      let tgHandle = '';
      if (source === 'x-zerohedge') tgHandle = 'zerohedge';
      else if (source === 'x-unusual_whales') tgHandle = 'unusual_whales'; // approximation
      else if (source === 'x-wublockchain') tgHandle = 'wublockchainenglish';
      
      const url = `https://t.me/s/${tgHandle}`;
      const response = await fetch(url, { headers: { 'User-Agent': USER_AGENT } });
      const html = await response.text();
      
      let xml = `<?xml version="1.0" encoding="UTF-8" ?>\n<rss version="2.0">\n<channel>\n<title>X (via TG Mirror) - ${tgHandle}</title>\n<link>https://twitter.com/${tgHandle}</link>\n<description>X feed</description>\n`;
      
      // extremely simple regex to extract message text
      const regex = /<div class="tgme_widget_message_text[^>]*>(.*?)<\/div>/gs;
      let match;
      while ((match = regex.exec(html)) !== null) {
        let text = match[1]?.replace(/<[^>]*>?/gm, '') || ''; // strip html
        let title = text.substring(0, 80) + (text.length > 80 ? '...' : '');
        xml += `<item>\n<title><![CDATA[${title}]]></title>\n<description><![CDATA[${text}]]></description>\n<link>https://twitter.com/${tgHandle}</link>\n<pubDate>${new Date().toUTCString()}</pubDate>\n</item>\n`;
      }
      xml += `</channel>\n</rss>`;
      return res.send(xml);
    }

    res.status(404).send('Not found');
  } catch (err: any) {
    res.status(500).send(`<?xml version="1.0"?><rss version="2.0"><channel><title>Error</title><item><title>Fetch Error</title><description>${err.message}</description></item></channel></rss>`);
  }
}

import os
import logging
from typing import List, Dict, Any, Optional

logger = logging.getLogger(__name__)

class FirecrawlTool:
    """Wrapper for FirecrawlApp to fetch real-time web intelligence."""
    
    def __init__(self, api_key: Optional[str] = None):
        try:
            from firecrawl import FirecrawlApp
        except ImportError:
            raise ImportError("Please install firecrawl-py: pip install firecrawl-py")
            
        key = api_key or os.environ.get("FIRECRAWL_API_KEY")
        if not key:
            logger.warning("FIRECRAWL_API_KEY is not set. Web intelligence will fail.")
            
        self.app = FirecrawlApp(api_key=key) if key else None

    def search_intelligence(self, query: str, limit: int = 3) -> str:
        """Search the web for recent news/advancements and return formatted markdown."""
        if not self.app:
            return f"Error: Firecrawl API key missing. Cannot search for '{query}'."
            
        try:
            logger.info(f"Dispatching Firecrawl intel search: {query}")
            # Search execution
            results = self.app.search(query=query)
            
            md_content = []
            data = results.get("data", [])
            for i, article in enumerate(data[:limit]):
                title = article.get("title", f"Source {i+1}")
                desc = article.get("description", "")
                url = article.get("url", "")
                md_content.append(f"### {title}\n{desc}\nSource: {url}\n")
                
            return "\n".join(md_content) if md_content else "No substantial intelligence found."
            
        except Exception as e:
            logger.error(f"Firecrawl search failed: {e}")
            return f"Error executing intelligence search: {str(e)}"

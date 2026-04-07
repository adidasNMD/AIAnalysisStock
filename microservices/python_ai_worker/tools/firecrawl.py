import os
import requests
import asyncio
import json

FIRECRAWL_API_KEY = os.getenv("FIRECRAWL_API_KEY", os.getenv("TAVILY_API_KEY", ""))

async def execute_firecrawl_search(query: str, limit: int = 3) -> str:
    """Entry point for the LLM Tool fetching deep web articles."""
    if not FIRECRAWL_API_KEY or "your_" in FIRECRAWL_API_KEY:
        # Fallback to mock data if API key is not valid, preventing crash
        return f"[Firecrawl Fallback] Mock news article for query '{query}': Significant supply chain bottlenecks observed in Q3, margins expected to shift by 15%."
        
    url = "https://api.firecrawl.dev/v1/search-and-scrape"
    headers = {
        "Authorization": f"Bearer {FIRECRAWL_API_KEY}",
        "Content-Type": "application/json"
    }
    payload = {
        "query": query,
        "limit": limit
    }
    
    try:
        loop = asyncio.get_event_loop()
        response = await loop.run_in_executor(
            None, 
            lambda: requests.post(url, headers=headers, json=payload, timeout=20)
        )
        
        if response.status_code != 200:
            raise Exception(f"Firecrawl HTTP Error {response.status_code}")
            
        data = response.json()
        results = data.get("results", [])
        
        if not results:
            return "No lengthy articles or reports found on the deep web."
            
        output = ""
        for article in results:
            title = article.get("title", "Unknown Title")
            source = article.get("author") or article.get("domain") or "unknown_publisher"
            content = article.get("content") or article.get("markdown") or ""
            # Limit 1500 chars per article
            output += f"[Title: {title} | Source: {source}]:\n{content[:1500]}...\n\n===WEB REPORT===\n\n"
            
        return output
        
    except Exception as e:
        print(f"[Firecrawl Tool Error]: {str(e)}")
        # Gracefully handle network timeouts without crashing LangGraph
        return f"[Firecrawl Error] Search failed due to network timeout or payload issue."

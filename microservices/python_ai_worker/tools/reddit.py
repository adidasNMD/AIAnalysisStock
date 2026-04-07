import os
import requests
import asyncio
from typing import List, Dict, Any

REDDIT_BASE = 'https://www.reddit.com'
USER_AGENT = 'OpenClaw-Sentinel/1.0 (Stock Intelligence Python Bot)'

DEFAULT_SUBREDDITS = [
    'wallstreetbets',
    'stocks',
    'investing',
    'options',
    'semiconductors',
    'stockmarket',
]

async def fetch_reddit_json(endpoint: str) -> List[Dict[str, Any]]:
    """Fetch raw json from Reddit."""
    url = f"{REDDIT_BASE}{endpoint}.json?raw_json=1&limit=25"
    headers = {
        'User-Agent': USER_AGENT,
        'Accept': 'application/json',
    }
    
    posts = []
    try:
        # Run synchronous HTTP request in a threadpool so it doesn't block async execution
        loop = asyncio.get_event_loop()
        response = await loop.run_in_executor(None, lambda: requests.get(url, headers=headers, timeout=10))
        
        if response.status_code != 200:
            return posts

        data = response.json()
        children = data.get('data', {}).get('children', [])

        for child in children:
            post = child.get('data', {})
            if post.get('stickied'):
                continue
            
            posts.append({
                'id': post.get('id', ''),
                'title': post.get('title', ''),
                'selftext': post.get('selftext', '')[:1000],
                'subreddit': post.get('subreddit', ''),
                'score': post.get('score', 0),
                'num_comments': post.get('num_comments', 0),
            })
            
    except Exception as e:
        print(f"[Reddit Tool Error]: {str(e)}")
        
    return posts

async def execute_reddit_search(query: str, limit: int = 10) -> str:
    """Entry point for the LLM Tool"""
    import urllib.parse
    
    encoded_query = urllib.parse.quote(query)
    
    # Send all searches concurrently
    tasks = [
        fetch_reddit_json(f"/search?q={encoded_query}&sort=relevance&t=day"),
        fetch_reddit_json(f"/r/wallstreetbets/hot"),
        fetch_reddit_json(f"/r/stocks/hot")
    ]
    
    results = await asyncio.gather(*tasks)
    
    # Flatten the results
    all_posts = []
    for res in results:
        all_posts.extend(res)
        
    if not all_posts:
        return "No recent Reddit discussions found for this query."
        
    # Sort by score descending and take top 15
    all_posts.sort(key=lambda x: x['score'], reverse=True)
    all_posts = all_posts[:15]
    
    output = f"=== Reddit Intelligence ({len(all_posts)} posts) ===\n\n"
    for p in all_posts:
        output += f"[r/{p['subreddit']} | ⬆️{p['score']} | 💬{p['num_comments']}] {p['title']}\n"
        if p['selftext']:
            output += f"  {p['selftext'][:200]}\n"
        output += "\n"
        
    return output

import aiosqlite
import os
import time
import uuid

DB_PATH = os.path.abspath(os.path.join(os.path.dirname(__file__), "../../../data/openclaw.db"))

async def get_recent_narratives(limit: int = 10) -> str:
    """Fetch recent narratives to give the Strategist AI memory."""
    async with aiosqlite.connect(DB_PATH) as db:
        async with db.execute("SELECT symbol, category, content, timestamp FROM narratives ORDER BY timestamp DESC LIMIT ?", (limit,)) as cursor:
            rows = await cursor.fetchall()
            
            if not rows:
                return "No historical narratives found in memory."
                
            output = "=== HISTORICAL NARRATIVES ===\n"
            for row in rows:
                symbol, category, content, ts = row
                date_str = time.strftime('%Y-%m-%d %H:%M:%S', time.localtime(ts / 1000))
                output += f"[{date_str}] [{symbol}] [{category}]: {content[:200]}...\n"
                
            return output

async def save_narrative(symbol: str, category: str, content: str, meta: str = ""):
    """Save a new narrative synthesized by the AI."""
    narrative_id = f"nar_{uuid.uuid4().hex[:8]}"
    ts = int(time.time() * 1000)
    
    async with aiosqlite.connect(DB_PATH) as db:
        await db.execute(
            "INSERT INTO narratives (id, symbol, timestamp, category, content, meta) VALUES (?, ?, ?, ?, ?, ?)",
            (narrative_id, symbol, ts, category, content, meta)
        )
        await db.commit()

import os
import json
import time
import asyncio
from typing import Optional, AsyncGenerator
from fastapi import FastAPI, Request
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from sse_starlette.sse import EventSourceResponse
from dotenv import load_dotenv

# Load env variables from the root .env file
load_dotenv("../../.env")

app = FastAPI(title="OpenClaw Python AI Engine")

class MissionRequest(BaseModel):
    query: str
    depth: str
    missionId: str

# In-memory signal bus to relay langgraph callbacks to SSE
event_queue = asyncio.Queue()

def emit_log(mission_id: str, agent_name: str, phase: str, content: str, meta: dict = None):
    """Utility to push an event into the async queue for SSE broadcast."""
    event = {
        "missionId": mission_id,
        "agentName": agent_name,
        "phase": phase,
        "content": content,
        "timestamp": int(time.time() * 1000),
        "meta": meta or {}
    }
    # Create the raw SSE string
    # event_name 'agent_log' must match frontend's source.addEventListener('agent_log')
    sse_data = f"event: agent_log\ndata: {json.dumps(event)}\n\n"
    # We use put_nowait so synchronous Langchain callbacks don't have to await
    event_queue.put_nowait(sse_data)

async def event_generator() -> AsyncGenerator[str, None]:
    """Generates SSE events from the queue."""
    while True:
        event = await event_queue.get()
        yield event

@app.get("/api/stream")
async def stream_logs(request: Request):
    """
    Temporary stand-in for the Node/Go SSE stream.
    In phase 2, Go will consume this / listen via RPC, but for now
    the UI can connect here directly if we change the port.
    """
    return StreamingResponse(event_generator(), media_type="text/event-stream")

@app.post("/api/v1/mission/execute")
async def execute_mission(req: MissionRequest):
    """
    Fires off the LangGraph pipeline asynchronously, responding immediately.
    """
    from agents.swarm_orchestrator import run_swarm_pipeline
    
    # We emit a "system" bootup log
    emit_log(req.missionId, "System", "info", f"Python AI Engine booting mission for: {req.query}")
    
    # Run the massive graph in the background
    asyncio.create_task(run_swarm_pipeline(req.query, req.missionId))
    
    return {"status": "started", "missionId": req.missionId}

if __name__ == "__main__":
    import uvicorn
    # Start the fast API engine on port 8000
    uvicorn.run(app, host="0.0.0.0", port=8000)

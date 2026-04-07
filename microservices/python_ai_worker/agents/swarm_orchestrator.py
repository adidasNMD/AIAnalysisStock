import os
import asyncio
import json
from typing import TypedDict, Optional
from langgraph.graph import StateGraph, START, END
from langchain_openai import ChatOpenAI
from langchain_core.messages import HumanMessage, SystemMessage
from main import emit_log

class SwarmState(TypedDict):
    query: str
    missionId: str
    scout_signals: str
    analyst_report: str
    strategist_plan: str

# Define our robust OpenAI Chat model. 
# We'll use langchain_openai with base_url to be compatible with any api provider.
from dotenv import load_dotenv

# Load explicitly to ensure background scripts get it
load_dotenv(os.path.join(os.path.dirname(__file__), "../../../.env"))

def get_llm(tier: str = "high"):
    if tier == "low":
        return ChatOpenAI(
            model=os.getenv("ZHIPU_MODEL", "glm-4"),
            api_key=os.getenv("ZHIPU_API_KEY"),
            base_url=os.getenv("ZHIPU_BASE_URL", "https://open.bigmodel.cn/api/paas/v4/"),
            streaming=True
        )
    else:
        # High tier - Claude Opus via API proxy
        return ChatOpenAI(
            model=os.getenv("ANTHROPIC_MODEL", "claude-opus-4-6-20260205"),
            api_key=os.getenv("ANTHROPIC_AUTH_TOKEN"),
            base_url=os.getenv("ANTHROPIC_BASE_URL", "https://api.mcxhm.cn/v1"),
            default_headers={"X-Title": "OpenClaw"},
            streaming=True
        )

async def data_scout_node(state: SwarmState):
    """DataScout searches multiple data sources and cleanses raw signals."""
    from tools.reddit import execute_reddit_search
    from tools.firecrawl import execute_firecrawl_search
    from tools.finance import execute_finance_analysis

    emit_log(state["missionId"], "System", "routing", "[Transitions] Routing to Data Scout...")
    emit_log(state["missionId"], "Data Scout", "tool_call", f"Commencing Python cross-platform polling for: {state['query']}")
    
    # Run the tools concurrently
    reddit_task = execute_reddit_search(state['query'])
    firecrawl_task = execute_firecrawl_search(state['query'])
    finance_task = execute_finance_analysis(state['query'])
    
    try:
        results = await asyncio.gather(reddit_task, firecrawl_task, finance_task)
        reddit_data = results[0]
        firecrawl_data = results[1]
        finance_data = results[2]
    except Exception as e:
        reddit_data = "Failed to load Reddit."
        firecrawl_data = "Failed to load Firecrawl."
        finance_data = "Failed to load Finance."

    emit_log(state["missionId"], "Data Scout", "tool_end", f"Successfully extracted signals from Python Native scrappers.")
    
    scout_combined = f"=== YFINANCE QUANT DATA ===\n{finance_data}\n\n=== REDDIT DISCUSSIONS ===\n{reddit_data}\n\n=== FIRECRAWL REPORT ===\n{firecrawl_data}\n"

    prompt = f"""
    You are the quantitative and qualitative Data Scout. Carefully analyze these scraped results from the Python engine and summarize the most critical signals.
    Pay extreme attention to Quantitative Profile numbers if they are available to assess short-term risks vs opportunities.
    [User Query]: {state['query']}
    
    [Raw Signals Data]:
    {scout_combined}
    """
    
    llm = get_llm("low")
    
    # We yield tokens back to the frontend!
    emit_log(state["missionId"], "Data Scout", "executing", f"Processing data via LLM...")
    
    # Capture chunks and emit log
    buffer = ""
    complete_text = ""
    async for chunk in llm.astream([HumanMessage(content=prompt)]):
        text = chunk.content
        complete_text += text
        buffer += text
        if "\n" in buffer or len(buffer) > 30:
            emit_log(state["missionId"], "Data Scout", "streaming", buffer)
            buffer = ""
    if buffer:
        emit_log(state["missionId"], "Data Scout", "streaming", buffer)
        
    emit_log(state["missionId"], "Data Scout", "final_insight", complete_text)
    return {"scout_signals": complete_text}

async def analyst_node(state: SwarmState):
    from db.narrative_store import get_recent_narratives
    
    emit_log(state["missionId"], "System", "routing", "[Transitions] Handoff from Scout -> Lead Analyst")
    
    # 抽取历史记忆，注入给 Analyst
    historical_narratives = await get_recent_narratives(5)
    
    prompt = f"""
    You are the Lead Market Analyst.
    
    [Historical Memory]:
    {historical_narratives}
    
    [Latest Scout Data]:
    {state['scout_signals']}
    
    Base your thesis combining the latest data with historical memory.
    """
    
    llm = get_llm("high")
    buffer = ""
    complete_text = ""
    async for chunk in llm.astream([SystemMessage(content=prompt), HumanMessage(content=f"Synthesize the report for: {state['query']}")]):
        text = chunk.content
        complete_text += text
        buffer += text
        if "\n" in buffer or len(buffer) > 30:
            emit_log(state["missionId"], "Lead Analyst", "streaming", buffer)
            buffer = ""
    if buffer:
        emit_log(state["missionId"], "Lead Analyst", "streaming", buffer)
        
    emit_log(state["missionId"], "Lead Analyst", "final_insight", complete_text)
    return {"analyst_report": complete_text}

async def strategist_node(state: SwarmState):
    from db.narrative_store import save_narrative
    
    emit_log(state["missionId"], "System", "routing", "[Transitions] Handoff from Analyst -> Chief Strategist")
    
    prompt = f"""
    You are the Chief Investment Strategist.
    Make an actionable conclusion based on the Analyst Report:
    {state['analyst_report']}
    """
    
    llm = get_llm("high")
    buffer = ""
    complete_text = ""
    async for chunk in llm.astream([SystemMessage(content=prompt), HumanMessage(content=f"Final investment plan for: {state['query']}")]):
        text = chunk.content
        complete_text += text
        buffer += text
        if "\n" in buffer or len(buffer) > 30:
            emit_log(state["missionId"], "Strategist", "streaming", buffer)
            buffer = ""
    if buffer:
        emit_log(state["missionId"], "Strategist", "streaming", buffer)
        
    # Extract ticker heuristically or just mark it global for now
    ticker = state['query'].split()[0] if len(state['query'].split()) > 0 else "MACRO"
    if len(ticker) > 5: ticker = "MACRO"
    
    emit_log(state["missionId"], "System", "executing", f"Persisting generated narrative for {ticker} into openclaw.db SQLite...")
    await save_narrative(ticker.upper(), "STRATEGY", complete_text, json.dumps({"query": state['query']}))
    
    emit_log(state["missionId"], "Chief Strategist", "final_insight", complete_text)
    emit_log(state["missionId"], "System", "done", f"Mission {state['missionId']} fully archived.")
    
    return {"strategist_plan": complete_text}

# Build LangGraph
graph_builder = StateGraph(SwarmState)
graph_builder.add_node("DataScout", data_scout_node)
graph_builder.add_node("LeadAnalyst", analyst_node)
graph_builder.add_node("ChiefStrategist", strategist_node)

graph_builder.add_edge(START, "DataScout")
graph_builder.add_edge("DataScout", "LeadAnalyst")
graph_builder.add_edge("LeadAnalyst", "ChiefStrategist")
graph_builder.add_edge("ChiefStrategist", END)

swarm_graph = graph_builder.compile()

async def run_swarm_pipeline(query: str, missionId: str):
    try:
        initial_state = SwarmState(query=query, missionId=missionId, scout_signals="", analyst_report="", strategist_plan="")
        
        # Await LangGraph invocation
        final_state = await swarm_graph.ainvoke(initial_state)
        
        emit_log(missionId, "System", "done", f"Mission {missionId} completed by Python AI Worker.")
    except Exception as e:
        emit_log(missionId, "System", "fatal", f"[LangGraph System Error] {str(e)}")

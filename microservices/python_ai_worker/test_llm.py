import asyncio
import os
from langchain_openai import ChatOpenAI
from langchain_core.messages import HumanMessage
from dotenv import load_dotenv

load_dotenv(os.path.join(os.path.dirname(__file__), "../../.env"))

def get_llm(tier="high"):
    if tier == "low":
        return ChatOpenAI(
            model=os.getenv("ZHIPU_MODEL", "glm-4"),
            api_key=os.getenv("ZHIPU_API_KEY"),
            base_url=os.getenv("ZHIPU_BASE_URL", "https://open.bigmodel.cn/api/paas/v4/"),
        )
    else:
        return ChatOpenAI(
            model=os.getenv("ANTHROPIC_MODEL", "claude-opus-4-6-20260205"),
            api_key=os.getenv("ANTHROPIC_AUTH_TOKEN"),
            base_url=os.getenv("ANTHROPIC_BASE_URL", "https://api.mcxhm.cn/v1"),
            default_headers={"X-Title": "OpenClaw"}
        )

async def test_llm(tier, name):
    print(f"\n--- Testing {name} ({tier} tier) ---")
    try:
        llm = get_llm(tier)
        result = await llm.ainvoke([HumanMessage(content="Reply strictly: 'PONG_SUCCESS'")])
        print(f"✅ Success. Response: {result.content}")
    except Exception as e:
        print(f"❌ Failed: {str(e)}")

async def main():
    await test_llm("low", "Zhipu GLM")
    await test_llm("high", "Claude Opus")

if __name__ == "__main__":
    asyncio.run(main())

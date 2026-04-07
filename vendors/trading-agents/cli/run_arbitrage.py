#!/usr/bin/env python3
"""
Launcher script for the Event-Driven Narrative Arbitrage Module.
"""
import os
import sys
import argparse
import logging
from dotenv import load_dotenv

# Ensure we can import tradingagents from the project root
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from tradingagents.agents.researchers.arbitrage_researcher import NarrativeArbitrageResearcher

def main():
    # Load environment configuration where keys are stored
    load_dotenv()
    
    # 检查必要的环境变量（统一从 .env 或 config/models.yaml 读取）
    missing = []
    if not os.environ.get("ZHIPUAI_API_KEY"):
        missing.append("ZHIPUAI_API_KEY")
    if not os.environ.get("FMP_API_KEY"):
        missing.append("FMP_API_KEY")
    if not os.environ.get("FIRECRAWL_API_KEY"):
        missing.append("FIRECRAWL_API_KEY")
    if missing:
        print(f"⚠️  缺少环境变量: {', '.join(missing)}")
        print("   请在 .env 或 config/.env 中配置后重试")
        sys.exit(1)

    logging.basicConfig(level=logging.INFO, format="%(message)s")
    
    parser = argparse.ArgumentParser(description="Run Narrative Arbitrage Discovery")
    parser.add_argument("--event", type=str, required=True, help="The macro political or tech event triggering the arbitrage")
    parser.add_argument("--model", type=str, default="glm-5.1", help="The reasoning model to use (default: glm-5.1)")
    
    args = parser.parse_args()

    print("\n" + "="*60)
    print("📈 INITIALIZING NARRATIVE ARBITRAGE PROTOCOL 📈")
    print("="*60)
    
    try:
        agent = NarrativeArbitrageResearcher(model_name=args.model, provider="zhipu")
        report = agent.run_arbitrage_analysis(macro_event=args.event)
        
        print("\n\n" + "="*60)
        print("📄 FINAL ARBITRAGE REPORT 📄")
        print("="*60)
        print(report)
        print("="*60 + "\n")
        
    except Exception as e:
        print(f"\n❌ FAILED TO EXECUTE PIPELINE: {e}")

if __name__ == "__main__":
    main()

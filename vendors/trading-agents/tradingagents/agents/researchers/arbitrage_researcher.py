import os
import time
import logging
from typing import List, Dict, Any, Tuple

from ...llm_clients.factory import create_llm_client
from ..utils.firecrawl_tool import FirecrawlTool

# Try to import OpenBB, but fail gracefully if not available in this scope
try:
    from openbb import obb
except ImportError:
    obb = None
    logging.warning("OpenBB not installed. Run: pip install openbb")

logger = logging.getLogger(__name__)

class NarrativeArbitrageResearcher:
    """Agent that performs multi-phase event-driven narrative arbitrage discovery."""

    def __init__(self, model_name: str = "glm-5.1", provider: str = "zhipu"):
        self.llm = create_llm_client(provider=provider, model=model_name).get_llm()
        self.firecrawl = FirecrawlTool()
        
        # Configure OpenBB
        fmp_key = os.environ.get("FMP_API_KEY")
        if fmp_key and obb:
            obb.user.credentials.fmp_api_key = fmp_key

    def _derive_proxy_keywords(self, macro_event: str) -> str:
        """Phase 1: Deduce upstream/downstream proxy beneficiaries."""
        prompt = f"""
        你是一个对全球地缘政治、政策周期和资本市场极其敏感的二级市场游资架构师。
        任务：进行【叙事套利 (Narrative Arbitrage)】的二阶与三阶派生。
        避开一线龙头，寻找为了兑现该事件，在供应链/政策链上不可或缺的底层消耗品或硬核组件。

        请阅读以下宏观催化剂：
        {macro_event}

        只输出一层由逗号分隔的纯英文技术/产品名词集合（不超过 4 个。例如：SMR Components, Uranium Miners, Liquid Cooling）。绝对不要带其他废话。
        """
        logger.info("Executing Phase 1: Deriving proxy target technical components...")
        response = self.llm.invoke(prompt)
        return response.strip()

    def _scan_openbb_candidates(self, proxy_keywords: str, initial_pool: List[str] = None) -> List[str]:
        """Phase 2: Screen companies using OpenBB based on generated keywords."""
        if not obb:
            logger.error("OpenBB is missing. Cannot execute Phase 2.")
            return []
            
        logger.info(f"Executing Phase 2: Scanning OpenBB fundamentals with keywords: {proxy_keywords}")
        
        # Mocking an extensive screener logic by mapping against a provided sub-sector pool
        # In a full-blown screener, we would use obb.equity.screener, but profiles fetching is safer
        # Let's assume the user passes a pool of components/micro-caps (or we define default sectors)
        if not initial_pool:
            # Fallback pool spanning various sectors to show detection bounds
            initial_pool = ["AAOI", "LITE", "WDC", "OKLO", "CCJ", "CEG", "VRT", "ETN", "EAT", "NVDA", "SMCI"]
            
        shortlist = []
        for ticker in initial_pool:
            try:
                profile_res = obb.equity.profile(symbol=ticker, provider="fmp").results
                if not profile_res:
                    continue
                
                desc = getattr(profile_res[0], 'description', '')
                
                # If any of the derived keywords are conceptually linked to the description
                # To be rigorous, we ask the LLM to do the validation, but rudimentary keyword filtering works for speed
                eval_prompt = f"评价 {ticker} 的业务：\n{desc[:500]}\n是否涵盖这些领域之一: {proxy_keywords}? YES/NO"
                eval_res = self.llm.invoke(eval_prompt)
                
                if "YES" in eval_res.upper():
                    shortlist.append(ticker)
                    
                time.sleep(0.3)  # Rate limiting
            except Exception as e:
                logger.warning(f"Failed to screen {ticker}: {e}")
                
        return shortlist

    def _verify_with_firecrawl(self, shortlist: List[str], event: str) -> Dict[str, str]:
        """Phase 3: Fetch real-world real-time status."""
        logger.info("Executing Phase 3: Firecrawl Intelligence Web Check...")
        intelligence_report = {}
        for ticker in shortlist:
            # Construct a search query finding the intersection of the ticker and the event impact
            query = f"{ticker} stock company recent updates news catalyst"
            news_md = self.firecrawl.search_intelligence(query)
            
            prompt = f"""
            你是一名风控官。我们的剧本是基于以下事件炒作标的 {ticker}：
            【初始事件】：{event}
            
            以下是 Firecrawl 刚刚抓到的该公司的最新动向：
            {news_md}
            
            请判断最新动向是否证实了这种炒作逻辑（比如它是否刚接了相关订单，是否属于该风口）。
            用一两句中文核心概括【做多理由】或【淘汰理由】。
            """
            verdict = self.llm.invoke(prompt)
            intelligence_report[ticker] = verdict.strip()
            
        return intelligence_report

    def run_arbitrage_analysis(self, macro_event: str, search_pool: List[str] = None) -> str:
        """Executes the full pipeline and returns a formatted report."""
        report = [f"💥 **EVENT TRIGGERED**: {macro_event}"]
        
        # Phase 1
        keywords = self._derive_proxy_keywords(macro_event)
        report.append(f"🎯 **DERIVED PROXIES**: {keywords}")
        
        # Phase 2
        shortlist = self._scan_openbb_candidates(keywords, search_pool)
        if not shortlist:
            return "\n".join(report) + "\n\n❌ Found no pure-play candidates matching the derived narrative in the current pool."
            
        report.append(f"🔍 **SCREENED TARGETS**: {', '.join(shortlist)}")
        
        # Phase 3
        intel = self._verify_with_firecrawl(shortlist, macro_event)
        
        report.append("\n📈 **INTELLIGENCE VERIFICATION** 📈")
        for ticker, verdict in intel.items():
            report.append(f"- **{ticker}**:\n  > {verdict}")
            
        return "\n".join(report)

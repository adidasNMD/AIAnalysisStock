import yfinance as yf
import re
import asyncio

def extract_tickers(query: str) -> list:
    """Extract standard US ticker symbols from the query."""
    # Find all uppercase words of length 2-5
    words = re.findall(r'\b[A-Z]{2,5}\b', query)
    # Filter common non-tickers
    stopwords = {"HOW", "WHAT", "WHY", "THE", "AND", "ITS", "FOR", "ARE", "ANY"}
    tickers = [w for w in words if w not in stopwords]
    return list(set(tickers))

async def fetch_stock_data(ticker_symbol: str) -> str:
    """Fetch structured quant data for a stock ticker using asyncio wrapper."""
    def _fetch():
        try:
            ticker = yf.Ticker(ticker_symbol)
            hist = ticker.history(period="1mo")
            if hist.empty:
                return f"[Finance Tool] Ticker {ticker_symbol} yielded no data."
            
            latest_close = hist['Close'].iloc[-1]
            old_close = hist['Close'].iloc[0]
            month_change = ((latest_close - old_close) / old_close) * 100
            
            info = ticker.info
            pe_ratio = info.get('trailingPE', 'N/A')
            forward_pe = info.get('forwardPE', 'N/A')
            short_ratio = info.get('shortRatio', 'N/A')
            market_cap = info.get('marketCap', 'N/A')
            if market_cap != 'N/A':
                market_cap = f"${market_cap / 1e9:.2f}B"
            
            output = f"=== {ticker_symbol} Quantitative Profile ===\n"
            output += f"Current Price: ${latest_close:.2f}\n"
            output += f"1-Month Change: {month_change:.2f}%\n"
            output += f"Market Cap: {market_cap}\n"
            output += f"Trailing P/E: {pe_ratio} | Forward P/E: {forward_pe}\n"
            output += f"Short Ratio (Days to cover): {short_ratio}\n"
            
            # Additional contextual data
            recommendation = info.get('recommendationKey', 'N/A')
            output += f"Analyst Consensus: {recommendation.upper()}\n"
            
            return output
        except Exception as e:
            return f"[Finance Tool Error] Unable to fetch {ticker_symbol}: {str(e)}"
            
    loop = asyncio.get_event_loop()
    return await loop.run_in_executor(None, _fetch)

async def execute_finance_analysis(query: str) -> str:
    """Entry point for the LLM Scout Tool to pull financial numbers."""
    tickers = extract_tickers(query)
    if not tickers:
        return "No strictly formatted ticker symbols found in query."
    
    # We only fetch up to 3 tickers to avoid spamming the terminal
    tasks = [fetch_stock_data(sym) for sym in tickers[:3]]
    results = await asyncio.gather(*tasks)
    
    return "\n\n".join(results)

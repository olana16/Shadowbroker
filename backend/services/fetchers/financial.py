"""Financial data fetchers — defense stocks and oil prices.

Uses yfinance batch download to minimise Yahoo Finance requests and avoid rate limiting.
"""
import logging
import json
from pathlib import Path
import yfinance as yf
from services.fetchers._store import latest_data, _data_lock, _mark_fresh
from services.fetchers.retry import with_retry

logger = logging.getLogger(__name__)

_MARKETS_CACHE_PATH = Path(__file__).parent.parent.parent / "data" / "markets_cache.json"


def _load_market_cache() -> dict:
    try:
        if _MARKETS_CACHE_PATH.exists():
            with open(_MARKETS_CACHE_PATH, "r", encoding="utf-8") as f:
                cached = json.load(f)
            if isinstance(cached, dict):
                return cached
    except (IOError, OSError, json.JSONDecodeError, ValueError) as e:
        logger.warning(f"Failed to load markets cache: {e}")
    return {}


def _save_market_cache(stocks: dict, oil: dict) -> None:
    try:
        _MARKETS_CACHE_PATH.parent.mkdir(parents=True, exist_ok=True)
        with open(_MARKETS_CACHE_PATH, "w", encoding="utf-8") as f:
            json.dump({"stocks": stocks, "oil": oil}, f, indent=2, ensure_ascii=False)
    except (IOError, OSError) as e:
        logger.warning(f"Failed to save markets cache: {e}")


def load_cached_markets_into_store() -> int:
    cached = _load_market_cache()
    stocks = cached.get("stocks", {})
    oil = cached.get("oil", {})
    if not stocks and not oil:
        return 0
    with _data_lock:
        if not latest_data.get("stocks") and stocks:
            latest_data["stocks"] = stocks
        if not latest_data.get("oil") and oil:
            latest_data["oil"] = oil
    if stocks:
        _mark_fresh("stocks")
    if oil:
        _mark_fresh("oil")
    logger.info("Loaded cached markets into store: %s stocks, %s oil", len(stocks), len(oil))
    return len(stocks) + len(oil)


def _batch_fetch(symbols: list[str], period: str = "5d") -> dict:
    """Fetch multiple tickers in a single yfinance request. Returns {symbol: {price, change_percent, up}}."""
    try:
        hist = yf.download(symbols, period=period, auto_adjust=True, progress=False)
        if hist.empty:
            return {}
        close = hist["Close"]
        result = {}
        for sym in symbols:
            try:
                col = close[sym] if len(symbols) > 1 else close
                col = col.dropna()
                if len(col) < 1:
                    continue
                current = float(col.iloc[-1])
                prev = float(col.iloc[0]) if len(col) > 1 else current
                change = ((current - prev) / prev * 100) if prev else 0
                result[sym] = {
                    "price": round(current, 2),
                    "change_percent": round(change, 2),
                    "up": bool(change >= 0),
                }
            except Exception as e:
                logger.warning(f"Could not parse {sym}: {e}")
        return result
    except Exception as e:
        logger.warning(f"Batch fetch failed: {e}")
        return {}


_STOCK_TICKERS = ["RTX", "LMT", "NOC", "GD", "BA", "PLTR"]
_OIL_MAP = {"WTI Crude": "CL=F", "Brent Crude": "BZ=F"}
_ALL_TICKERS = _STOCK_TICKERS + list(_OIL_MAP.values())

_MARKET_COOLDOWN_SECONDS = 1800  # fetch at most once every 30 minutes
_last_market_fetch: float = 0.0


def _fetch_all_market_data():
    """Single yfinance download for all market tickers to avoid rate limiting."""
    raw = _batch_fetch(_ALL_TICKERS, period="5d")
    stocks = {sym: raw[sym] for sym in _STOCK_TICKERS if sym in raw}
    oil = {name: raw[sym] for name, sym in _OIL_MAP.items() if sym in raw}
    return stocks, oil


@with_retry(max_retries=2, base_delay=10)
def fetch_defense_stocks():
    global _last_market_fetch
    import time
    if time.time() - _last_market_fetch < _MARKET_COOLDOWN_SECONDS:
        return
    try:
        stocks, oil = _fetch_all_market_data()
        if stocks:
            _last_market_fetch = time.time()
            with _data_lock:
                latest_data['stocks'] = stocks
                if oil:
                    latest_data['oil'] = oil
            _save_market_cache(stocks, oil)
            _mark_fresh("stocks")
            if oil:
                _mark_fresh("oil")
            logger.info(f"Markets: {len(stocks)} stocks, {len(oil)} oil tickers")
        else:
            logger.warning("Markets: empty result from yfinance (rate limited?)")
    except Exception as e:
        logger.error(f"Error fetching market data: {e}")


@with_retry(max_retries=1, base_delay=10)
def fetch_oil_prices():
    # Oil is now fetched together with stocks in fetch_defense_stocks to use a single request.
    # This function is kept for scheduler compatibility but is a no-op if stocks already ran.
    with _data_lock:
        if latest_data.get('oil'):
            return  # Already populated by fetch_defense_stocks
    try:
        _, oil = _fetch_all_market_data()
        if oil:
            with _data_lock:
                latest_data['oil'] = oil
                stocks = latest_data.get('stocks', {})
            _save_market_cache(stocks, oil)
            _mark_fresh("oil")
    except Exception as e:
        logger.error(f"Error fetching oil: {e}")

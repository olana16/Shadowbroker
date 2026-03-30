"""Telegram channel fetching and message extraction."""
import asyncio
import logging
import os
import sys
from datetime import datetime, timezone
from pathlib import Path
try:
    from telethon import TelegramClient
    from telethon.errors import FloodWaitError, AuthKeyInvalidError, SessionPasswordNeededError
    TELETHON_AVAILABLE = True
except ModuleNotFoundError:
    TelegramClient = None  # type: ignore
    FloodWaitError = Exception
    AuthKeyInvalidError = Exception
    SessionPasswordNeededError = Exception
    TELETHON_AVAILABLE = False

from services.fetchers._store import latest_data, _data_lock, _mark_fresh
from services.fetchers.retry import with_retry
from services.telegram_config import get_enabled_channels

logger = logging.getLogger("services.data_fetcher")

# Telegram API credentials from environment
API_ID = os.environ.get("TELEGRAM_API_ID")
API_HASH = os.environ.get("TELEGRAM_API_HASH")
BOT_TOKEN = os.environ.get("TELEGRAM_BOT_TOKEN")
TELEGRAM_USE_BOT = os.environ.get("TELEGRAM_USE_BOT", "auto").lower()
SESSION_NAME = "shadowbroker_session"
BOT_SESSION_NAME = "shadowbroker_bot_session"
BASE_DIR = Path(__file__).resolve().parent.parent.parent
SESSION_DIR = BASE_DIR
SNAPSHOT_MESSAGE_LIMIT = 10

# Cache file for last message IDs
CACHE_DIR = BASE_DIR / "data"
CACHE_FILE = CACHE_DIR / "telegram_cache.json"


def _session_path(name):
    """Return an absolute Telethon session base path."""
    return SESSION_DIR / name


def _session_file(name):
    """Return the concrete session file path used by Telethon."""
    return SESSION_DIR / f"{name}.session"

def _load_cache():
    """Load last message IDs from cache."""
    if CACHE_FILE.exists():
        try:
            import json
            with open(CACHE_FILE, 'r') as f:
                return json.load(f)
        except Exception as e:
            logger.warning(f"Failed to load Telegram cache: {e}")
    return {}

def _save_cache(cache):
    """Save last message IDs to cache."""
    CACHE_DIR.mkdir(exist_ok=True)
    try:
        import json
        with open(CACHE_FILE, 'w') as f:
            json.dump(cache, f, indent=2)
    except Exception as e:
        logger.warning(f"Failed to save Telegram cache: {e}")

def _get_channel_config():
    """Get configured Telegram channels."""
    channels = get_enabled_channels()
    return [ch["username"] for ch in channels]

async def _fetch_channel_messages(client, channel_username, last_id=None, limit=50):
    """Fetch latest messages from a Telegram channel."""
    try:
        # Get channel entity
        channel = await client.get_entity(channel_username)
        
        # Fetch messages (limit to recent ones)
        messages = []
        async for message in client.iter_messages(channel, limit=limit, min_id=last_id or 0):
            if message.text:  # Only text messages for now
                messages.append({
                    'id': message.id,
                    'text': message.text,
                    'date': message.date,
                    'channel': channel_username,
                })
        
        # Sort by date (newest first)
        messages.sort(key=lambda x: x['date'], reverse=True)
        logger.info(f"Fetched {len(messages)} messages from {channel_username}, last_id={last_id}")
        return messages
        
    except Exception as e:
        logger.warning(f"Failed to fetch from {channel_username}: {e}")
        return []

def _normalize_telegram_to_news(messages, channel_name):
    """Convert Telegram messages to news item format."""
    news_items = []
    
    # Get keyword filter from environment
    keyword_filter = os.environ.get("TELEGRAM_KEYWORDS", "").lower().split(",")
    keyword_filter = [kw.strip() for kw in keyword_filter if kw.strip()]
    
    for msg in messages:
        text = msg['text']
        
        # Apply keyword filtering if configured
        if keyword_filter:
            text_lower = text.lower()
            if not any(kw in text_lower for kw in keyword_filter):
                continue
        
        # Basic risk scoring based on keywords
        risk_keywords = ['war', 'attack', 'crisis', 'military', 'nuclear', 'strike', 'conflict', 'tension', 'emergency', 'breaking']
        text_lower = text.lower()
        risk_score = 1
        for kw in risk_keywords:
            if kw in text_lower:
                risk_score += 2
        risk_score = min(10, risk_score)
        
        # Try to geocode based on content (reuse news geocoding logic)
        from services.fetchers.news import _resolve_coords
        coords = _resolve_coords(text)
        
        # Create title from first line or truncate
        lines = text.split('\n', 1)
        title = lines[0][:100] + "..." if len(lines[0]) > 100 else lines[0]
        
        news_item = {
            "title": title,
            "link": f"https://t.me/{channel_name.lstrip('@')}/{msg['id']}",
            "published": msg['date'].isoformat(),
            "source": f"Telegram:{channel_name}",
            "risk_score": risk_score,
            "coords": list(coords) if coords else None,
            "cluster_count": 1,
            "articles": [{
                "title": text,
                "link": f"https://t.me/{channel_name.lstrip('@')}/{msg['id']}",
                "published": msg['date'].isoformat(),
                "source": f"Telegram:{channel_name}",
                "risk_score": risk_score,
                "coords": list(coords) if coords else None
            }],
            "machine_assessment": None,
            "telegram_message_id": msg['id']
        }
        news_items.append(news_item)
    
    return news_items

@with_retry(max_retries=2, base_delay=5)
def fetch_telegram():
    """Fetch messages from configured Telegram channels."""
    if not TELETHON_AVAILABLE:
        logger.warning("Telethon is not installed; Telegram feed is disabled. Install with: pip install telethon")
        return
    if not API_ID or not API_HASH:
        logger.warning("Telegram API credentials not configured. Set TELEGRAM_API_ID and TELEGRAM_API_HASH.")
        return
    
    channels = _get_channel_config()
    cache = _load_cache()
    
    async def _run():
        use_bot = False
        if TELEGRAM_USE_BOT == "true":
            use_bot = True
        elif TELEGRAM_USE_BOT == "false":
            use_bot = False
        elif BOT_TOKEN:
            # prefer explicit user session if exists
            user_session_file = _session_file(SESSION_NAME)
            if user_session_file.exists():
                use_bot = False
            else:
                use_bot = True

        if use_bot and BOT_TOKEN:
            client = TelegramClient(str(_session_path(BOT_SESSION_NAME)), int(API_ID), API_HASH)
            await client.start(bot_token=BOT_TOKEN)
        else:
            client = TelegramClient(str(_session_path(SESSION_NAME)), int(API_ID), API_HASH)
            await client.start()

            # Detect accidental bot session in user mode
            me = await client.get_me()
            if me and getattr(me, 'bot', False):
                logger.error('Telegram user mode is active, but current session is a bot account.\n'
                             'Delete shadowbroker_session* in data path and re-run setup_telegram_session() in user mode.')
                await client.disconnect()
                return []

        all_messages = []
        for channel in channels:
            last_id = cache.get(channel, 0)
            messages = await _fetch_channel_messages(client, channel, last_id)
            if messages:
                # Update cache with latest message ID
                cache[channel] = max(msg['id'] for msg in messages)
                all_messages.extend(messages)

        if not all_messages:
            logger.info("No new Telegram messages since cached IDs; fetching a recent snapshot instead")
            for channel in channels:
                messages = await _fetch_channel_messages(
                    client,
                    channel,
                    last_id=None,
                    limit=SNAPSHOT_MESSAGE_LIMIT,
                )
                if messages:
                    cache[channel] = max(msg['id'] for msg in messages)
                    all_messages.extend(messages)
        
        await client.disconnect()
        return all_messages
    
    try:
        # Run async function in sync context
        loop = asyncio.new_event_loop()
        asyncio.set_event_loop(loop)
        messages = loop.run_until_complete(_run())
        loop.close()
        
        # Convert to news format
        telegram_news = []
        for channel in channels:
            channel_msgs = [m for m in messages if m['channel'] == channel]
            logger.info(f"Channel {channel} returned {len(channel_msgs)} raw messages")
            if channel_msgs:
                telegram_news.extend(_normalize_telegram_to_news(channel_msgs, channel))

        # Sort by date (newest first)
        telegram_news.sort(key=lambda x: x['published'], reverse=True)
        
        # Limit to recent items
        telegram_news = telegram_news[:100]

        with _data_lock:
            latest_data['telegram'] = telegram_news
        _mark_fresh("telegram")

        # Save cache
        _save_cache(cache)

        if telegram_news:
            logger.info(f"Fetched {len(telegram_news)} Telegram messages from {len(channels)} channels")
        else:
            logger.info("Fetched Telegram with 0 news items (no qualifying text/keywords or already seen)")

    except Exception as e:
        logger.error(f"Telegram fetch failed: {e}")

# For testing/initial setup
async def setup_telegram_session():
    """Setup Telegram session (run once to authenticate)."""
    if not API_ID or not API_HASH:
        print("Please set TELEGRAM_API_ID and TELEGRAM_API_HASH environment variables.")
        return

    if BOT_TOKEN:
        client = TelegramClient(BOT_SESSION_NAME, int(API_ID), API_HASH)
        await client.start(bot_token=BOT_TOKEN)
        print("Telegram bot session created with TELEGRAM_BOT_TOKEN. You can now run fetch_telegram().")
    else:
        if not sys.stdin.isatty():
            print("Interactive login required for user session, but no tty is available.")
            print("Use TELEGRAM_BOT_TOKEN or run this command in an interactive terminal:")
            print("  python3 -m services.fetchers.telegram --setup")
            return
        client = TelegramClient(SESSION_NAME, int(API_ID), API_HASH)
        await client.start()
        print("Telegram user session created. You can now run fetch_telegram().")

    await client.disconnect()

if __name__ == "__main__":
    # Allow running setup from command line
    asyncio.run(setup_telegram_session())

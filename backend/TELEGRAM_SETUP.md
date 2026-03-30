# Telegram Integration Setup

This document explains how to set up Telegram channel monitoring for the OSINT system.

## Prerequisites

1. A Telegram account
2. API credentials from Telegram

## Obtaining Telegram API Credentials

1. Go to https://my.telegram.org/auth
2. Log in with your Telegram account
3. Click on "API development tools"
4. Create a new application (fill in the form)
5. Note down your `api_id` and `api_hash`

## Environment Variables

Set the following environment variables:

```bash
export TELEGRAM_API_ID="your_api_id_here"
export TELEGRAM_API_HASH="your_api_hash_here"
```

For Docker, add them to your `.env` file or docker-compose.yml.

## Configuration

Telegram channels are configured in `backend/config/telegram_channels.json`. The format is:

```json
{
  "channels": [
    {
      "username": "@channel_username",
      "name": "Display Name",
      "enabled": true
    }
  ]
}
```

## First Run Setup

Before the system can fetch messages, you need to authenticate the Telegram session:

1. Start the backend
2. Run the setup script (or call the setup function manually)

The system will create a session file that persists authentication.

## API Endpoints

- `GET /api/telegram-feed` - Get latest Telegram messages in normalized format
- Messages are also included in `GET /api/live-data/slow` under the "telegram" key

## Features

- Fetches latest messages from configured channels
- Normalizes to same format as RSS news items
- Avoids duplicates using message ID caching
- Optional keyword filtering via `TELEGRAM_KEYWORDS` env var
- Rate limiting and retry logic
- Geocoding based on message content

## Example API Response

```json
[
  {
    "title": "Breaking: Major development in Ukraine",
    "link": "https://t.me/bbcworld/12345",
    "published": "2024-01-15T10:30:00+00:00",
    "source": "Telegram:@bbcworld",
    "risk_score": 8,
    "coords": [50.45, 30.52],
    "cluster_count": 1,
    "articles": [...],
    "telegram_message_id": 12345
  }
]
```

## Troubleshooting

- If authentication fails, delete the session file and re-run setup
- Check logs for rate limiting messages
- Ensure channels are public and accessible
- Verify API credentials are correct
#!/usr/bin/env python3
import json
import os
import sys
import time
import urllib.parse
import urllib.request


BASE_URL = "https://slack.com/api"


def env(name: str) -> str:
    value = os.environ.get(name, "").strip()
    if not value:
        raise RuntimeError(f"Missing required environment variable: {name}")
    return value


SLACK_BOT_TOKEN = env("SLACK_BOT_TOKEN")
CHANNEL_ID = env("SLACK_CHANNEL_ID")


def slack_get(method: str, params: dict[str, str]) -> dict:
    query = urllib.parse.urlencode(params)
    request = urllib.request.Request(
        f"{BASE_URL}/{method}?{query}",
        headers={
            "Authorization": f"Bearer {SLACK_BOT_TOKEN}",
        },
        method="GET",
    )
    with urllib.request.urlopen(request) as response:
        return json.loads(response.read().decode("utf-8"))


def slack_post(method: str, payload: dict[str, str]) -> dict:
    encoded = urllib.parse.urlencode(payload).encode("utf-8")
    request = urllib.request.Request(
        f"{BASE_URL}/{method}",
        data=encoded,
        headers={
            "Authorization": f"Bearer {SLACK_BOT_TOKEN}",
            "Content-Type": "application/x-www-form-urlencoded",
        },
        method="POST",
    )
    with urllib.request.urlopen(request) as response:
        return json.loads(response.read().decode("utf-8"))


def iter_messages() -> list[dict]:
    messages: list[dict] = []
    cursor = ""

    while True:
        params = {
            "channel": CHANNEL_ID,
            "limit": "200",
        }
        if cursor:
            params["cursor"] = cursor

        data = slack_get("conversations.history", params)
        if not data.get("ok"):
            raise RuntimeError(f"conversations.history failed: {data}")

        messages.extend(data.get("messages", []))

        cursor = data.get("response_metadata", {}).get("next_cursor", "")
        if not cursor:
            break

    return messages


def should_delete(message: dict) -> bool:
    subtype = message.get("subtype")
    bot_id = message.get("bot_id")
    app_id = message.get("app_id")
    username = message.get("username", "")

    return bool(
        bot_id
        or app_id
        or subtype == "bot_message"
        or username in {"Resource Tracker", "ResourceTracker"}
    )


def delete_message(ts: str) -> tuple[bool, dict]:
    data = slack_post(
        "chat.delete",
        {
            "channel": CHANNEL_ID,
            "ts": ts,
        },
    )
    return bool(data.get("ok")), data


def main() -> int:
    messages = iter_messages()
    candidates = [message for message in messages if should_delete(message) and message.get("ts")]

    print(f"Found {len(messages)} total messages, {len(candidates)} bot/app messages eligible for deletion.")

    deleted = 0
    failed = 0

    for message in candidates:
        ts = str(message["ts"])
        ok, data = delete_message(ts)
        if ok:
            deleted += 1
            print(f"Deleted {ts}")
        else:
            failed += 1
            print(f"Failed to delete {ts}: {data}")
        time.sleep(1)

    print(f"Done. Deleted={deleted} Failed={failed}")
    return 0 if failed == 0 else 1


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except Exception as exc:
        print(str(exc), file=sys.stderr)
        raise SystemExit(1)

#!/usr/bin/env python3
"""
OpenWorld Agent Loop
Connects an AI agent to OpenWorld and runs its autonomous life loop.

Usage:
  # Simple brain (no LLM needed):
  python agent-loop.py --name "MyAgent" --url https://openworld-restless-feather-3844.fly.dev

  # With existing token:
  python agent-loop.py --token YOUR_TOKEN --url https://openworld-restless-feather-3844.fly.dev

  # With LLM brain (needs ANTHROPIC_API_KEY or OPENAI_API_KEY):
  python agent-loop.py --name "SmartAgent" --url https://openworld-restless-feather-3844.fly.dev --brain llm

Environment variables:
  OPENWORLD_URL      - Server URL (default: https://openworld-restless-feather-3844.fly.dev)
  OPENWORLD_TOKEN    - Existing agent token (skip registration)
  OPENWORLD_NAME     - Agent name for registration
  ANTHROPIC_API_KEY  - Anthropic API key for Claude brain
  OPENAI_API_KEY     - OpenAI API key for GPT brain
"""

import os
import sys
import json
import time
import argparse
import urllib.request
import urllib.error

SERVER = os.environ.get("OPENWORLD_URL", "https://openworld-restless-feather-3844.fly.dev")
TICK_INTERVAL = 2.0  # seconds between action cycles


def api_call(method, path, token=None, data=None):
    """Make an API call to the OpenWorld server."""
    url = f"{SERVER}{path}"
    headers = {"Content-Type": "application/json"}
    if token:
        headers["Authorization"] = f"Bearer {token}"

    body = json.dumps(data).encode() if data else None
    req = urllib.request.Request(url, data=body, headers=headers, method=method)

    try:
        with urllib.request.urlopen(req) as resp:
            return json.loads(resp.read().decode())
    except urllib.error.HTTPError as e:
        error_body = e.read().decode()
        try:
            return json.loads(error_body)
        except:
            return {"ok": False, "error": str(e), "body": error_body}
    except urllib.error.URLError as e:
        return {"ok": False, "error": f"Connection failed: {e}"}


def register(name):
    """Register a new agent and return the token."""
    print(f"Registering agent '{name}'...")
    result = api_call("POST", "/api/register", data={"name": name})

    if "token" in result:
        print(f"Registered! ID: {result['id']}")
        print(f"Token: {result['token']}")
        print(f"\nSave this token! Set OPENWORLD_TOKEN={result['token']}")
        return result["token"]
    else:
        print(f"Registration failed: {result.get('error', result)}")
        sys.exit(1)


def connect(token):
    """Connect agent to the world."""
    print("Connecting to world...")
    result = api_call("POST", "/api/connect", token=token)

    if result.get("ok"):
        print("Connected and spawned!")
        return True
    else:
        print(f"Connection failed: {result.get('error', result)}")
        return False


def look(token):
    """Get agent's perception of the world."""
    return api_call("GET", "/api/look", token=token)


def act(token, action, params, thinking):
    """Perform an action in the world."""
    return api_call("POST", "/api/action", token=token, data={
        "action": action,
        "params": params,
        "thinking": thinking,
    })


def get_notes(token):
    """Get agent's saved notes (memory)."""
    result = api_call("GET", "/api/notes", token=token)
    return result.get("notes", [])


def save_note(token, key, value):
    """Save a note to persistent memory."""
    return api_call("POST", "/api/notes", token=token, data={"key": key, "value": value})


# ============================================================
# BRAIN 1: Simple (no LLM)
# ============================================================

def simple_brain(perception, token):
    """
    Simple built-in brain for demo purposes.
    Gathers resources, eats, rests, explores.
    """
    energy = perception.get("energy", 0)
    hp = perception.get("hp", 0)
    inventory = perception.get("inventory", [])
    nearby_agents = perception.get("nearby_agents", [])
    nearby_resources = perception.get("nearby_resources", [])
    messages = perception.get("messages", [])

    # Reply to messages
    if messages:
        msg = messages[-1]
        return "speak", {"message": f"Hey {msg.get('from', 'friend')}! I'm gathering resources."}, "being social"

    # Eat if low HP
    if hp < 50:
        has_food = any(i["item"] in ("berries", "fish", "bread") for i in inventory)
        if has_food:
            return "eat", {}, "low HP, eating to heal"

    # Rest if low energy
    if energy < 20:
        return "rest", {}, "low energy, need to rest"

    # Gather nearby resources
    if nearby_resources:
        res = nearby_resources[0]
        pos = perception.get("position", {})
        dx = res["tile"][0] - pos.get("x", 0)
        dy = res["tile"][1] - pos.get("y", 0)

        # Adjacent? Gather it
        if abs(dx) + abs(dy) == 1:
            direction = "east" if dx > 0 else "west" if dx < 0 else "south" if dy > 0 else "north"
            return "gather", {"direction": direction}, f"gathering {res['type']}"

        # On same tile? Gather without direction
        if abs(dx) + abs(dy) == 0:
            return "gather", {}, f"gathering {res['type']}"

        # Move toward it
        if abs(dx) >= abs(dy):
            direction = "east" if dx > 0 else "west"
        else:
            direction = "south" if dy > 0 else "north"
        return "move", {"direction": direction}, f"moving toward {res['type']}"

    # Explore randomly
    import random
    direction = random.choice(["north", "south", "east", "west"])
    return "move", {"direction": direction}, "exploring the world"


# ============================================================
# BRAIN 2: LLM-powered (Claude or GPT)
# ============================================================

def llm_brain(perception, token):
    """
    LLM-powered brain. Uses Claude (preferred) or GPT to decide actions.
    The agent thinks, remembers, and acts autonomously.
    """
    # Load notes for context
    notes = get_notes(token)
    notes_text = "\n".join(f"  {n['key']}: {n['value']}" for n in notes) if notes else "  (no notes yet)"

    prompt = f"""You are an autonomous AI agent living in OpenWorld, a persistent 2D survival world.

YOUR CURRENT STATE:
{json.dumps(perception, indent=2)}

YOUR MEMORY (saved notes):
{notes_text}

AVAILABLE ACTIONS:
- move: {{"direction": "north/south/east/west"}} (cost: 1 energy)
- look: {{}} (extended 10-tile view, cost: 0)
- rest: {{}} (recover energy, +20 in shelter)
- eat: {{"item": "berries/fish/bread"}} or {{}} for auto-pick (heal HP + energy)
- gather: {{"direction": "north/south/east/west"}} or {{}} (collect resources, 3 ticks)
- craft: {{"recipe": "plank/string/bread/stone_block/sword/shield/axe/fishing_rod"}}
- build: {{"structure": "shelter/storage/crafting_table/bridge/wall/door", "direction": "..."}}
- deposit: {{"item": "...", "qty": N}} (store in owned storage)
- withdraw: {{"item": "...", "qty": N}} (take from owned storage)
- speak: {{"message": "..."}} (heard in 5-tile radius)
- whisper: {{"agent_id": "...", "message": "..."}} (private, must be adjacent)
- give: {{"agent_id": "...", "item": "...", "qty": N}}
- trade_propose: {{"agent_id": "...", "offer": [{{"item":"...", "qty":N}}], "request": [{{"item":"...", "qty":N}}]}}
- trade_respond: {{"trade_id": "...", "accept": true/false}}
- attack: {{"agent_id": "..."}} (15-25 dmg, +10 with sword)
- steal: {{"agent_id": "..."}} (50% chance)
- set_bio: {{"text": "..."}}
- place_sign: {{"text": "..."}}

RULES:
- You are fully autonomous. No human tells you what to do.
- You have a personality, goals, and opinions.
- You can cooperate, trade, fight, build — anything you want.
- Save important info to notes (goals, ally names, base location, plans).
- Be strategic about resources, alliances, and territory.

Respond with EXACTLY this JSON format:
{{"action": "ACTION_NAME", "params": {{}}, "thinking": "your reasoning (max 500 chars)", "save_notes": [{{"key": "...", "value": "..."}}]}}

The save_notes array is optional — include it only when you want to update your memory.
Think carefully. What do you do?"""

    response_text = call_llm(prompt)

    try:
        # Extract JSON from response
        start = response_text.find("{")
        end = response_text.rfind("}") + 1
        if start >= 0 and end > start:
            decision = json.loads(response_text[start:end])
        else:
            raise ValueError("No JSON found")

        # Save any notes the LLM wants to remember
        for note in decision.get("save_notes", []):
            if note.get("key") and note.get("value"):
                save_note(token, note["key"], note["value"])

        return decision["action"], decision.get("params", {}), decision.get("thinking", "thinking...")

    except (json.JSONDecodeError, KeyError, ValueError) as e:
        print(f"  LLM response parse error: {e}")
        return "rest", {}, "failed to parse LLM response, resting"


def call_llm(prompt):
    """Call Claude or GPT API. Zero dependencies — uses urllib."""
    anthropic_key = os.environ.get("ANTHROPIC_API_KEY")
    openai_key = os.environ.get("OPENAI_API_KEY")

    if anthropic_key:
        return call_claude(prompt, anthropic_key)
    elif openai_key:
        return call_openai(prompt, openai_key)
    else:
        print("ERROR: Set ANTHROPIC_API_KEY or OPENAI_API_KEY for LLM brain")
        sys.exit(1)


def call_claude(prompt, api_key):
    """Call Claude API (zero dependencies)."""
    data = json.dumps({
        "model": "claude-sonnet-4-20250514",
        "max_tokens": 500,
        "messages": [{"role": "user", "content": prompt}],
    }).encode()

    req = urllib.request.Request(
        "https://api.anthropic.com/v1/messages",
        data=data,
        headers={
            "Content-Type": "application/json",
            "x-api-key": api_key,
            "anthropic-version": "2023-06-01",
        },
        method="POST",
    )

    with urllib.request.urlopen(req, timeout=30) as resp:
        result = json.loads(resp.read().decode())
        return result["content"][0]["text"]


def call_openai(prompt, api_key):
    """Call OpenAI API (zero dependencies)."""
    data = json.dumps({
        "model": "gpt-4o-mini",
        "max_tokens": 500,
        "messages": [{"role": "user", "content": prompt}],
    }).encode()

    req = urllib.request.Request(
        "https://api.openai.com/v1/chat/completions",
        data=data,
        headers={
            "Content-Type": "application/json",
            "Authorization": f"Bearer {api_key}",
        },
        method="POST",
    )

    with urllib.request.urlopen(req, timeout=30) as resp:
        result = json.loads(resp.read().decode())
        return result["choices"][0]["message"]["content"]


# ============================================================
# MAIN LOOP
# ============================================================

def run_loop(token, brain_fn):
    """Main agent life loop."""
    print("\n--- Agent is now living in OpenWorld ---")
    print("Press Ctrl+C to disconnect\n")

    consecutive_errors = 0

    while True:
        try:
            # 1. Perceive
            perception = look(token)

            if not perception.get("position"):
                error = perception.get("error", "unknown")
                print(f"Perception error: {error}")

                # Dead? Reconnect
                if error == "agent_not_awake":
                    print("Agent not awake, reconnecting...")
                    connect(token)

                consecutive_errors += 1
                if consecutive_errors > 5:
                    print("Too many errors, reconnecting...")
                    connect(token)
                    consecutive_errors = 0
                time.sleep(TICK_INTERVAL)
                continue

            consecutive_errors = 0
            pos = perception["position"]
            energy = perception.get("energy", 0)
            hp = perception.get("hp", 0)

            # 2. Decide
            action, params, thinking = brain_fn(perception, token)

            # 3. Act
            result = act(token, action, params, thinking)

            status = "OK" if result.get("ok") else result.get("error", "?")
            print(f"[{pos['x']},{pos['y']}] HP:{hp} E:{energy} | {action} -> {status}")
            if thinking:
                print(f"  thought: {thinking[:80]}")

            # 4. Wait for next tick
            time.sleep(TICK_INTERVAL)

        except KeyboardInterrupt:
            print("\n\nDisconnecting...")
            api_call("POST", "/api/disconnect", token=token)
            print("Agent is now sleeping. Use the same token to reconnect.")
            break
        except Exception as e:
            print(f"Error: {e}")
            time.sleep(TICK_INTERVAL)


def main():
    parser = argparse.ArgumentParser(description="OpenWorld Agent Loop")
    parser.add_argument("--name", default=os.environ.get("OPENWORLD_NAME", "Agent"),
                        help="Agent name for registration")
    parser.add_argument("--token", default=os.environ.get("OPENWORLD_TOKEN"),
                        help="Existing agent token (skip registration)")
    parser.add_argument("--url", default=os.environ.get("OPENWORLD_URL", "https://openworld-restless-feather-3844.fly.dev"),
                        help="OpenWorld server URL")
    parser.add_argument("--brain", choices=["simple", "llm"], default="simple",
                        help="Brain type: 'simple' (no LLM) or 'llm' (Claude/GPT)")

    args = parser.parse_args()
    global SERVER
    SERVER = args.url

    brain_fn = simple_brain if args.brain == "simple" else llm_brain

    if args.brain == "llm":
        if not os.environ.get("ANTHROPIC_API_KEY") and not os.environ.get("OPENAI_API_KEY"):
            print("ERROR: LLM brain requires ANTHROPIC_API_KEY or OPENAI_API_KEY")
            sys.exit(1)
        print("Using LLM brain (Claude/GPT)")
    else:
        print("Using simple brain. For smarter agents: --brain llm")

    # Get or create token
    token = args.token
    if not token:
        token = register(args.name)

    # Set initial bio
    if args.brain == "llm":
        act(token, "set_bio", {"text": "An autonomous AI agent exploring OpenWorld."}, "setting my identity")

    # Connect
    if not connect(token):
        sys.exit(1)

    # Run life loop
    run_loop(token, brain_fn)


if __name__ == "__main__":
    main()

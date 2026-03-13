#!/usr/bin/env python3
"""
OpenWorld Agent Loop
Connects an AI agent to OpenWorld and runs its autonomous life loop.

Usage:
  python agent-loop.py --name "MyAgent" --url http://openworld.example.com

  # Or with existing token:
  python agent-loop.py --token YOUR_TOKEN --url http://openworld.example.com

Environment variables:
  OPENWORLD_URL   - Server URL (default: http://localhost:3001)
  OPENWORLD_TOKEN - Existing agent token (skip registration)
  OPENWORLD_NAME  - Agent name for registration
  OPENAI_API_KEY  - OpenAI API key for agent brain (or any LLM provider)
"""

import os
import sys
import json
import time
import argparse
import urllib.request
import urllib.error

SERVER = os.environ.get("OPENWORLD_URL", "http://localhost:3001")
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


def simple_brain(perception):
    """
    Simple built-in brain for demo purposes.
    Replace this with your LLM-powered brain!

    Returns: (action, params, thinking)
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
        return "speak", {"message": f"Hey {msg.get('from_name', 'friend')}!"}, "being social"

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


def run_loop(token, brain_fn=None):
    """Main agent life loop."""
    if brain_fn is None:
        brain_fn = simple_brain
        print("\nUsing simple built-in brain. For smarter agents, integrate your LLM!")

    print("\n--- Agent is now living in OpenWorld ---")
    print("Press Ctrl+C to disconnect\n")

    consecutive_errors = 0

    while True:
        try:
            # 1. Perceive
            perception = look(token)

            if not perception.get("position"):
                print(f"Perception error: {perception.get('error', 'unknown')}")
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
            action, params, thinking = brain_fn(perception)

            # 3. Act
            result = act(token, action, params, thinking)

            status = "OK" if result.get("ok") else result.get("error", "?")
            print(f"[{pos['x']},{pos['y']}] HP:{hp} E:{energy} | {action} -> {status}")

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
    parser.add_argument("--url", default=os.environ.get("OPENWORLD_URL", "http://localhost:3001"),
                        help="OpenWorld server URL")

    args = parser.parse_args()
    global SERVER
    SERVER = args.url

    # Get or create token
    token = args.token
    if not token:
        token = register(args.name)

    # Connect
    if not connect(token):
        sys.exit(1)

    # Run life loop
    run_loop(token)


if __name__ == "__main__":
    main()

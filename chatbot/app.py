"""
Chatbot service — the MCP *host*.

Flow: the dashboard posts a message here -> we send it to an Ollama model
along with the tool list advertised by the ERP MCP server -> whatever tools
the model calls get executed over MCP against the Node/Express backend ->
results go back to the model -> its final answer returns to the browser.

The tools are not defined in this file. They come from mcp-server/server.py
at startup over the protocol, so adding a tool there makes it available here
with no change to this file.
"""
import atexit
import json
import logging
import os
import sys
import uuid
from collections import OrderedDict

import requests
from dotenv import load_dotenv
from flask import Flask, jsonify, request
from flask_cors import CORS

from mcp_client import MCPBridge

load_dotenv()
logging.basicConfig(level=os.environ.get("LOG_LEVEL", "INFO"))
log = logging.getLogger("chatbot")

app = Flask(__name__)
CORS(app)

OLLAMA_HOST = os.environ.get("OLLAMA_HOST", "https://ollama.com").rstrip("/")
OLLAMA_API_KEY = os.environ.get("OLLAMA_API_KEY", "")
OLLAMA_MODEL = os.environ.get("OLLAMA_MODEL", "gpt-oss:120b")
DEFAULT_THINK = os.environ.get("OLLAMA_THINK", "medium")

MCP_SERVER_PATH = os.environ.get(
    "MCP_SERVER_PATH",
    os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "mcp-server", "server.py"),
)
BACKEND_URL = os.environ.get("BACKEND_URL", "http://localhost:4000")

MAX_TOOL_ROUNDS = int(os.environ.get("MAX_TOOL_ROUNDS", "8"))
MAX_SESSIONS = int(os.environ.get("MAX_SESSIONS", "200"))
MAX_HISTORY_MESSAGES = int(os.environ.get("MAX_HISTORY_MESSAGES", "40"))

SYSTEM_PROMPT = (
    "You are the assistant built into an ERP system. You can read and change "
    "products, inventory, vendors, customers, orders and sales through the "
    "tools provided.\n\n"
    "Rules:\n"
    "- Never state stock levels, prices, totals or order details from memory. "
    "Call a tool and report what it returns.\n"
    "- Users refer to things by name, not id. Look the name up first "
    "(list_products, list_customers, list_vendors) to get the id, then act.\n"
    "- If a name matches more than one record, ask which one instead of "
    "picking. If it matches none, say so.\n"
    "- Before anything destructive — deleting a record, voiding a sale, "
    "cancelling an order — state exactly what will be affected and wait for "
    "the user to confirm.\n"
    "- 'Sold' means quick_sale. 'Ordered' means create_order. 'Received' or "
    "'restocked' means adjust_inventory with a positive delta.\n"
    "- After a change, confirm in one line what changed and the new state.\n"
    "- When generate_sales_report returns a url, the link appears to the "
    "user automatically as a download button — just say the report is "
    "ready and mention the headline numbers. Don't paste the raw URL "
    "yourself or wrap it in markdown.\n"
    "- If a tool returns an error, tell the user what it said. Don't retry "
    "the same call unchanged."
)

# session_id -> message list. Bounded in both directions: oldest sessions are
# evicted, and each session's history is trimmed, so a long-running process
# can't grow without limit or overflow the model's context.
SESSIONS: "OrderedDict[str, list]" = OrderedDict()

mcp = MCPBridge(command=sys.executable, args=[MCP_SERVER_PATH], env={"BACKEND_URL": BACKEND_URL})


def _startup():
    try:
        mcp.connect()
    except Exception:
        log.exception("Could not start the MCP server at %s", MCP_SERVER_PATH)


_startup()
atexit.register(mcp.close)


def _trim(history: list) -> list:
    """Keep the system prompt and the most recent exchanges."""
    if len(history) <= MAX_HISTORY_MESSAGES:
        return history
    system, rest = history[0], history[1:]
    kept = rest[-(MAX_HISTORY_MESSAGES - 1):]
    # Don't start on an orphaned tool result — the model rejects that.
    while kept and kept[0].get("role") == "tool":
        kept.pop(0)
    return [system] + kept


def call_ollama(messages: list, think: str) -> dict:
    headers = {"Content-Type": "application/json"}
    if OLLAMA_API_KEY:
        headers["Authorization"] = f"Bearer {OLLAMA_API_KEY}"
    payload = {
        "model": OLLAMA_MODEL,
        "messages": messages,
        "tools": mcp.tool_schemas(),
        "stream": False,
        "think": think,
    }
    resp = requests.post(f"{OLLAMA_HOST}/api/chat", headers=headers, json=payload, timeout=180)
    resp.raise_for_status()
    return resp.json()


def run_tool_calls(tool_calls: list) -> tuple[list, list, list]:
    """Execute the model's requested tools over MCP. Returns the tool-result
    messages for the model, a short trace for the UI, and any file links a
    tool handed back (e.g. a generated PDF), so the frontend can render a
    real download button instead of relying on the model to word a link
    correctly in its reply."""
    messages, trace, attachments = [], [], []
    for call in tool_calls:
        fn = call.get("function", {})
        name = fn.get("name")
        raw = fn.get("arguments", {})
        try:
            args = raw if isinstance(raw, dict) else json.loads(raw or "{}")
        except ValueError:
            args = {}

        log.info("tool: %s(%s)", name, args)
        output = mcp.call(name, args)

        messages.append({
            "role": "tool",
            "name": name,
            "content": json.dumps(output, default=str)[:20000],
        })
        ok = not (isinstance(output, dict) and "error" in output)
        trace.append({"tool": name, "arguments": args, "ok": ok})

        if ok and isinstance(output, dict) and isinstance(output.get("url"), str) \
                and output["url"].startswith("http"):
            attachments.append({
                "tool": name,
                "url": output["url"],
                "filename": output.get("filename") or output["url"].rsplit("/", 1)[-1],
            })
    return messages, trace, attachments


@app.get("/health")
def health():
    return jsonify({
        "status": "ok",
        "mcp_connected": mcp.session is not None,
        "tools": [t.name for t in mcp.tools],
        "model": OLLAMA_MODEL,
    })


@app.get("/tools")
def tools():
    """What the MCP server is advertising. Handy for checking the connection
    without burning a model call."""
    return jsonify([
        {"name": t.name, "description": (t.description or "").strip()}
        for t in mcp.tools
    ])


@app.post("/chat")
def chat():
    body = request.get_json(force=True, silent=True) or {}
    user_message = (body.get("message") or "").strip()
    session_id = body.get("session_id") or str(uuid.uuid4())
    think = body.get("think", DEFAULT_THINK)
    if think not in ("low", "medium", "high"):
        think = DEFAULT_THINK

    if not user_message:
        return jsonify({"error": "message is required"}), 400
    if mcp.session is None:
        return jsonify({"error": "The ERP tool server isn't connected. Check the chatbot logs."}), 503

    history = SESSIONS.pop(session_id, None) or [{"role": "system", "content": SYSTEM_PROMPT}]
    history.append({"role": "user", "content": user_message})

    trace = []
    attachments = []
    try:
        for _ in range(MAX_TOOL_ROUNDS):
            result = call_ollama(_trim(history), think)
            message = result.get("message", {})
            history.append(message)

            tool_calls = message.get("tool_calls")
            if not tool_calls:
                break

            tool_messages, round_trace, round_attachments = run_tool_calls(tool_calls)
            history.extend(tool_messages)
            trace.extend(round_trace)
            attachments.extend(round_attachments)
        else:
            history.append({
                "role": "assistant",
                "content": "I couldn't finish that within the tool-call limit. "
                           "Could you narrow the request or break it into steps?",
            })
    except requests.HTTPError as e:
        detail = e.response.text[:300] if e.response is not None else str(e)
        log.error("Ollama error: %s", detail)
        return jsonify({"error": f"The model request failed: {detail}"}), 502
    except requests.RequestException as e:
        return jsonify({"error": f"Could not reach the model at {OLLAMA_HOST}: {e}"}), 502

    SESSIONS[session_id] = _trim(history)
    while len(SESSIONS) > MAX_SESSIONS:
        SESSIONS.popitem(last=False)

    reply = history[-1].get("content", "") or "(no reply)"
    return jsonify({"session_id": session_id, "reply": reply, "tool_calls": trace, "attachments": attachments})


@app.post("/reset")
def reset():
    body = request.get_json(force=True, silent=True) or {}
    SESSIONS.pop(body.get("session_id", ""), None)
    return jsonify({"success": True})


if __name__ == "__main__":
    app.run(host="0.0.0.0", port=int(os.environ.get("PORT", 5001)))
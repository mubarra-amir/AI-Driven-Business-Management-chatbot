"""
Bridge between Flask (synchronous) and the MCP Python SDK (asyncio).

The MCP session has to stay open for the life of the process — it's a
long-lived stdio pipe to the server subprocess, not a request/response
thing. So we run one asyncio loop on a background thread, open the session
there once at startup, and hand Flask request threads a blocking interface
onto it.
"""
import asyncio
import json
import logging
import os
import threading
from contextlib import AsyncExitStack
from typing import Any

from mcp import ClientSession, StdioServerParameters
from mcp.client.stdio import stdio_client

log = logging.getLogger(__name__)


class MCPBridge:
    def __init__(self, command: str, args: list[str], env: dict | None = None):
        self._params = StdioServerParameters(
            command=command,
            args=args,
            env={**os.environ, **(env or {})},
        )
        self._loop = asyncio.new_event_loop()
        self._stack: AsyncExitStack | None = None
        self.session: ClientSession | None = None
        self.tools: list = []
        self._thread = threading.Thread(target=self._run_loop, daemon=True, name="mcp-loop")
        self._thread.start()

    def _run_loop(self):
        asyncio.set_event_loop(self._loop)
        self._loop.run_forever()

    def _submit(self, coro, timeout: float = 60):
        return asyncio.run_coroutine_threadsafe(coro, self._loop).result(timeout=timeout)

    # -- lifecycle ---------------------------------------------------------

    async def _connect(self):
        self._stack = AsyncExitStack()
        read, write = await self._stack.enter_async_context(stdio_client(self._params))
        self.session = await self._stack.enter_async_context(ClientSession(read, write))
        await self.session.initialize()
        result = await self.session.list_tools()
        self.tools = result.tools

    def connect(self, timeout: float = 30):
        """Start the MCP server subprocess and handshake with it."""
        self._submit(self._connect(), timeout=timeout)
        log.info("MCP connected, %d tools: %s",
                 len(self.tools), ", ".join(t.name for t in self.tools))
        return self.tools

    def close(self):
        if self._stack is not None:
            try:
                self._submit(self._stack.aclose(), timeout=10)
            except Exception:
                log.warning("MCP shutdown was not clean", exc_info=True)
        self._loop.call_soon_threadsafe(self._loop.stop)

    # -- use ---------------------------------------------------------------

    def tool_schemas(self) -> list[dict]:
        """MCP tool definitions translated into the shape Ollama's chat API
        expects for function calling."""
        schemas = []
        for tool in self.tools:
            schemas.append({
                "type": "function",
                "function": {
                    "name": tool.name,
                    "description": (tool.description or "").strip(),
                    "parameters": tool.inputSchema or {"type": "object", "properties": {}},
                },
            })
        return schemas

    def call(self, name: str, arguments: dict, timeout: float = 60) -> Any:
        """Invoke a tool and flatten the MCP content blocks into something
        JSON-serialisable to hand back to the model."""
        if self.session is None:
            return {"error": "MCP session is not connected"}
        try:
            result = self._submit(self.session.call_tool(name, arguments), timeout=timeout)
        except Exception as e:
            return {"error": f"Tool '{name}' failed: {e}"}

        if getattr(result, "isError", False):
            return {"error": _flatten(result.content)}
        return _flatten(result.content)


def _flatten(content) -> Any:
    """MCP returns a list of content blocks. Our tools return JSON, which the
    SDK serialises into a text block, so parse it back where we can."""
    texts = []
    for block in content or []:
        text = getattr(block, "text", None)
        if text is None:
            texts.append(f"[{getattr(block, 'type', 'unknown')} content]")
            continue
        try:
            return json.loads(text)
        except (ValueError, TypeError):
            texts.append(text)
    if not texts:
        return {}
    return texts[0] if len(texts) == 1 else texts

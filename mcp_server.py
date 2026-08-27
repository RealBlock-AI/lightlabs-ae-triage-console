"""Local MCP Inspector proxy for the Light Labs Streamable HTTP endpoint.

Run `mcp dev mcp_server.py` from this repository. The Inspector connects to this
local stdio server, while the diagnostic tool signs requests to the actual
Light Labs MCP endpoint exactly as Slack does. This script is development-only
and is never used by the deployed application.
"""

import hashlib
import hmac
import json
import os
import time

import httpx
from mcp.server.fastmcp import FastMCP


mcp = FastMCP("Light Labs MCP Transport Inspector")
TARGET_URL = os.getenv("LIGHTLABS_MCP_URL", "http://127.0.0.1:3000/mcp")


def signed_headers(payload: str) -> dict[str, str]:
    secret = os.getenv("SLACK_SIGNING_SECRET")
    if not secret:
        raise RuntimeError("SLACK_SIGNING_SECRET must be set before running the Inspector proxy.")
    timestamp = str(int(time.time()))
    signature = hmac.new(
        secret.encode(), f"v0:{timestamp}:{payload}".encode(), hashlib.sha256
    ).hexdigest()
    return {
        "content-type": "application/json",
        "accept": "application/json, text/event-stream",
        "x-slack-request-timestamp": timestamp,
        "x-slack-signature": f"v0={signature}",
    }


def decode_streamable_response(raw: str) -> dict:
    if raw.lstrip().startswith("event:"):
        messages = [line[5:].strip() for line in raw.splitlines() if line.startswith("data:")]
        if not messages:
            raise RuntimeError("The MCP endpoint returned an SSE frame without JSON-RPC data.")
        return json.loads(messages[-1])
    return json.loads(raw)


async def invoke(method: str, params: dict, request_id: int) -> dict:
    payload = json.dumps({"jsonrpc": "2.0", "id": request_id, "method": method, "params": params})
    async with httpx.AsyncClient(timeout=20) as client:
        response = await client.post(TARGET_URL, headers=signed_headers(payload), content=payload)
    if response.status_code >= 400:
        raise RuntimeError(f"{method} failed with {response.status_code}: {response.text[:500]}")
    return decode_streamable_response(response.text)


@mcp.tool()
async def inspect_lightlabs_transport() -> str:
    """Verify the deployed endpoint's Streamable HTTP initialize and discovery surface."""
    initialize = await invoke(
        "initialize",
        {
            "protocolVersion": "2025-06-18",
            "capabilities": {},
            "clientInfo": {"name": "python-mcp-inspector-proxy", "version": "1.0.0"},
        },
        1,
    )
    tools = await invoke("tools/list", {}, 2)
    prompts = await invoke("prompts/list", {}, 3)
    resources = await invoke("resources/list", {}, 4)
    return json.dumps(
        {
            "endpoint": TARGET_URL,
            "protocol_version": initialize.get("result", {}).get("protocolVersion"),
            "tool_names": [tool["name"] for tool in tools.get("result", {}).get("tools", [])],
            "prompt_names": [prompt["name"] for prompt in prompts.get("result", {}).get("prompts", [])],
            "resource_uris": [resource["uri"] for resource in resources.get("result", {}).get("resources", [])],
            "response_transport": "Streamable HTTP (JSON or SSE accepted)",
        },
        indent=2,
    )

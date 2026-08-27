# Local MCP Inspector Validation

The development-only proxy at `mcp_server.py` starts successfully under the Python MCP Inspector with the command below. The Inspector is available locally at `http://localhost:6274/` while the development session is active.

```bash
cd /home/ubuntu/lightlabs-ae-triage-console
mcp dev mcp_server.py
```

The proxy signs its requests to the TypeScript `/mcp` endpoint using `SLACK_SIGNING_SECRET`, then validates the Streamable HTTP `initialize`, `tools/list`, `prompts/list`, and `resources/list` lifecycle. This keeps local diagnostics aligned with Slack Identity Auth rather than creating an unauthenticated production backdoor.

The installed `mcp` command uses the 1.x Inspector runtime because its CLI supports the requested `mcp dev mcp_server.py` workflow. The Inspector’s own UI recommends its newer standalone package; the production server itself uses the current TypeScript MCP SDK and is independent of the Inspector version.

The local Inspector successfully connected to `Light Labs MCP Transport Inspector` and completed its stdio `initialize` request. The available `inspect_lightlabs_transport` diagnostic tool signs requests to the running Light Labs endpoint and returns the production server’s discovered protocol version, tools, prompts, and resources.

The Inspector listed the diagnostic tool with an explicit string result schema. The next verification step is to invoke that tool, which runs the Streamable HTTP lifecycle against the locally running application without relaxing production signature verification.

# MCP Knowledge Retrieval Contract

## Decision

**Yes: knowledge retrieval belongs in the Light Labs MCP layer.** The MCP tool must call the same internal retrieval service exposed for Slack’s `triage/retriever-http.js`, rather than maintain a second index or a separate scoring model. The HTTP endpoint is the stable service boundary; the MCP tool is the authenticated, Slackbot-facing wrapper.

This avoids two dangerous failure modes: divergent answers between Slack and Slackbot, and treating a retrieval score as language-model confidence. A source score is only a deterministic measure of textual relevance to the query. It is never proof that a customer-facing answer is safe.

## Service endpoint

`POST https://lighttriage-gdngkmys.manus.space/knowledge/retrieve`

### Request

```json
{
  "query": "What is the turnaround for allergen testing?",
  "interaction_id": "int_optional_auditable_link"
}
```

`interaction_id` is optional but should be provided for a Slack support interaction so retrieval evidence is linked to the decision trail.

### Response

```json
{
  "sources": [
    {
      "title": "Allergen testing",
      "url": "https://www.lightlabs.com/tests/allergen",
      "snippet": "…attributable source excerpt…",
      "score": 0.91
    }
  ]
}
```

The public response deliberately conforms to the required `sources` shape. Internally, the service records the returned-source count, retrieval relevance, policy result, policy reasons, source URL, source-document hash, and retrieval timestamp. The response contains **retrieval relevance**, not model confidence.

## MCP tool

```text
name: triage.retrieve_knowledge
title: Retrieve approved Light Labs knowledge
readOnlyHint: true
```

### Input schema

```json
{
  "type": "object",
  "additionalProperties": false,
  "required": ["query"],
  "properties": {
    "query": { "type": "string", "minLength": 3, "maxLength": 2000 },
    "interaction_id": { "type": "string", "minLength": 1 }
  }
}
```

### MCP result

The tool returns the exact retrieval service payload as structured content. When all sources are irrelevant, unavailable, stale, disabled, or classified `review_required`, the tool may still show sources for AE research but it must return a **closed** reply-eligibility status. The Slackbot model must not synthesize a substantive customer answer from that result.

```json
{
  "sources": [
    {
      "title": "Compliance reporting for product testing",
      "url": "https://www.lightlabs.com/compliance",
      "snippet": "…",
      "score": 0.64
    }
  ],
  "reply_eligibility": {
    "status": "closed",
    "reasons": [
      "Top retrieval relevance is below the verified-answer threshold.",
      "Retrieved content requires human review and cannot independently open the answer gate."
    ]
  }
}
```

The `reply_eligibility` object is an MCP-only safety extension. It does not alter the required HTTP `sources` contract.

## Required security behavior

The real `POST /mcp` route remains pending the Slack app credentials. Once enabled, it must verify the Slack request signature before trusting `params._meta.slack`, resolve the Slack identity to an internal AE/team role, and restrict the tool to authorized internal users. Customer Slack senders do not invoke this tool directly.

No MCP tool may accept an arbitrary URL, write knowledge content, modify sources, run raw SQL, or send a customer response. Only the controlled source catalog and its administration workflow may create or refresh indexed content.

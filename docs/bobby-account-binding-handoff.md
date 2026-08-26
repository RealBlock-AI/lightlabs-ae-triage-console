# Bobby Account-Binding Handoff

## Purpose

Light Labs now exposes a deterministic, authenticated account-binding endpoint and a portal review flow. Bobby should submit a customer’s link request from its DM/onboarding surface, then **poll the existing identity lookup** on subsequent DM or App Home interactions. Bobby must not send a binding-completion DM until the lookup reports a bound result with a previously undelivered delivery key.

## Credentials and endpoints

| Call | Endpoint | Credential | Use |
|---|---|---|---|
| Account binding | `POST /integrations/bobby/account-binding` | `Bearer <LIGHTLABS_BINDING_SECRET>` | Submit a deterministic link request. This is a dedicated, rotatable credential—not the MCP or bridge credential. |
| Identity lookup | `get_contact_by_slack_user` through `/integrations/bobby/mcp` | Existing Bobby MCP credential | Poll current customer identity state and retrieve an approved next-DM payload. |
| Bridge ingestion | `POST /integrations/slack-bot/ingest` | Existing custom-bridge credential | Submit normalized customer support events. This is unchanged. |

> **Do not put any credential in Slack messages, modal values, logs, or customer-facing output.** The binding credential is exchanged out of band with the Light Labs operator and is independently rotatable.

## Binding submission

Submit the Slack-side payload to `POST /integrations/bobby/account-binding` exactly once per deterministic `binding_id`. Retrying the same payload is safe: Light Labs replays the authoritative stored result rather than creating another review row.

```json
{
  "schema_version": "0.1",
  "binding_id": "bnd_<stable_sha256_claim_digest>",
  "requested_at": "2026-08-25T18:04:11.482Z",
  "slack": {
    "team_id": "T091XR4PAQY",
    "user_id": "U091XR4PTT2",
    "display_name": "Nic"
  },
  "claimed": {
    "full_name": "Nic Thatcher",
    "email": "nthatcher@launch99.agency",
    "company": "Launch99 Agency",
    "email_source": "slack"
  }
}
```

The `binding_id` must be a stable digest of the claimed fields, not a timestamp or counter. `email_source: "slack"` means Slack supplied the address; `"typed"` means the customer entered it in the modal and requires AE review.

## Required response handling

| Response status | Bobby action | Customer-facing behavior |
|---|---|---|
| `bound` | Persist the result and continue with the next-DM polling logic below. | Do not send a duplicate completion message if the delivery key was already handled. |
| `pending` | Persist the binding ID; re-check on the customer’s next DM or App Home interaction. | “Thanks—your account-link request is with the Light Labs team for review.” |
| `conflict` | Persist the binding ID and stop showing the link button. Do not resubmit. | “Another Slack account is already linked to that Light Labs account, so your account manager needs to review it.” |
| `rejected` | Persist the result and do not retry automatically. | Use the returned `message`, or say the team will follow up. |
| Non-2xx, non-JSON, or unknown status | Fail closed; log the full response for operator review. | Do not claim the account was linked. |

## Polling and the next-DM confirmation

On each customer DM/App Home interaction, invoke `get_contact_by_slack_user` with the Slack `team_id` and `user_id`. When the lookup returns the following shape, Bobby should send `text` as a DM **once per `delivery_key`**:

```json
{
  "status": "verified",
  "link_confirmation": {
    "linked": true,
    "status": "bound",
    "binding_id": "bnd_...",
    "account_id": "acct_launch99",
    "account_name": "Launch99 Agency",
    "owner_id": "owner_sarah",
    "next_dm": {
      "delivery_key": "account-binding:bnd_...",
      "binding_id": "bnd_...",
      "text": "Your Slack account is now linked to Launch99 Agency. You can ask Bobby for support in any shared customer channel."
    }
  }
}
```

Bobby must store sent `delivery_key` values durably on its side. If the same key appears again, it must **not** send another confirmation. Light Labs has no callback requirement or customer-specific secret; the stable identity is the Slack `(team_id, user_id)` pair, while the server-to-server credential authenticates Bobby.

## Portal review

Light Labs operators review requests at `/bindings` or at the per-request deep link returned as `review_url`, such as `/bindings/bnd_<id>`. The portal shows pending, bound, conflict, and rejected states. A conflict can only be replaced by the explicit **Resolve in favor of this request** action, so an existing identity is never silently overwritten.

## Launch99 verification reference

The current Launch99 binding is **bound** to `T091XR4PAQY / U091XR4PTT2` with binding ID `bnd_6cb028de5d06bc19bb41e7528c1e2f73`. Bobby should therefore send the next-DM confirmation only if `account-binding:bnd_6cb028de5d06bc19bb41e7528c1e2f73` has not already been recorded as delivered.

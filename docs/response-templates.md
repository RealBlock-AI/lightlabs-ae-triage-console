# Approved response templates

Two templates, written to open the auto lane for the two intents Appendix A
rates 100%-reachable. Everything else stays acknowledge-and-escalate.

Today `compose()` hardcodes its wording, and `resolve_support_request` returns
`verified_to_reply: false` on every path with the reason *"No versioned
customer-response template has been approved for this support request."*
That reason is accurate: approval does not exist as a concept in the schema.
These templates are written to be **rows**, so approval becomes a fact with a
name and a date attached rather than a string in a source file.

---

## 1. Why a template is a row, not a string

A template that lives in `compose()` cannot answer three questions the safety
posture depends on:

- **Who approved this wording, and when?** An auto-lane reply goes to a customer
  without a human seeing it. The wording is the thing being trusted, so it needs
  the same provenance as a `jurisdiction_requirements` row.
- **Which version was sent?** When a reply is wrong, the first question is what
  text actually went out. A string that has been edited since answers nothing.
- **Can it be withdrawn without a deploy?** Setting `approved_at = NULL` should
  close the auto lane for one intent immediately. Today that needs a release.

```sql
CREATE TABLE response_templates (
  id                VARCHAR(64) PRIMARY KEY,
  intent            VARCHAR(48) NOT NULL,
  version           INT NOT NULL,
  acknowledgment    TEXT NOT NULL,
  body              TEXT NOT NULL,          -- slot markers as {{slot}}
  max_sentences     INT NOT NULL DEFAULT 3,
  approved_by       VARCHAR(64),            -- NULL = not approved = not auto
  approved_at       DATETIME,
  retired_at        DATETIME,
  created_at        DATETIME NOT NULL,
  UNIQUE KEY ux_intent_version (intent, version)
);

CREATE TABLE template_slots (
  id            VARCHAR(64) PRIMARY KEY,
  template_id   VARCHAR(64) NOT NULL,
  slot          VARCHAR(48) NOT NULL,       -- matches {{slot}} in body
  source_table  VARCHAR(64) NOT NULL,       -- where the value must come from
  source_column VARCHAR(64) NOT NULL,
  required      TINYINT NOT NULL DEFAULT 1, -- an unfilled required slot demotes
  UNIQUE KEY ux_template_slot (template_id, slot)
);
```

`approved_by IS NULL` is the whole gate. C5 becomes a join rather than a
constant, and `verified_to_reply` can be true for the first time.

---

## 2. ORDER_STATUS

> *"hey any update on the vanilla protein order from last week? our retailer
> needs the COA by thursday"*

### Wording

**Acknowledgment:** `The latest records on this order are ready.`

**Body:**

```
Your {{product_name}} order is {{order_status}} and the laboratory state is
{{laboratory_state}}. The current estimated completion is
{{estimated_completion}}.{{deadline_clause}}
```

### Slots

| Slot | Source | Required | Notes |
|---|---|---|---|
| `product_name` | `products.name` | yes | Resolved entity, `candidate_count = 1` |
| `order_status` | `orders.status` | yes | Via `formatStatus` |
| `laboratory_state` | `tests.qbench_state` | yes | Via `formatStatus` |
| `estimated_completion` | `tests.estimated_complete_date` | yes | Via `formatDate` |
| `deadline_clause` | computed | no | See below |

### The deadline clause

The customer named Thursday. The estimate either meets it or it does not, and
that comparison is a date subtraction, not a judgement. Answering the stated
question is the difference between a useful reply and a status dump.

```
estimated_completion <= stated_deadline   → " That is ahead of the {{deadline}} date you mentioned."
estimated_completion >  stated_deadline   → " That is after the {{deadline}} date you mentioned, so I have flagged this for your account manager."
no deadline stated                        → ""  (omit entirely)
```

**A missed deadline demotes to assisted even though the sentence is
deterministic.** The clause states a fact; what follows it is a commercial
conversation about expediting, and that belongs to a human. The customer still
gets the answer immediately — they just get it with a person attached.

### Why this clears the output guard

No currency, no regulatory citation, and no verdict language. Note the trap:
`FORBIDDEN_IN_AUTO` matches `fail(ure)?`, so a `laboratory_state` of `Failed`
would demote this template on its own text. That is the correct direction but
the wrong reason, and it is finding F3 in the PR #1 review.

### Refusal conditions

| Condition | Result |
|---|---|
| `candidate_count ≠ 1` on the product | Refuse — C2. Two "vanilla protein" SKUs cannot be silently narrowed |
| `estimated_complete_date` is NULL | Refuse — C6. Do not say "soon" |
| Test not `published_at` and the customer asked for a result | Escalate — this template answers *status*, never a value |
| Deadline stated and missed | Answer, then demote |

---

## 3. OPS_DATA_EXPORT

> *"Can you send me everything we've tested this year? Our new QA hire is
> starting and wants to review history."*

### Wording

**Acknowledgment:** `The released test history is ready.`

**Body:**

```
There are {{released_count}} released test records on this account for
{{year}}. The full history is available in the platform, where it can be
reviewed and exported.{{access_clause}}
```

### Slots

| Slot | Source | Required | Notes |
|---|---|---|---|
| `released_count` | `COUNT(tests.published_at IS NOT NULL)` | yes | Released only |
| `year` | computed | yes | Calendar year |
| `access_clause` | `users.has_platform_login` | no | See below |

### Released only, and never zero

`published_at` is the release gate. Counting unpublished tests inflates the
figure with results the customer cannot open, which turns a helpful number into
a support ticket.

**A count of zero refuses.** Run against the live database this returned `0` for
an account that demonstrably has orders. From inside the query, *"you have no
released tests"* and *"the scoping missed your records"* are indistinguishable,
and only the first would have been sent. Zero is a claim about the customer's
account that a human should make.

### The access clause

The person who will actually use the link is the new QA hire, and a link they
cannot open is a worse answer than the PDFs they did not ask for.

```
requester has login, no one else named   → ""
a second person is named in the message  → " If {{named_person}} needs access, your account manager can add them."
requester has no platform login          → refuse — offering a link the asker cannot open is not an answer
```

### Refusal conditions

| Condition | Result |
|---|---|
| `released_count = 0` | Refuse |
| Requester lacks `view_results` | Refuse — C4, before any count is computed |
| Requester has no platform login | Refuse — route to provisioning |
| A named third party is not a known contact | Answer, and flag the access request separately |

### Worth flagging commercially

A new QA hire is a buying-committee expansion signal. The reply is auto; the
signal should still reach the AE queue with account context attached.

---

## 4. Seed

```sql
INSERT INTO response_templates
  (id, intent, version, acknowledgment, body, max_sentences, approved_by, approved_at, created_at)
VALUES
  ('tpl_order_status_v1', 'ORDER_STATUS', 1,
   'The latest records on this order are ready.',
   'Your {{product_name}} order is {{order_status}} and the laboratory state is {{laboratory_state}}. The current estimated completion is {{estimated_completion}}.{{deadline_clause}}',
   3, NULL, NULL, NOW()),
  ('tpl_data_export_v1', 'OPS_DATA_EXPORT', 1,
   'The released test history is ready.',
   'There are {{released_count}} released test records on this account for {{year}}. The full history is available in the platform, where it can be reviewed and exported.{{access_clause}}',
   3, NULL, NULL, NOW());
```

**`approved_by` and `approved_at` are deliberately NULL.** I wrote the wording;
I cannot approve it. Until a named person at Light Labs sets those two columns,
both templates exist and neither opens the auto lane — which is the correct
state, and is exactly what the gate is for.

---

## 5. What changes once they are approved

`compose()` stops holding wording and starts filling a row. C5 becomes
*"an approved template exists for this intent"* — a query. C6 becomes *"every
required slot is filled"* — a count against `template_slots`. And
`verified_to_reply` can return `true` for the first time, for exactly two
intents, with a named approver behind each.

Everything else keeps escalating, which is the honest number: **two of eight**,
with message 5 joining them after one human decision that never has to be made
twice.

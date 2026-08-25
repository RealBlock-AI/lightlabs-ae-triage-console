# Canonical Identity and Account Architecture

## Decision

The `users` table is the **single source of truth for every person** in the Light Labs application. It holds both internal staff and external customer users. Neither `contacts` nor `team_members` may become an independent identity authority after migration; both are retained temporarily only as compatibility records while their identity fields are backfilled into `users`.

| Concept | Canonical table | Cardinality | Notes |
|---|---|---:|---|
| Person | `users` | One row per human | Internal and external people share the same primary key namespace. |
| Application customer organization | `accounts` | One row per customer organization | This is the access boundary for testing-platform records. |
| HubSpot company | `accounts.hubspot_company_id` | One per account in the current model | CRM-only internal context. |
| Testing-platform account | `accounts.testing_platform_account_id` | One per account in the current model | Customer-facing operational system. |
| Customer affiliation | `account_memberships` | Many memberships per user and account | Buyers have one active membership; CoMan users may have multiple. |
| Internal ownership and routing | `accounts.owner_user_id` and `account_memberships.internal_owner_user_id` | One designated internal owner at each level | Membership owner defaults to the account owner but can be assigned explicitly. |

## Canonical Users

Internal staff use `role = 'admin'` and `login_method = 'google'`. Customer users use `role = 'user'` and `login_method = 'slack'`. The application enforces those pairings in service validation. Fixture identities are converted to supported production-shaped values during migration rather than remaining a third login method.

| User column | System of record | Semantics |
|---|---|---|
| `id` | App | Canonical person primary key. |
| `hubspot_contact_id` | HubSpot | Internal CRM person reference. |
| `testing_platform_user_id` | Testing platform | Customer-facing product access identity. |
| `slack_workspace_id` + `slack_user_id` | Slack | Globally unique only as a composite pair; neither ID is unique alone. |
| `role` | App | `admin` for internal staff; `user` for customers. |
| `login_method` | App | `google` for internal staff; `slack` for customers. |

> A Slack `user_id` is scoped to a Slack workspace. The same human can have different Slack identifiers in different workspaces. The authoritative uniqueness rule is therefore `(slack_workspace_id, slack_user_id)`, not email, display name, or Slack ID by itself.

## Account Memberships and Entitlements

`account_memberships` replaces any implied one-person-to-one-account relationship. It represents a user’s relationship to an app account and stores membership-specific privileges rather than placing them in `users`.

| Membership type | Allowed active memberships | Entitlements |
|---|---:|---|
| `buyer` | Exactly one | Standard buyer access to its own account. |
| `coman` | One or more | May manage multiple customer accounts; can hold CoMan-only flags such as `receive_coman_coas`. |

An application constraint and service-level validation prevent an external buyer from holding more than one active membership. A CoMan user may be active in multiple accounts. Each account can have many buyer and CoMan memberships.

## Explicit System Boundaries

| Domain | Customer-facing or internal | Required IDs | Naming rule |
|---|---|---|---|
| App account | Customer-facing access boundary | `accounts.id` | Use `account_id` only for the app account. |
| Testing platform | Customer-facing operational system | `testing_platform_account_id`, `testing_platform_user_id`, `testing_platform_product_id`, and analogous object IDs | Every ID includes the `testing_platform_` prefix. |
| HubSpot | Internal CRM | `hubspot_company_id`, `hubspot_contact_id`, `hubspot_deal_id` | Every ID includes the `hubspot_` prefix. |
| Slack | Interaction channel | `slack_workspace_id`, `slack_user_id` | Always store and look up the pair together. |

`products.app_account_id` and `orders.app_account_id` are the **application customer account**. `products.testing_platform_company_id`, `products.testing_platform_product_id`, and `orders.testing_platform_company_id` identify testing-platform objects. The legacy `account_id` and `company_id` columns are retained solely for compatibility during the migration and must not be used in new application logic. CRM company context is obtained through the owning application's `accounts.hubspot_company_id`.

## Migration Strategy

The migration is additive and non-destructive. It first adds the canonical columns and membership table, then backfills user references only when a match is unambiguous. Existing `contacts`, `team_members`, and `contact_id` references remain available during the compatibility period. New verification resolves a user first, then confirms that user’s active membership and the account’s internal owner before routing a Slack inquiry.

Known account mappings are backfilled only when the application account name exactly matches a canonical testing-platform company record. Accounts without that unambiguous match retain `NULL` in the new HubSpot and testing-platform ID columns; the migration does not invent external IDs from the legacy `company_id` field.

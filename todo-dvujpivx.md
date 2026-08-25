# Project TODO

- [x] Audit the existing navigation, dashboard views, and demo data against the revised Slack-first support requirements.
- [x] Rename the canonical queue to Slack Support and restrict its presentation to verified Slack-originated support questions.
- [x] Remove Pylon references, controls, mappings, and terminology from the prototype.
- [x] Replace the architecture view with an account-level mapping table that relates Slack identities, HubSpot companies, and Testing Platform accounts, including multiple contacts per company.
- [x] Remove or repurpose the intake view so every remaining dashboard view has an explicit operational purpose.
- [x] Rework capacity reporting into Support Performance metrics covering first response, resolution, automation versus human review, and feedback-loop progress over time.
- [x] Simplify Integrations into contextual datasource and field-mapping cards for HubSpot, Testing Platform, Slack identity/message, and Email, each marked read/write.
- [x] Surface email as contextual demo information in the unified dashboard and connect one email record to a relevant Slack inquiry.
- [x] Add or update focused Vitest coverage for the refreshed navigation and support demo model.
- [x] Visually inspect the desktop and mobile dashboard, fix issues found, and record a deployable checkpoint.
- [x] Audit the existing account, contact, association, and field-definition schemas before extending the demo model.
- [x] Add owner portfolios with 40 Co-Man accounts and 120 direct brand accounts per AM/AE in deterministic demo data.
- [x] Model Co-Man portfolios that associate each Co-Man with 5–15 brand accounts and calculate total managed accounts per owner.
- [x] Add contact-level Co-Man-to-brand permissions that support granular view and edit scope within a Co-Man portfolio.
- [x] Add long-form definition, searchable, writable, and source-type metadata to HubSpot field definitions and create equivalent Testing Platform and support field catalogs.
- [x] Refresh Account Mapping with an AM/AE owner selector, brand versus Co-Man portfolio counts, and relationship visibility.
- [x] Refresh Integrations to expose the HubSpot, Testing Platform, and support field-reference catalogs with source labels.
- [x] Add focused database/model tests, visually validate the refreshed views, and save a deployable checkpoint.

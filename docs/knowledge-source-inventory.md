# Reviewed Light Labs Website Knowledge Inventory

The supplied inventory contains the Light Labs home page, public service and testing pages, the compliance page, article-style Insight URLs, paginated Insight listings, tags, case studies, and commercial pages. The first ingestion layer should include only versioned public-source documents whose content can be attributed directly to a canonical URL.

The initial eligible source families are `https://www.lightlabs.com/insights/*`, `https://www.lightlabs.com/tests/*`, and `https://www.lightlabs.com/compliance`. Navigation listings, Insight tag pages, pagination pages, careers, marketing demo pages, and query-string variants should be retained as discovery metadata but excluded from retrieval results to prevent duplicate, non-substantive, or commercial content from opening the answer gate.

Each retrieved source will retain its canonical URL, title, normalized snippet, capture timestamp, document hash, source class, and retrieval relevance. The supplied per-URL confidence is source-discovery metadata only; it must never be treated as retrieval relevance or model-answer confidence.

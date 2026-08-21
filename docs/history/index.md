---
title: History
---

# Verex — History

Every day's work log, newest first. Each entry records **Cause → Reasoning → Change → Result**
for the decisions taken that day. Dates are KST.

This list is built by Jekyll from the files in `docs/history/` at build time, so it never needs
updating by hand — add a new dated file, push to `main`, and it appears here.

{% assign entries = site.pages | where_exp: "p", "p.path contains 'history/'" | sort: "path" | reverse %}
{% assign shown = 0 %}
| Date | Entry |
|---|---|
{% for p in entries -%}
{% unless p.name == "index.md" or p.name == "README.md" -%}
{% assign shown = shown | plus: 1 -%}
| {{ p.name | slice: 0, 10 }} | [{{ p.title | default: p.name | remove: ".md" }}]({{ p.url | relative_url }}) |
{% endunless -%}
{% endfor %}

**{{ shown }} entries.**

The [combined early log](README.html) holds the 2026-04 → 2026-05 entries that were kept in a
single file before the one-file-per-day convention started.

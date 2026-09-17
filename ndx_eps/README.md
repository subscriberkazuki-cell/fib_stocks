# NASDAQ-100 (NDX) Historical Constituents — Reported EPS, 1999–2026

## What this is

An attempt at collecting **actual reported** (never estimated/forecast/interpolated)
Basic and Diluted EPS for companies that were ever NASDAQ-100 constituents between
1999 and 2026, plus the 4 CSV deliverables requested:

1. `NDX_EPS_1999_2026.csv` — long-format, one row per (ticker, period, eps type)
2. `NDX_EPS_Monthly_Pivot_1999_2026.csv` — wide format, one row per month
3. `NDX_EPS_Monthly_Aggregate_1999_2026.csv` — monthly summary statistics
4. `NDX_EPS_Data_Quality.csv` — per-ticker coverage/quality report

Plus two supporting files that aren't part of the required 4 but the other files
depend on and reference:

- `NDX_Constituents_Roster.csv` — the historical membership list (ticker, company,
  member_start/end, confidence, source) used to compute `ndx_member` in the main file.
- `eps_source_facts_raw.csv` — every individual EPS figure as transcribed from its
  source, before reshaping into the final schema. Useful for auditing any single number.

## Important: this is a partial dataset, and here's exactly why

**The environment this was built in blocks essentially all outbound network access
except software package registries (pypi/npm/etc).** `data.sec.gov`, `www.sec.gov`,
SEC full-text search, Wikipedia, and every financial data site returned
`EGRESS_BLOCKED` / HTTP 403 on every attempt — via direct HTTP and via the
agent's own web-fetch tool. The **only** working channel to the outside world was
a web-search tool that returns AI-synthesized snippets of search results, not bulk
structured data, and cannot supply accession numbers or walk a filing index.

This makes the literal pipeline the task describes (SEC CompanyFacts/XBRL API bulk
pull, systematic 10-K/10-Q text mining for 1999–2008) impossible to execute in that
environment. **`fetch_sec_edgar_pipeline.py` in this folder is that literal pipeline**,
written and syntax-checked but not runnable there — run it from any machine with
normal internet access to get full, high-fidelity coverage (real CIKs for every
ticker, every XBRL-tagged EPS fact with accession numbers and filing dates, quarterly
as well as annual). See the script's docstring for usage and next steps.

Given that constraint, what's actually in the 4 CSVs here was collected by issuing
~80 targeted web searches, each asking for a specific company's EPS as stated in its
actual SEC 10-K/10-Q/20-F text (or, for a few points, a company earnings release
filed as SEC exhibit), and manually transcribing only figures that were explicitly
and unambiguously labeled in the returned content — nothing was computed, summed,
averaged, or split-adjusted by the agent. Numbers that came back ambiguous,
internally inconsistent, non-GAAP, or that looked like a retroactively
split-adjusted aggregator figure (e.g. macrotrends-style "restated for all later
splits" EPS, which does **not** match what a company actually reported at the time)
were discarded rather than guessed at. See "Known data-integrity findings" below.

**Net result: real, individually-sourced annual (10-K/20-F) diluted/basic EPS for
49 of the ~220 historical constituents identified, covering 1999–2024.** Quarterly
(10-Q) EPS was not collected at all in this session — it was deprioritized in favor
of getting *some* verified annual data for as many companies as possible within the
session's practical time budget; see item below. Every ticker in the roster,
whether or not EPS was found for it, has a row in `NDX_EPS_Data_Quality.csv` with
`data_quality = not_collected` and an explanatory note where nothing was found —
per the task's explicit instruction, absent data is left blank/`missing`, never
filled in with a plausible-looking number.

## Methodology detail

- **Constituents roster**: built from a combination of (a) specific NDX annual
  December reconstitution / 2026 quarterly reconstitution press releases retrieved
  via web search — these carry `start_confidence = verified_2026session` and a
  source URL — and (b) general background knowledge of well-known NDX membership
  history, carrying `start_confidence = general_knowledge_unverified`. The latter
  should be treated as an approximate scaffold, not a certified record — dates are
  often year-level, not day-level, and the roster almost certainly misses many of
  the smaller/shorter-tenured constituents from 1999–2007, when turnover was heavy
  (dot-com boom/bust) and web-search-retrievable records are thin. It is **not**
  a substitute for Nasdaq's own historical index-methodology archive.
- **EPS values**: `eps_type` is `annual` for every row in this pass (10-K / 20-F
  fiscal-year figures). `period` and `period_end` are the fiscal year-end (exact
  date where the company has a calendar fiscal year; approximated to month-end,
  and flagged as such in `notes`, for 52/53-week fiscal years where the exact day
  wasn't independently confirmed).
- **`reporting_month` is blank throughout.** The task defines it as the actual
  month a figure was reported/filed, distinct from `period_end`. Verifying that
  reliably requires either an XBRL `filed` date or a specific filing-index lookup
  per record — 131 individual lookups were outside this session's scope, and
  guessing a typical filing lag would itself be exactly the kind of fabricated,
  unverifiable value the task prohibits. Left blank rather than guessed.
- **`total_ndx_members` in the Aggregate CSV** is a month-end snapshot computed
  purely from `NDX_Constituents_Roster.csv`, so it inherits that roster's
  incompleteness — treat it as a lower bound, not the true historical ~100, especially
  before 2008. This is noted in that file's own `notes` column on every row.
- **`basic_eps_sum` / `diluted_eps_sum`** in the Aggregate CSV are explicitly *not*
  an index-level EPS figure (NDX is cap-weighted, not equal-weighted) — reference
  statistics only, as the task itself cautions.
- **CIK / accession number**: extracted programmatically by regex from SEC EDGAR
  URLs surfaced in search results, when the source was an actual sec.gov/Archives
  URL. Left blank where the source was a company IR page or press-release mirror
  without a parseable EDGAR URL.

## Known data-integrity findings from this session (worth knowing before you trust a number)

- **Aggregator sites silently split-adjust historical EPS.** A macrotrends query for
  Apple returned 1999 EPS of $0.03 and 2000 EPS of $0.04; Apple's actual FY2000 10-K
  reports diluted EPS of **$2.18**. The aggregator had retroactively adjusted for
  every stock split since 2000 (including the 4-for-1 in 2014 and 4-for-1 in 2020).
  **None of the figures in the final CSVs come from that kind of source** — this is
  flagged here because it's a trap worth knowing about if you extend this dataset.
- A few search results returned figures that were clearly a **different metric than
  asked** (a sum of quarterly EPS presented as if it were the annual figure; a
  non-GAAP adjusted EPS instead of GAAP; a currency-converted figure for a
  foreign-currency filer). All such cases found were excluded rather than kept —
  see `eps_source_facts_raw.csv`'s `notes` column and the exclusions mentioned
  inline in this file's git history for the specific instances (e.g. Tesla FY2020,
  Google/Alphabet 2015-2020, Ross Stores FY2018, Amazon FY2020, Vodafone all years,
  CrowdStrike FY2021-2023).
- ASML Holding (foreign private issuer, 20-F) EPS is preserved in **EUR**, not
  converted to USD, per the task's explicit instruction against currency conversion.
- QUALCOMM's FY2000 10-K explicitly states per-share amounts were restated for a
  Dec 1999 4-for-1 split — this is the one row in the dataset with
  `split_adjusted = yes` based on the filing's own text, not an assumption.

## Regenerating / extending this dataset

- `build_csvs_from_facts.py` regenerates all 4 CSVs from
  `eps_source_facts_raw.csv` + `NDX_Constituents_Roster.csv`. Safe to re-run after
  hand-editing either input (e.g. adding more researched EPS facts in the same
  row format).
- `fetch_sec_edgar_pipeline.py` is the real SEC EDGAR API pipeline (see above) —
  run it anywhere with normal internet access for full-fidelity, XBRL-sourced,
  quarterly+annual coverage of every ticker in the roster.

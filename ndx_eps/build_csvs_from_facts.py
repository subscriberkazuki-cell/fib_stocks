#!/usr/bin/env python3
"""
Builds the 4 required NDX EPS CSV deliverables from manually-collected,
web-search-sourced raw facts. Every EPS value in eps_source_facts_raw.csv was
transcribed from a specific retrieved source (mostly SEC EDGAR filing text
surfaced via WebSearch); nothing here is estimated, interpolated, or
derived by arithmetic.

Run from within this directory: python3 build_csvs_from_facts.py
Reads NDX_Constituents_Roster.csv + eps_source_facts_raw.csv, (re)writes the
4 output CSVs in place.
"""
import csv
import calendar
import datetime
import os
import re
import statistics
from collections import defaultdict

WORKDIR = os.path.dirname(os.path.abspath(__file__))
OUTDIR = WORKDIR

TODAY = datetime.date(2026, 9, 17)
RANGE_START = datetime.date(1999, 1, 1)

# ---------------------------------------------------------------------------
# Load constituents roster
# ---------------------------------------------------------------------------
constituents = []  # list of dict rows, one per membership spell
with open(f"{WORKDIR}/NDX_Constituents_Roster.csv", newline="", encoding="utf-8-sig") as f:
    for row in csv.DictReader(f):
        constituents.append(row)

# Build ticker -> list of (start_date, end_date_or_None, company_name) spells
member_spells = defaultdict(list)
company_names = {}
for row in constituents:
    ticker = row["ticker"].strip()
    if not ticker:
        continue
    start_raw = row["member_start"].strip()
    end_raw = row["member_end"].strip()

    def parse_partial_date(s, is_end=False):
        if not s:
            return None
        parts = s.split("-")
        if len(parts) == 1:
            y = int(parts[0])
            return datetime.date(y, 12, 31) if is_end else datetime.date(y, 1, 1)
        elif len(parts) == 2:
            y, m = int(parts[0]), int(parts[1])
            last = calendar.monthrange(y, m)[1]
            return datetime.date(y, m, last) if is_end else datetime.date(y, m, 1)
        else:
            y, m, d = int(parts[0]), int(parts[1]), int(parts[2])
            return datetime.date(y, m, d)

    start_d = parse_partial_date(start_raw, is_end=False)
    end_d = parse_partial_date(end_raw, is_end=True) if end_raw else None
    member_spells[ticker].append((start_d, end_d, row["company"]))
    company_names[ticker] = row["company"]

def ndx_member_status(ticker, period_month_end_date):
    """Return 'yes'/'no'/'unknown' for whether ticker was an NDX member as of
    the given month-end snapshot date."""
    spells = member_spells.get(ticker)
    if not spells:
        return "unknown"
    for start_d, end_d, _ in spells:
        if start_d is None:
            continue
        if period_month_end_date >= start_d and (end_d is None or period_month_end_date <= end_d):
            return "yes"
    return "no"

def overall_member_window(ticker):
    spells = member_spells.get(ticker)
    if not spells:
        return ("", "")
    starts = [s for s, e, n in spells if s is not None]
    ends = [e for s, e, n in spells]
    start_str = min(starts).isoformat() if starts else ""
    end_str = "" if any(e is None for e in ends) else (max(ends).isoformat() if ends else "")
    return (start_str, end_str)

# ---------------------------------------------------------------------------
# Load raw EPS facts
# ---------------------------------------------------------------------------
facts = []
with open(f"{WORKDIR}/eps_source_facts_raw.csv", newline="", encoding="utf-8-sig") as f:
    for row in csv.DictReader(f):
        facts.append(row)

SEC_URL_RE = re.compile(r"/Archives/edgar/data/(\d+)/(\d{18})/")

def extract_cik_accn(url):
    m = SEC_URL_RE.search(url)
    if not m:
        return "", ""
    cik = str(int(m.group(1)))  # strip leading zeros
    accn_raw = m.group(2)  # 18 digits: 10+2+6
    accn = f"{accn_raw[0:10]}-{accn_raw[10:12]}-{accn_raw[12:18]}"
    return cik, accn

def infer_form(source_type, url):
    st = source_type.lower()
    if "20-f" in st:
        return "20-F"
    if "10-k" in st:
        return "10-K"
    if "earnings release" in st:
        return "8-K/EX-99.1"
    if "sec filing" in st:
        return "10-K"  # our only such cases are 10-K/proxy hybrids
    return ""

long_rows = []
for r in facts:
    ticker = r["ticker"].strip()
    company = r["company"].strip()
    fy_label = r["fy_label"].strip()  # e.g. FY2001
    fy = int(re.search(r"\d{4}", fy_label).group())
    month = int(r["fiscal_year_end_month"])
    last_day = calendar.monthrange(fy, month)[1]
    period_end = datetime.date(fy, month, last_day)

    if period_end < RANGE_START or period_end > TODAY:
        continue  # enforce 1999-01 .. 2026-09 range strictly

    period = f"{fy}-{month:02d}"
    eps_basic = r["eps_basic"].strip()
    eps_diluted = r["eps_diluted"].strip()
    url = r["source_url"].strip()
    source_type = r["source_type"].strip()
    notes = r["notes"].strip()
    cik, accn = extract_cik_accn(url)
    form = infer_form(source_type, url)
    currency = "EUR" if ticker == "ASML" else "USD"
    split_adjusted = "yes" if ("split_adjusted=yes" in notes or "restated for" in notes.lower() and "split" in notes.lower()) else "unknown"
    member_start, member_end = overall_member_window(ticker)
    ndx_member = ndx_member_status(ticker, period_end)

    def make_row(eps_type_col, eps_val):
        return {
            "period": period,
            "ticker": ticker,
            "company": company,
            "cik": cik,
            "ndx_member": ndx_member,
            "member_start": member_start,
            "member_end": member_end,
            "eps_basic": eps_val if eps_type_col == "basic" else "",
            "eps_diluted": eps_val if eps_type_col == "diluted" else "",
            "eps_currency": currency,
            "eps_type": "annual",
            "period_start": "",
            "period_end": period_end.isoformat(),
            "reporting_month": "",
            "filing_date": "",
            "fiscal_year": fy,
            "fiscal_period": "FY",
            "form": form,
            "accession_number": accn,
            "source": url,
            "source_type": source_type,
            "split_adjusted": split_adjusted,
            "restated": "no",
            "data_status": "extracted",
            "notes": notes,
        }

    # One row per EPS type actually present (avoid mixing basic+diluted in one row
    # so eps_basic/eps_diluted blanks unambiguously mean "not reported/not collected")
    if eps_basic and eps_diluted:
        row = make_row("diluted", "")
        row["eps_basic"] = eps_basic
        row["eps_diluted"] = eps_diluted
        long_rows.append(row)
    elif eps_diluted:
        long_rows.append(make_row("diluted", eps_diluted))
    elif eps_basic:
        long_rows.append(make_row("basic", eps_basic))

# Sort for readability
long_rows.sort(key=lambda x: (x["ticker"], x["period_end"]))

# Dedup check: ticker+period_end+eps_type
seen = set()
deduped = []
dupe_count = 0
for row in long_rows:
    key = (row["ticker"], row["period_end"], row["eps_type"])
    if key in seen:
        dupe_count += 1
        continue
    seen.add(key)
    deduped.append(row)
long_rows = deduped

LONG_COLUMNS = ["period","ticker","company","cik","ndx_member","member_start","member_end",
    "eps_basic","eps_diluted","eps_currency","eps_type","period_start","period_end",
    "reporting_month","filing_date","fiscal_year","fiscal_period","form","accession_number",
    "source","source_type","split_adjusted","restated","data_status","notes"]

with open(f"{OUTDIR}/NDX_EPS_1999_2026.csv", "w", newline="", encoding="utf-8-sig") as f:
    w = csv.DictWriter(f, fieldnames=LONG_COLUMNS)
    w.writeheader()
    for row in long_rows:
        w.writerow(row)

print(f"Long format rows written: {len(long_rows)} (duplicates dropped: {dupe_count})")
print(f"Distinct tickers with EPS data: {len(set(r['ticker'] for r in long_rows))}")

# ---------------------------------------------------------------------------
# Build list of all months 1999-01 .. 2026-09
# ---------------------------------------------------------------------------
all_months = []
y, m = 1999, 1
while (y, m) <= (2026, 9):
    all_months.append(f"{y}-{m:02d}")
    m += 1
    if m == 13:
        m = 1
        y += 1

def month_end_date(month_str):
    y, m = map(int, month_str.split("-"))
    return datetime.date(y, m, calendar.monthrange(y, m)[1])

# ---------------------------------------------------------------------------
# CSV 2: Monthly Pivot
# NOTE (methodology / disclosed deviation): true `reporting_month` (the actual
# month a filing was published) was not independently verified for these
# records in this collection round - only the fiscal `period` (period-end
# month) is confirmed. To avoid fabricating filing dates, this pivot is keyed
# by `period` (fiscal period-end month) rather than true reporting_month.
# This is documented here and in the Data Quality notes / final report.
# ---------------------------------------------------------------------------
tickers_with_data = sorted(set(r["ticker"] for r in long_rows))
pivot_cols = []
for t in tickers_with_data:
    pivot_cols.append(f"{t}_basic")
    pivot_cols.append(f"{t}_diluted")

pivot = {mo: {} for mo in all_months}
for row in long_rows:
    mo = row["period"]
    if row["eps_basic"]:
        pivot[mo][f"{row['ticker']}_basic"] = row["eps_basic"]
    if row["eps_diluted"]:
        pivot[mo][f"{row['ticker']}_diluted"] = row["eps_diluted"]

with open(f"{OUTDIR}/NDX_EPS_Monthly_Pivot_1999_2026.csv", "w", newline="", encoding="utf-8-sig") as f:
    w = csv.writer(f)
    w.writerow(["month"] + pivot_cols)
    for mo in all_months:
        rowvals = [pivot[mo].get(c, "") for c in pivot_cols]
        w.writerow([mo] + rowvals)

print(f"Monthly pivot written: {len(all_months)} months x {len(pivot_cols)} value columns")

# ---------------------------------------------------------------------------
# CSV 3: Monthly Aggregate
# total_ndx_members: computed from the constituents roster at MONTH-END
# snapshot (see member_spells). This roster is a best-effort reconstruction,
# NOT a guaranteed-exhaustive enumeration of every historical NDX-100 seat
# (especially weak for 1999-2007) - so total_ndx_members here is a LOWER
# BOUND / partial count, not the true historical 100. This is disclosed via
# the `notes` column and in the Data Quality file / final report.
# ---------------------------------------------------------------------------
agg_rows = []
for mo in all_months:
    med = month_end_date(mo)
    total_members = sum(1 for t in member_spells if ndx_member_status(t, med) == "yes")
    basic_vals = []
    diluted_vals = []
    tickers_this_month = set()
    for row in long_rows:
        if row["period"] != mo:
            continue
        tickers_this_month.add(row["ticker"])
        if row["eps_basic"]:
            try:
                basic_vals.append(float(row["eps_basic"]))
            except ValueError:
                pass
        if row["eps_diluted"]:
            try:
                diluted_vals.append(float(row["eps_diluted"]))
            except ValueError:
                pass
    members_with_eps = len(tickers_this_month)
    coverage_ratio = round(members_with_eps / total_members, 4) if total_members else ""
    agg_rows.append({
        "month": mo,
        "total_ndx_members": total_members,
        "members_with_eps": members_with_eps,
        "basic_eps_count": len(basic_vals),
        "diluted_eps_count": len(diluted_vals),
        "basic_eps_mean": round(statistics.mean(basic_vals), 4) if basic_vals else "",
        "basic_eps_median": round(statistics.median(basic_vals), 4) if basic_vals else "",
        "basic_eps_sum": round(sum(basic_vals), 4) if basic_vals else "",
        "diluted_eps_mean": round(statistics.mean(diluted_vals), 4) if diluted_vals else "",
        "diluted_eps_median": round(statistics.median(diluted_vals), 4) if diluted_vals else "",
        "diluted_eps_sum": round(sum(diluted_vals), 4) if diluted_vals else "",
        "coverage_ratio": coverage_ratio,
        "notes": "total_ndx_members = month-end snapshot from partial constituent roster (lower bound, not exhaustive, esp. 1999-2007); basic/diluted_eps_sum are NOT a market-cap-weighted index figure, reference only",
    })

AGG_COLUMNS = ["month","total_ndx_members","members_with_eps","basic_eps_count","diluted_eps_count",
    "basic_eps_mean","basic_eps_median","basic_eps_sum","diluted_eps_mean","diluted_eps_median",
    "diluted_eps_sum","coverage_ratio","notes"]
with open(f"{OUTDIR}/NDX_EPS_Monthly_Aggregate_1999_2026.csv", "w", newline="", encoding="utf-8-sig") as f:
    w = csv.DictWriter(f, fieldnames=AGG_COLUMNS)
    w.writeheader()
    for row in agg_rows:
        w.writerow(row)

print(f"Monthly aggregate written: {len(agg_rows)} months")

# ---------------------------------------------------------------------------
# CSV 4: Data Quality (one row per ticker in the constituents roster, whether
# or not EPS data was collected for it this session)
# ---------------------------------------------------------------------------
by_ticker_facts = defaultdict(list)
for row in long_rows:
    by_ticker_facts[row["ticker"]].append(row)

dq_rows = []
all_tickers_for_dq = sorted(set(member_spells.keys()) | set(r["ticker"] for r in long_rows))
for ticker in all_tickers_for_dq:
    company = company_names.get(ticker, "")
    m_start, m_end = overall_member_window(ticker)
    frows = by_ticker_facts.get(ticker, [])
    source_types = [r["source_type"] for r in frows]
    period_ends = sorted(r["period_end"] for r in frows)
    first_eps_date = period_ends[0] if period_ends else ""
    last_eps_date = period_ends[-1] if period_ends else ""
    years_with_data = sorted(set(r["fiscal_year"] for r in frows))
    years_of_data = (years_with_data[-1] - years_with_data[0] + 1) if years_with_data else 0
    quarterly_records = sum(1 for r in frows if r["eps_type"] == "quarterly")
    annual_records = sum(1 for r in frows if r["eps_type"] == "annual")
    xbrl_records = sum(1 for st in source_types if "xbrl" in st.lower() or "companyfacts" in st.lower())
    sec_filing_records = sum(1 for st in source_types if "10-k" in st.lower() or "10-q" in st.lower() or "20-f" in st.lower() or "sec filing" in st.lower())
    ir_records = sum(1 for st in source_types if "earnings release" in st.lower() or "annual report" in st.lower() or "company" in st.lower())
    restated_records = sum(1 for r in frows if r["restated"] == "yes")
    split_adjusted_records = sum(1 for r in frows if r["split_adjusted"] == "yes")

    # expected-year-range heuristic for coverage_ratio: intersect [1999,2026] with
    # [member_start_year, member_end_year or 2026] when known, else [1999,2026]
    exp_start = 1999
    exp_end = 2026
    if m_start:
        exp_start = max(1999, int(m_start[:4]))
    if m_end:
        exp_end = min(2026, int(m_end[:4]))
    expected_years = max(1, exp_end - exp_start + 1)
    years_covered = len(years_with_data)
    coverage_ratio = round(years_covered / expected_years, 4) if expected_years else ""

    missing_1999_2008 = sum(1 for y in range(max(exp_start,1999), min(exp_end,2008)+1) if y not in years_with_data)
    missing_2009_2026 = sum(1 for y in range(max(exp_start,2009), min(exp_end,2026)+1) if y not in years_with_data)
    missing_periods = missing_1999_2008 + missing_2009_2026

    if not frows:
        data_quality = "not_collected"
        notes = "No EPS data collected in this session (WebSearch-only environment; ticker not among the ~50 companies researched in depth). Needs follow-up via SEC EDGAR API pipeline (see accompanying script) or further targeted research."
    elif years_covered >= 15:
        data_quality = "good_annual_coverage"
        notes = "Annual (10-K) diluted/basic EPS collected via targeted web search of SEC filing text, cross-checked for plausibility. Quarterly EPS NOT collected for this ticker (out of scope for this session's time budget). Gaps remain within range - see missing_* counts."
    elif years_covered >= 5:
        data_quality = "partial_annual_coverage"
        notes = "Partial annual EPS coverage; several fiscal years within the membership/eligible window were not found or not queried this session. Quarterly EPS not collected."
    else:
        data_quality = "minimal_annual_coverage"
        notes = "Only 1-4 fiscal years of annual EPS obtained this session; most of the eligible window is missing (not fabricated - simply not yet researched/found)."

    dq_rows.append({
        "ticker": ticker,
        "company": company,
        "ndx_member_start": m_start,
        "ndx_member_end": m_end,
        "first_eps_date": first_eps_date,
        "last_eps_date": last_eps_date,
        "years_of_data": years_of_data,
        "quarterly_records": quarterly_records,
        "annual_records": annual_records,
        "missing_periods": missing_periods,
        "missing_1999_2008": missing_1999_2008,
        "missing_2009_2026": missing_2009_2026,
        "xbrl_records": xbrl_records,
        "sec_filing_records": sec_filing_records,
        "ir_records": ir_records,
        "restated_records": restated_records,
        "split_adjusted_records": split_adjusted_records,
        "coverage_ratio": coverage_ratio,
        "data_quality": data_quality,
        "notes": notes,
    })

DQ_COLUMNS = ["ticker","company","ndx_member_start","ndx_member_end","first_eps_date","last_eps_date",
    "years_of_data","quarterly_records","annual_records","missing_periods","missing_1999_2008",
    "missing_2009_2026","xbrl_records","sec_filing_records","ir_records","restated_records",
    "split_adjusted_records","coverage_ratio","data_quality","notes"]
with open(f"{OUTDIR}/NDX_EPS_Data_Quality.csv", "w", newline="", encoding="utf-8-sig") as f:
    w = csv.DictWriter(f, fieldnames=DQ_COLUMNS)
    w.writeheader()
    for row in dq_rows:
        w.writerow(row)

print(f"Data quality written: {len(dq_rows)} tickers ({sum(1 for r in dq_rows if r['data_quality']!='not_collected')} with data, {sum(1 for r in dq_rows if r['data_quality']=='not_collected')} not_collected)")

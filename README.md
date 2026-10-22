---
title: BookPortfolio — Wealth Frontend
status: local-application-boundary
---

# BookPortfolio

Read-only wealth dashboard for the Solo Empire finance portfolio. This is the
first real application boundary for the planned BookPortfolio / Wealth product.

It consumes only the authenticated `BookFinance API v1` read model. It does not
read SQLite, CSV exports, scraper files, or raw source payloads, and it does not
write finance records.

## Architecture

```text
Browser
  -> Next.js server component
  -> BookFinance API v1 (Bearer finance:read)
  -> Finance Control Plane / SQLite
```

The API token is server-only. Do not rename it to `NEXT_PUBLIC_FINANCE_API_TOKEN`
or place it in browser code. The frontend requests eight bounded endpoints.
The activity, account, reconciliation, and invoice panels keep their small
recent-item limits. The investments and latest valuations reads follow the API
`next_cursor` with offset pagination until all active portfolio rows are
loaded, so portfolio totals are not silently limited to the first 12 rows.

- `/api/finance/v1/summary?period=YYYY-MM`
- `/api/finance/v1/transactions?limit=8`
- `/api/finance/v1/accounts?status=active&limit=8`
- `/api/finance/v1/investments?status=active&limit=12&offset=...`
- `/api/finance/v1/reconciliations?limit=8`
- `/api/finance/v1/valuations?status=active&latest=true&limit=12&offset=...`
- `/api/finance/v1/risk-readiness`
- `/api/finance/v1/invoices?limit=6`

The dashboard also derives read-only liquidity and obligation signals from the
summary response: received/pending revenue, active or overdue liabilities, and
open invoice exposure for the preferred currency. These are control signals,
not a reconciled cash balance.

Each endpoint is tracked independently. If a non-summary endpoint fails, the
dashboard keeps the data that did load, identifies the failed endpoint, and
shows its affected panel as unavailable instead of treating the failure as an
empty dataset. A pagination metadata or cursor error also marks that endpoint
as unavailable and prevents partial portfolio totals from being displayed.

The portfolio panel joins active holdings with the latest same-currency row from
the bounded valuations endpoint. A valuation snapshot overrides the legacy
`finance_investments.current_value`; an explicitly unpriced latest snapshot
does not fall back to the old number. If no snapshot exists, the panel shows a
clearly labelled legacy read-model value. It shows known value by currency and
type; it does not fetch market prices, calculate a risk score, or provide
investment advice.

The Risk Readiness panel reads bounded reconciliation periods and differences,
and shows open/exception counts alongside valuation snapshot coverage and
`valuation_as_of`. It is a control readiness view only; it does not claim a
reconciled cash balance, calculate a risk score, or provide investment advice.
The risk-readiness endpoint is a fail-closed input gate for freshness, quality,
coverage, single-currency FX readiness, and metric-definition approval; its
metrics remain disabled until the policy and definitions receive owner review.
The proposed metric contract is
`finance-risk-metric-definitions-v1.yaml`; it defines reproducible inputs but
does not calculate or expose risk results. Multi-currency conversion remains
disabled until `finance-fx-snapshot-contract-v1.yaml` is approved and backed by
an actual FX snapshot source.

## Local development

Requirements: Node.js 22.6+ and a
running Solo Empire API.

```bash
cp .env.example .env.local
# set FINANCE_API_TOKEN to a hash-backed scoped token's raw value locally
npm install
npm run dev
```

Open `http://localhost:3000`. The API must be available at
`FINANCE_API_BASE_URL` and the token must have the `finance:read` scope.
เลือก reporting period ได้จากตัวเลือกบนหน้าเว็บ หรือเปิด URL เช่น
`http://localhost:3000/?period=2026-08`; ค่า query ที่ไม่ใช่รูปแบบ `YYYY-MM`
จะ fallback ไปที่ `FINANCE_DASHBOARD_PERIOD` หรือเดือน UTC ปัจจุบัน

หน้าเว็บมี App Router loading state และ retry boundary สำหรับข้อผิดพลาดระหว่าง
การ render แต่ยังคงไม่เปิดเผย token หรือรายละเอียดภายในของ API ไปยัง browser

## Verification

```bash
npm run lint
npm test
npm run typecheck
npm run build
```

`bash scripts/check.sh` runs the same sequence. GitHub Actions runs it on every
push and pull request; none of the checks contact the Finance API.

`npm test` runs `node --test` through `tsx`, so it covers both the API client
(`tests/finance-contract.test.ts`) and page-level render tests
(`tests/page.test.tsx`): the async page is awaited and rendered to static HTML
with a stubbed API to check the setup, empty, partial-failure and unpriced
holdings states.

Money totals (portfolio value, cost basis, gain/loss, open invoices,
reconciliation differences) are summed in integer minor units via `sumMoney`,
so float drift cannot leak into displayed totals. Headline figures are shown in
whole currency units; reconciliation differences use the currency's full
minor-unit precision so a small mismatch is never displayed as zero.

`tests/sentry.test.ts` covers the Sentry options and the allowlist event
scrubber in `src/lib/sentry.ts`. Sentry is wired for the server runtimes only
through `instrumentation.ts` and stays off unless `SENTRY_DSN` is set; see
`PRODUCT.md`.

`npm run build` produces a production Next.js artifact. Deployment still needs
an approved gateway/TLS setup, managed secret injection, and a real concurrent
load test before production promotion.

## Boundary status

This is an application boundary created under the Solo Empire Book Dev mount,
hosted at `github.com/bookchaowalit/finance-portfolio-web`. It has not been deployed.

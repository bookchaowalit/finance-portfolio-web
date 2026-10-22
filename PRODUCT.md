# BookPortfolio (finance-portfolio-web)

**Status:** local application boundary. Not deployed; no live URL.
**Owner:** Solo Empire founder (solo).
**Disposition:** keep — frontend half of the BookFinance product pair.

## Purpose

A read-only wealth view for the owner's own finances. A Next.js server
component reads the authenticated BookFinance API v1 (`finance:read` scope)
and shows cash flow, open invoices, liabilities, holdings with their latest
valuation, reconciliation status and risk-readiness gates for one month.

## Users

One user today: the owner, running it locally against their own Finance API.
No accounts, sign-in or multi-user support in this app.

## What works today

- Eight bounded API reads (summary, transactions, accounts, investments,
  valuations, reconciliations, risk readiness, invoices); investments and
  valuations follow pagination until every active row is loaded.
- Every payload is shape-checked per endpoint; a failed or malformed endpoint
  marks only its own panel as unavailable instead of showing it as empty.
- Money totals are summed in integer minor units per currency; other
  currencies and unpriced holdings are excluded from known value, not guessed.
- Reporting period picker (`?period=YYYY-MM`), loading state and a retry
  error boundary. Thai UI.
- A setup state when `FINANCE_API_TOKEN` / `FINANCE_API_BASE_URL` are missing.
- Server-side error reporting to Sentry when `SENTRY_DSN` is set (see below).

It does not write finance records, fetch market prices, convert currencies,
calculate risk scores or give investment advice.

## How to run

```bash
npm ci
cp .env.example .env.local   # set FINANCE_API_TOKEN and FINANCE_API_BASE_URL
npm run dev                  # http://localhost:3000
```

Checks (all offline, also run in CI): `npm run lint`, `npm test`,
`npm run typecheck`, `npm run build`.

## Error monitoring

`instrumentation.ts` loads `@sentry/nextjs` in the Node.js and Edge server
runtimes. It is off unless the host sets `SENTRY_DSN`. Errors only: no
tracing, breadcrumbs, local variables or default PII. `src/lib/sentry.ts`
rebuilds each event from an allowlist (exception type/message, stack frame
locations, runtime/OS name and version, environment/release) and drops the
request URL and query, headers, cookies, user, tags and extra data, so no
period, amount or token can leave the server. No browser SDK is shipped, so
client-only errors are not reported. Tests: `tests/sentry.test.ts`.

## Limits

- Not deployed: production needs an approved gateway/TLS, managed secret
  injection and a load test first (see README).
- Amounts arrive from the API as JSON floats (P1 in `docs/UPGRADE-PLAN.md`).
- Multi-currency conversion stays disabled until the FX snapshot contract is
  approved.

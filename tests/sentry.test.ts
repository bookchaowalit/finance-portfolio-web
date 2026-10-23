import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { scrubEvent, sentryOptions } from "../src/lib/sentry.ts";

describe("sentryOptions", () => {
  it("stays disabled when SENTRY_DSN is unset or blank", () => {
    assert.equal(sentryOptions(undefined).enabled, false);
    assert.equal(sentryOptions("   ").enabled, false);
    assert.equal(sentryOptions("   ").dsn, undefined);
  });

  it("reports errors only: no PII, tracing, trace headers, breadcrumbs or locals", () => {
    const options = sentryOptions("https://key@o0.ingest.sentry.io/1");
    assert.equal(options.enabled, true);
    assert.equal(options.sendDefaultPii, false);
    assert.equal(options.tracesSampleRate, undefined);
    assert.deepEqual(options.tracePropagationTargets, []);
    assert.equal(options.maxBreadcrumbs, 0);
    assert.equal(options.includeLocalVariables, false);
    assert.equal(options.beforeSend, scrubEvent);
    assert.equal(options.beforeSendTransaction(), null);
  });
});

describe("scrubEvent (allowlist)", () => {
  it("drops request, user, extra, tags and breadcrumbs, and anything unknown", () => {
    const event = scrubEvent({
      event_id: "abc",
      level: "error",
      environment: "production",
      message: "Finance API returned an invalid payload shape",
      request: { url: "http://localhost:3000/?period=2026-08", headers: { authorization: "Bearer secret", cookie: "a=b" } },
      user: { ip_address: "1.2.3.4" },
      extra: { holdings: [{ name: "Fund", current_value: 650 }] },
      tags: { url: "/?period=2026-08" },
      breadcrumbs: [{ message: "fetch http://finance.test/api/finance/v1/summary" }],
      transaction: "GET /",
      some_future_field: { token: "x" },
    });
    assert.deepEqual(event, {
      event_id: "abc",
      level: "error",
      environment: "production",
      message: "Finance API returned an invalid payload shape",
    });
  });

  it("keeps exception type, message and frame locations but strips locals and source lines", () => {
    const event = scrubEvent({
      exception: {
        values: [
          {
            type: "Error",
            value: "BookFinance API returned HTTP 503",
            mechanism: { type: "onRequestError", handled: false, data: { path: "/?period=2026-08" } },
            stacktrace: {
              frames: [
                {
                  filename: "src/lib/finance.ts",
                  function: "fetchFinanceEndpoint",
                  lineno: 397,
                  colno: 9,
                  in_app: true,
                  vars: { token: "secret" },
                  pre_context: ["const token = ..."],
                  context_line: "Authorization: `Bearer ${token}`",
                },
              ],
            },
          },
        ],
      },
    });
    assert.deepEqual(event, {
      exception: {
        values: [
          {
            type: "Error",
            value: "BookFinance API returned HTTP 503",
            mechanism: { type: "onRequestError", handled: false },
            stacktrace: {
              frames: [{ filename: "src/lib/finance.ts", function: "fetchFinanceEndpoint", lineno: 397, colno: 9, in_app: true }],
            },
          },
        ],
      },
    });
  });

  it("keeps only runtime/os names and versions from contexts", () => {
    const event = scrubEvent({
      contexts: {
        runtime: { name: "node", version: "v22.6.0", extra: "y" },
        os: { name: "Linux", version: "6.1", kernel_version: "secret-host" },
        response: { status_code: 500, headers: { "set-cookie": "a" } },
        cloud_resource: { "host.id": "i-123" },
      },
    }) as { contexts: unknown };
    assert.deepEqual(event.contexts, { runtime: { name: "node", version: "v22.6.0" }, os: { name: "Linux", version: "6.1" } });
  });
});

describe("scrubEvent messages (static allowlist)", () => {
  const exceptionValues = (event: object) =>
    (event as { exception: { values: Array<{ type?: string; value?: string }> } }).exception.values;

  it("redacts exception messages that are not app messages (free text can carry finance data or URLs)", () => {
    const event = scrubEvent({
      exception: {
        values: [
          { type: "TypeError", value: "Cannot read properties of undefined (reading 'Kasikorn savings 650,000 THB')" },
          { type: "Error", value: "fetch failed: http://finance.internal:8080/api/finance/v1/holdings?token=abc" },
        ],
      },
    });
    assert.deepEqual(exceptionValues(event), [
      { type: "TypeError", value: "[redacted]" },
      { type: "Error", value: "[redacted]" },
    ]);
  });

  it("redacts a free-text top-level message", () => {
    assert.deepEqual(scrubEvent({ message: "holding 'Fund A' worth 650000" }), { message: "[redacted]" });
  });

  it("keeps the app's own static messages and the HTTP status message", () => {
    const allowed = [
      "Finance API returned an invalid payload shape",
      "FINANCE_API_TOKEN is not configured",
      "BookFinance API returned HTTP 502",
      "BookFinance API returned an unsupported schema",
      "Finance API returned invalid pagination metadata",
      "Finance API returned a non-progressing pagination cursor",
      "Finance API pagination exceeded the safety limit",
    ];
    for (const value of allowed) {
      assert.deepEqual(exceptionValues(scrubEvent({ exception: { values: [{ type: "Error", value }] } })), [{ type: "Error", value }]);
    }
    assert.deepEqual(
      exceptionValues(scrubEvent({ exception: { values: [{ type: "Error", value: "BookFinance API returned HTTP 503 for 'Fund A'" }] } })),
      [{ type: "Error", value: "[redacted]" }],
    );
  });

  it("redacts linked cause entries and drops their extra fields", () => {
    const event = scrubEvent({
      exception: {
        values: [
          {
            type: "Error",
            value: "ECONNREFUSED 10.0.0.5:5432 user=finance",
            mechanism: { type: "chained", handled: true, source: "cause", exception_id: 1, parent_id: 0 },
            module: "secret-module",
          },
          { type: "Error", value: "BookFinance API returned HTTP 500" },
        ],
      },
    });
    assert.deepEqual(exceptionValues(event), [
      { type: "Error", value: "[redacted]", mechanism: { type: "chained", handled: true } },
      { type: "Error", value: "BookFinance API returned HTTP 500" },
    ]);
  });
});

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
      message: "boom",
      request: { url: "http://localhost:3000/?period=2026-08", headers: { authorization: "Bearer secret", cookie: "a=b" } },
      user: { ip_address: "1.2.3.4" },
      extra: { holdings: [{ name: "Fund", current_value: 650 }] },
      tags: { url: "/?period=2026-08" },
      breadcrumbs: [{ message: "fetch http://finance.test/api/finance/v1/summary" }],
      transaction: "GET /",
      some_future_field: { token: "x" },
    });
    assert.deepEqual(event, { event_id: "abc", level: "error", environment: "production", message: "boom" });
  });

  it("keeps exception type, message and frame locations but strips locals and source lines", () => {
    const event = scrubEvent({
      exception: {
        values: [
          {
            type: "Error",
            value: "Finance API /summary returned 503",
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
            value: "Finance API /summary returned 503",
            mechanism: { type: "onRequestError", handled: false },
            stacktrace: {
              frames: [{ filename: "src/lib/finance.ts", function: "fetchFinanceEndpoint", lineno: 397, colno: 9, in_app: true }],
            },
          },
        ],
      },
    });
  });

  it("keeps only runtime/os names and versions from contexts and clips long messages", () => {
    const event = scrubEvent({
      message: "x".repeat(2_000),
      contexts: {
        runtime: { name: "node", version: "v22.6.0", extra: "y" },
        os: { name: "Linux", version: "6.1", kernel_version: "secret-host" },
        response: { status_code: 500, headers: { "set-cookie": "a" } },
        cloud_resource: { "host.id": "i-123" },
      },
    }) as { message: string; contexts: unknown };
    assert.equal(event.message.length, 501);
    assert.deepEqual(event.contexts, { runtime: { name: "node", version: "v22.6.0" }, os: { name: "Linux", version: "6.1" } });
  });
});

import * as Sentry from "@sentry/nextjs";

import { sentryOptions } from "./src/lib/sentry";

Sentry.init(sentryOptions(process.env.SENTRY_DSN));

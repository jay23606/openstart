# Controlled load testing

OpenStart's load harness targets only the explicitly confirmed Supabase test
project. It refuses to run when the URL matches `config.js`, when the project
reference does not match, or when reset permission is absent.

The harness creates one disposable free event and tests three paths:

1. concurrent discovery through the public database function;
2. a real Edge Function registration followed by the same idempotent retry; and
3. a capacity spike through the server-authoritative reservation function.

The run succeeds only when the active registration count equals capacity, every
overflow attempt is rejected, the materialized capacity counter matches the
authoritative rows, the retry returns one registration, and p95 latency remains
under the configured thresholds. All fixtures are removed in a `finally` block.

Run with the authenticated-test environment variables described in the README:

```bash
npm run test:load
```

Optional controls are `LOAD_CAPACITY` (10–200), `LOAD_OVERFLOW` (5–50),
`LOAD_DISCOVERY_REQUESTS` (10–500), `LOAD_DISCOVERY_P95_MS` (default 3000), and
`LOAD_REGISTRATION_P95_MS` (default 5000). The GitHub workflow is deliberately
manual so a code push cannot generate an unexpected traffic spike.

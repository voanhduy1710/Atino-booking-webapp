# Security notes

## React Router RSC advisory acceptance

`npm audit --omit=dev` reports GHSA-qwww-vcr4-c8h2 for `react-router` 7.18.1.
The affected feature is React Server Components (RSC) action handling. This
application is a Vite browser SPA: it uses `BrowserRouter`, `Routes`, and
`Route`, and does not use React Router RSC mode, server actions, or a React
Server Components server runtime. The affected execution path is therefore not
present in the deployed application.

The dependency remains at 7.18.1 because the audit's suggested downgrade to
7.11.0 would discard later security fixes. Reassess this exception whenever the
application introduces SSR/RSC, React Router publishes a fixed compatible
release, or the production dependency audit changes.

Compensating controls: server-side cookie authentication, SameSite=Strict
sessions, CSRF-resistant CORS origin allowlisting, and no browser-exposed
service credentials.

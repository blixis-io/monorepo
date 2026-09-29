# Extensions

The guides for module authors live in the **developer manual** ([blixis-docs.frosty-hill-6079.workers.dev](https://blixis-docs.frosty-hill-6079.workers.dev), source in [`apps/docs`](../../apps/docs)), next to the concepts they build on:

| Topic | Manual page (source) |
|---|---|
| Writing a module: package setup, services, storage and migrations, REST, permissions, GraphQL, events, testing, versioning, forbidden patterns | [extending/authoring-guide.mdx](../../apps/docs/src/content/docs/extending/authoring-guide.mdx) |
| Security model: modules are trusted code (not sandboxed), what they can reach, a review checklist, the isolation roadmap | [extending/security-model.mdx](../../apps/docs/src/content/docs/extending/security-model.mdx) |
| Security checklist for modules (routes, tenant data, secrets, outbound calls, logging, files, dependencies) | [docs/security/checklist.md](../security/checklist.md) |
| Custom field types | [extending/custom-field-types.mdx](../../apps/docs/src/content/docs/extending/custom-field-types.mdx) |

The guide's examples come from [`examples/blixis-example-seo`](../../examples/blixis-example-seo), which installs Blixis from packed tarballs and is tested (plan 018). The CI job `extension contract` runs it on every PR: packs the public packages, runs the plugin's typecheck and Postgres tests from the tarballs, and bundles it into a Worker with first-party modules ([`examples/extension-smoke`](../../examples/extension-smoke)). Public API changes show up in [`docs/api-surface`](../api-surface) and need a reviewed snapshot update (see [`docs/contracts/README.md`](../contracts/README.md#changing-the-public-api-on-purpose)). Which packages modules may import, and why: [ADR 0016](../decisions/0016-public-capability-contracts.md) and [`docs/contracts/README.md`](../contracts/README.md).

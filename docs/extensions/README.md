# Extensions

The guides for module authors live in the **developer manual** ([blixis-docs.frosty-hill-6079.workers.dev](https://blixis-docs.frosty-hill-6079.workers.dev), source in [`apps/docs`](../../apps/docs)), next to the concepts they build on:

| Topic | Manual page (source) |
|---|---|
| Writing a module: package setup, services, storage and migrations, REST, permissions, GraphQL, events, testing, versioning, forbidden patterns | [extending/authoring-guide.mdx](../../apps/docs/src/content/docs/extending/authoring-guide.mdx) |
| Security model: modules are trusted code (not sandboxed), what they can reach, a review checklist, the isolation roadmap | [extending/security-model.mdx](../../apps/docs/src/content/docs/extending/security-model.mdx) |
| Custom field types | [extending/custom-field-types.mdx](../../apps/docs/src/content/docs/extending/custom-field-types.mdx) |

The guide's examples come from [`examples/blixis-example-seo`](../../examples/blixis-example-seo), which installs Blixis from packed tarballs and is tested (plan 018). Which packages modules may import, and why: [ADR 0016](../decisions/0016-public-capability-contracts.md) and [`docs/contracts/README.md`](../contracts/README.md).

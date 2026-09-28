# Changelog

## 0.1.0 (2026-09-28)


### Features

* **events:** add the events package with registry and envelopes ([#50](https://github.com/blixis-io/monorepo/issues/50)) ([1cfee26](https://github.com/blixis-io/monorepo/commit/1cfee267b7cf8fe1e8dc096a77b2f7f6f350cfe8))
* **events:** add the transactional outbox with post-commit dispatch ([#55](https://github.com/blixis-io/monorepo/issues/55)) ([930d5dc](https://github.com/blixis-io/monorepo/commit/930d5dc65cee9c981eb883554c60b5379bd552d2))
* **events:** consume the events queue and dispatch to subscriptions ([#54](https://github.com/blixis-io/monorepo/issues/54)) ([2e4634d](https://github.com/blixis-io/monorepo/commit/2e4634db5bde46ab7ade2e392ad572f29e0538d3))
* **events:** deliver events in-process with isolated handler scopes ([#51](https://github.com/blixis-io/monorepo/issues/51)) ([f191154](https://github.com/blixis-io/monorepo/commit/f191154da4dccf3e3d14614032ef7ef24de464ad))
* **events:** send best-effort events to Cloudflare Queues ([#52](https://github.com/blixis-io/monorepo/issues/52)) ([509ea94](https://github.com/blixis-io/monorepo/commit/509ea94daa7a841027208a5e92e8da1a7313ea4c))
* **events:** skip processed events and support idempotency keys ([#56](https://github.com/blixis-io/monorepo/issues/56)) ([56b0cae](https://github.com/blixis-io/monorepo/commit/56b0caee0b507b61ea1160e75916870940ea172f))
* **release:** version and publish the public packages to npm ([#141](https://github.com/blixis-io/monorepo/issues/141)) ([c8e7e94](https://github.com/blixis-io/monorepo/commit/c8e7e94ef88aed58472f134df71ebb0d96efe574))
* **spaces:** resolve and bind a verified tenant per request ([#73](https://github.com/blixis-io/monorepo/issues/73)) ([ca856c9](https://github.com/blixis-io/monorepo/commit/ca856c9e234a69510101f331df6ee67d61012f9c))


### Bug Fixes

* **events:** log post-commit dispatch and unrouted events ([#95](https://github.com/blixis-io/monorepo/issues/95)) ([4809e1b](https://github.com/blixis-io/monorepo/commit/4809e1b70765a7f0aef7d4620b71a2eb4dc48fde))

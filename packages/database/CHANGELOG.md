# Changelog

## 0.1.0 (2026-09-28)


### Features

* **database:** add the database package with per-request connections ([#41](https://github.com/blixis-io/monorepo/issues/41)) ([4ef9154](https://github.com/blixis-io/monorepo/commit/4ef9154bc42cd943f2122147b5167cd0b8562987))
* **database:** add transaction helpers and the transaction scope bridge ([#43](https://github.com/blixis-io/monorepo/issues/43)) ([70ab851](https://github.com/blixis-io/monorepo/commit/70ab851a20dbbb4abbc3b1170bff759b9108ba8f))
* **database:** add UUIDv7 ids and fail-closed tenancy helpers ([#47](https://github.com/blixis-io/monorepo/issues/47)) ([2d6ff5d](https://github.com/blixis-io/monorepo/commit/2d6ff5dbcfff5c16e4f608bac22a65087ddbff1c))
* **database:** apply module migrations from a database CLI ([#45](https://github.com/blixis-io/monorepo/issues/45)) ([ce4a7c7](https://github.com/blixis-io/monorepo/commit/ce4a7c76c40e7cb514e76104a71cfdf5f54663ad))
* **events:** add the events package with registry and envelopes ([#50](https://github.com/blixis-io/monorepo/issues/50)) ([1cfee26](https://github.com/blixis-io/monorepo/commit/1cfee267b7cf8fe1e8dc096a77b2f7f6f350cfe8))
* **events:** skip processed events and support idempotency keys ([#56](https://github.com/blixis-io/monorepo/issues/56)) ([56b0cae](https://github.com/blixis-io/monorepo/commit/56b0caee0b507b61ea1160e75916870940ea172f))
* **graphql:** enforce query limits and a delivery query budget ([#103](https://github.com/blixis-io/monorepo/issues/103)) ([d1d989d](https://github.com/blixis-io/monorepo/commit/d1d989d4e398f83078a636d4252895d526021b7b))
* **kernel:** add a readiness endpoint with module health checks ([#48](https://github.com/blixis-io/monorepo/issues/48)) ([a8140a4](https://github.com/blixis-io/monorepo/commit/a8140a418ec1bdc8329d968682e70c13358631b8))
* **release:** version and publish the public packages to npm ([#141](https://github.com/blixis-io/monorepo/issues/141)) ([c8e7e94](https://github.com/blixis-io/monorepo/commit/c8e7e94ef88aed58472f134df71ebb0d96efe574))
* **spaces:** resolve and bind a verified tenant per request ([#73](https://github.com/blixis-io/monorepo/issues/73)) ([ca856c9](https://github.com/blixis-io/monorepo/commit/ca856c9e234a69510101f331df6ee67d61012f9c))
* **testing:** run database tests against isolated Postgres databases ([#46](https://github.com/blixis-io/monorepo/issues/46)) ([f0809e8](https://github.com/blixis-io/monorepo/commit/f0809e863e4768ed543341dca27df04eebe718be))

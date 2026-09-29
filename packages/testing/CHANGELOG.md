# Changelog

## [0.2.0](https://github.com/blixis-io/monorepo/compare/testing-v0.1.0...testing-v0.2.0) (2026-09-29)


### Miscellaneous Chores

* **testing:** Synchronize blixis-io packages versions

## 0.1.0 (2026-09-28)


### Features

* **assets:** stream uploads and manage assets over REST ([#114](https://github.com/blixis-io/monorepo/issues/114)) ([21acd34](https://github.com/blixis-io/monorepo/commit/21acd34ba4d76efca1f096931f59d60932ceb384))
* **auth:** add delivery and preview keys ([#99](https://github.com/blixis-io/monorepo/issues/99)) ([295f22e](https://github.com/blixis-io/monorepo/commit/295f22e88129837f0a601c8647071f3a9702c721))
* **auth:** resolve request actors from bearer access tokens ([#63](https://github.com/blixis-io/monorepo/issues/63)) ([401758a](https://github.com/blixis-io/monorepo/commit/401758a1d7814f6028daa37d2433f908da6f2f7e))
* **cloudflare:** add object storage port with R2 adapter ([#112](https://github.com/blixis-io/monorepo/issues/112)) ([6fcd41e](https://github.com/blixis-io/monorepo/commit/6fcd41eca4578a76ccdddb9fddc267301ceb337a))
* **content:** add entry management routes ([#89](https://github.com/blixis-io/monorepo/issues/89)) ([b0f9b90](https://github.com/blixis-io/monorepo/commit/b0f9b90ce6cf41b9bbe35826cecaac0726ba0965))
* **events:** deliver events in-process with isolated handler scopes ([#51](https://github.com/blixis-io/monorepo/issues/51)) ([f191154](https://github.com/blixis-io/monorepo/commit/f191154da4dccf3e3d14614032ef7ef24de464ad))
* **graphql:** enforce query limits and a delivery query budget ([#103](https://github.com/blixis-io/monorepo/issues/103)) ([d1d989d](https://github.com/blixis-io/monorepo/commit/d1d989d4e398f83078a636d4252895d526021b7b))
* **kernel:** add a readiness endpoint with module health checks ([#48](https://github.com/blixis-io/monorepo/issues/48)) ([a8140a4](https://github.com/blixis-io/monorepo/commit/a8140a418ec1bdc8329d968682e70c13358631b8))
* **release:** version and publish the public packages to npm ([#141](https://github.com/blixis-io/monorepo/issues/141)) ([c8e7e94](https://github.com/blixis-io/monorepo/commit/c8e7e94ef88aed58472f134df71ebb0d96efe574))
* **testing:** add @blixis/testing with createTestBlixis ([#30](https://github.com/blixis-io/monorepo/issues/30)) ([2c6b255](https://github.com/blixis-io/monorepo/commit/2c6b2550843403eb891323c015d2189e1ac541af))
* **testing:** run database tests against isolated Postgres databases ([#46](https://github.com/blixis-io/monorepo/issues/46)) ([f0809e8](https://github.com/blixis-io/monorepo/commit/f0809e863e4768ed543341dca27df04eebe718be))
* **webhooks:** add webhook configuration with encrypted secrets ([#121](https://github.com/blixis-io/monorepo/issues/121)) ([9e71221](https://github.com/blixis-io/monorepo/commit/9e712215a1c4b2070799bb5d7f3f2cbaf49ed2c0))


### Bug Fixes

* **assets:** name the checksum in digest mismatch errors ([#115](https://github.com/blixis-io/monorepo/issues/115)) ([6835c8d](https://github.com/blixis-io/monorepo/commit/6835c8dd1851498c0cb88459010147a31946a4e9))

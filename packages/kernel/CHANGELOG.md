# Changelog

## 0.1.0 (2026-09-28)


### Features

* **admin:** scaffold the React admin with ADR 0017 and API CORS ([#130](https://github.com/blixis-io/monorepo/issues/130)) ([4a714ff](https://github.com/blixis-io/monorepo/commit/4a714ff028e682c387229193233b2012729f670d))
* **api:** report unexpected errors to Sentry ([#39](https://github.com/blixis-io/monorepo/issues/39)) ([ff34f57](https://github.com/blixis-io/monorepo/commit/ff34f5757de991ed12d9ea173c5f2edbd888091d))
* **assets:** serve published asset files with safe caching ([#116](https://github.com/blixis-io/monorepo/issues/116)) ([cf6e64a](https://github.com/blixis-io/monorepo/commit/cf6e64a48a87feb43797a10f7f53aaf5b5076d6d))
* **auth:** resolve request actors from bearer access tokens ([#63](https://github.com/blixis-io/monorepo/issues/63)) ([401758a](https://github.com/blixis-io/monorepo/commit/401758a1d7814f6028daa37d2433f908da6f2f7e))
* **cloudflare:** validate the Worker environment on first invocation ([#36](https://github.com/blixis-io/monorepo/issues/36)) ([ee57a58](https://github.com/blixis-io/monorepo/commit/ee57a58adcda31142072de91369718fd09ec0ab6))
* **events:** add the events package with registry and envelopes ([#50](https://github.com/blixis-io/monorepo/issues/50)) ([1cfee26](https://github.com/blixis-io/monorepo/commit/1cfee267b7cf8fe1e8dc096a77b2f7f6f350cfe8))
* **events:** deliver events in-process with isolated handler scopes ([#51](https://github.com/blixis-io/monorepo/issues/51)) ([f191154](https://github.com/blixis-io/monorepo/commit/f191154da4dccf3e3d14614032ef7ef24de464ad))
* **graphql:** map errors to codes and report unexpected ones ([#98](https://github.com/blixis-io/monorepo/issues/98)) ([b72506a](https://github.com/blixis-io/monorepo/commit/b72506a6095eccbbaaf1ac9b9eddd93b948d801d))
* **graphql:** serve /graphql with GraphQL Yoga ([#96](https://github.com/blixis-io/monorepo/issues/96)) ([6b67e15](https://github.com/blixis-io/monorepo/commit/6b67e15e5c8c655764da82f6ee1ebd02bff72def))
* **kernel:** add a readiness endpoint with module health checks ([#48](https://github.com/blixis-io/monorepo/issues/48)) ([a8140a4](https://github.com/blixis-io/monorepo/commit/a8140a418ec1bdc8329d968682e70c13358631b8))
* **kernel:** add createBlixis with a lazy setup and boot lifecycle ([#26](https://github.com/blixis-io/monorepo/issues/26)) ([edd7e84](https://github.com/blixis-io/monorepo/commit/edd7e84f0ec34d6c1d7f940bda612e4a1c46cce4))
* **kernel:** add queue and cron dispatch with per-invocation scopes ([#35](https://github.com/blixis-io/monorepo/issues/35)) ([d9d3bb3](https://github.com/blixis-io/monorepo/commit/d9d3bb34a4d856d7936b22677507d31d4d1043a9))
* **kernel:** add the service registry with app and request scopes ([#25](https://github.com/blixis-io/monorepo/issues/25)) ([9939902](https://github.com/blixis-io/monorepo/commit/993990235feae412799b0fa3b3738154da3b3ab2))
* **kernel:** collect module contributions with conflict checks ([#29](https://github.com/blixis-io/monorepo/issues/29)) ([18cea43](https://github.com/blixis-io/monorepo/commit/18cea43d9aa0c11ad2e2a4d3496c12c376260609))
* **kernel:** mount module REST routes with context and error mapping ([#28](https://github.com/blixis-io/monorepo/issues/28)) ([de1e252](https://github.com/blixis-io/monorepo/commit/de1e2528afcbb116c1d38b0997a9090f13ba8c68))
* **kernel:** scaffold @blixis/kernel with defineModule ([#23](https://github.com/blixis-io/monorepo/issues/23)) ([ef8c7d5](https://github.com/blixis-io/monorepo/commit/ef8c7d59fa0c1724ab2e2aa826fe7340fe5c0608))
* **kernel:** validate module configuration before setup ([#27](https://github.com/blixis-io/monorepo/issues/27)) ([52a170e](https://github.com/blixis-io/monorepo/commit/52a170e3c2a871278e68ab3d38c1f3a5a62ee7ac))
* **kernel:** validate the module graph and compute bootstrap order ([#24](https://github.com/blixis-io/monorepo/issues/24)) ([47ced9c](https://github.com/blixis-io/monorepo/commit/47ced9c4b668ccd602c51264fc6c5215d4f5558f))
* **release:** version and publish the public packages to npm ([#141](https://github.com/blixis-io/monorepo/issues/141)) ([c8e7e94](https://github.com/blixis-io/monorepo/commit/c8e7e94ef88aed58472f134df71ebb0d96efe574))
* **spaces:** resolve and bind a verified tenant per request ([#73](https://github.com/blixis-io/monorepo/issues/73)) ([ca856c9](https://github.com/blixis-io/monorepo/commit/ca856c9e234a69510101f331df6ee67d61012f9c))
* **testing:** add @blixis/testing with createTestBlixis ([#30](https://github.com/blixis-io/monorepo/issues/30)) ([2c6b255](https://github.com/blixis-io/monorepo/commit/2c6b2550843403eb891323c015d2189e1ac541af))

# Changelog

## 0.1.0 (2026-09-28)


### Features

* **api:** describe the Management API with generated OpenAPI ([#126](https://github.com/blixis-io/monorepo/issues/126)) ([d66193e](https://github.com/blixis-io/monorepo/commit/d66193ec6bf63cd3daba8bdcec526ad8d2405b32))
* **assets:** delete files after commit and clean up stale uploads ([#118](https://github.com/blixis-io/monorepo/issues/118)) ([b3a5f87](https://github.com/blixis-io/monorepo/commit/b3a5f87896b88e5b6d2796dbda48640166763f2c))
* **assets:** serve published asset files with safe caching ([#116](https://github.com/blixis-io/monorepo/issues/116)) ([cf6e64a](https://github.com/blixis-io/monorepo/commit/cf6e64a48a87feb43797a10f7f53aaf5b5076d6d))
* **auth:** add delivery and preview keys ([#99](https://github.com/blixis-io/monorepo/issues/99)) ([295f22e](https://github.com/blixis-io/monorepo/commit/295f22e88129837f0a601c8647071f3a9702c721))
* **cloudflare:** add object storage port with R2 adapter ([#112](https://github.com/blixis-io/monorepo/issues/112)) ([6fcd41e](https://github.com/blixis-io/monorepo/commit/6fcd41eca4578a76ccdddb9fddc267301ceb337a))
* **content:** link and deliver assets through a capability port ([#117](https://github.com/blixis-io/monorepo/issues/117)) ([d136411](https://github.com/blixis-io/monorepo/commit/d136411fddd3787af041e193bff3a9677fa5461d))
* **contracts:** add actor, permission, and authorization contracts ([#15](https://github.com/blixis-io/monorepo/issues/15)) ([d3b8553](https://github.com/blixis-io/monorepo/commit/d3b8553bbca9a0155239737ffa240bfc20a7545f))
* **contracts:** add module, lifecycle, and contribution contracts ([#17](https://github.com/blixis-io/monorepo/issues/17)) ([3eedcb7](https://github.com/blixis-io/monorepo/commit/3eedcb7988a0f0775d241f32ab68d85aea41748c))
* **contracts:** add request context, logger, and migration contracts ([#16](https://github.com/blixis-io/monorepo/issues/16)) ([8d5265c](https://github.com/blixis-io/monorepo/commit/8d5265c8f9a9d89ef67f85cfd21e4b8b43f87ac5))
* **contracts:** add Standard Schema validation helpers and adopt Zod ([#13](https://github.com/blixis-io/monorepo/issues/13)) ([02a8384](https://github.com/blixis-io/monorepo/commit/02a83848bc3d783d1c5b3f33489c73037981aade))
* **contracts:** add the example SEO plugin and close its contract gaps ([#137](https://github.com/blixis-io/monorepo/issues/137)) ([034c708](https://github.com/blixis-io/monorepo/commit/034c7084abf54f58a9d3ace13e7dfb718bdff3b4))
* **contracts:** add transport-agnostic public error model ([#12](https://github.com/blixis-io/monorepo/issues/12)) ([b29454d](https://github.com/blixis-io/monorepo/commit/b29454d89a17a97914ecb2d393a8ce1cba4fbcb4))
* **contracts:** add typed service tokens and capability identifiers ([#11](https://github.com/blixis-io/monorepo/issues/11)) ([d0051aa](https://github.com/blixis-io/monorepo/commit/d0051aa229211f8e526bbb526fed550b279f4bd1))
* **contracts:** add versioned event envelope and definition contracts ([#14](https://github.com/blixis-io/monorepo/issues/14)) ([cd9d57c](https://github.com/blixis-io/monorepo/commit/cd9d57c54f858ab9e9c45ab2640bbe5956853f8e))
* **contracts:** scaffold @blixis/contracts package ([#10](https://github.com/blixis-io/monorepo/issues/10)) ([6fd50eb](https://github.com/blixis-io/monorepo/commit/6fd50eb6f17f38159338c911d4bba369877f71c3))
* **events:** add the events package with registry and envelopes ([#50](https://github.com/blixis-io/monorepo/issues/50)) ([1cfee26](https://github.com/blixis-io/monorepo/commit/1cfee267b7cf8fe1e8dc096a77b2f7f6f350cfe8))
* **events:** skip processed events and support idempotency keys ([#56](https://github.com/blixis-io/monorepo/issues/56)) ([56b0cae](https://github.com/blixis-io/monorepo/commit/56b0caee0b507b61ea1160e75916870940ea172f))
* **graphql:** serve /graphql with GraphQL Yoga ([#96](https://github.com/blixis-io/monorepo/issues/96)) ([6b67e15](https://github.com/blixis-io/monorepo/commit/6b67e15e5c8c655764da82f6ee1ebd02bff72def))
* **kernel:** add queue and cron dispatch with per-invocation scopes ([#35](https://github.com/blixis-io/monorepo/issues/35)) ([d9d3bb3](https://github.com/blixis-io/monorepo/commit/d9d3bb34a4d856d7936b22677507d31d4d1043a9))
* **kernel:** add the service registry with app and request scopes ([#25](https://github.com/blixis-io/monorepo/issues/25)) ([9939902](https://github.com/blixis-io/monorepo/commit/993990235feae412799b0fa3b3738154da3b3ab2))
* **kernel:** validate module configuration before setup ([#27](https://github.com/blixis-io/monorepo/issues/27)) ([52a170e](https://github.com/blixis-io/monorepo/commit/52a170e3c2a871278e68ab3d38c1f3a5a62ee7ac))
* **permissions:** add system and custom roles ([#76](https://github.com/blixis-io/monorepo/issues/76)) ([de1d865](https://github.com/blixis-io/monorepo/commit/de1d865a93a79898dbbd2086e055e6c4535c9a7a))
* **permissions:** implement the authorization service and roles API ([#77](https://github.com/blixis-io/monorepo/issues/77)) ([eac28c3](https://github.com/blixis-io/monorepo/commit/eac28c3d30eb62bb1890cfa7dcb49eae478108cd))
* **release:** version and publish the public packages to npm ([#141](https://github.com/blixis-io/monorepo/issues/141)) ([c8e7e94](https://github.com/blixis-io/monorepo/commit/c8e7e94ef88aed58472f134df71ebb0d96efe574))
* **spaces:** enforce permissions in tenancy and member services ([#78](https://github.com/blixis-io/monorepo/issues/78)) ([e20c3da](https://github.com/blixis-io/monorepo/commit/e20c3da099a12c71aa468582bd7d2156f5bb4b56))
* **spaces:** resolve and bind a verified tenant per request ([#73](https://github.com/blixis-io/monorepo/issues/73)) ([ca856c9](https://github.com/blixis-io/monorepo/commit/ca856c9e234a69510101f331df6ee67d61012f9c))

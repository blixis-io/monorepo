/**
 * `@blixis/spaces` — the tenant hierarchy (architecture §21, §31): organizations, spaces,
 * environments, and locales. Other modules use its services and tenant context; they never read
 * its tables.
 *
 * @packageDocumentation
 */

export {
  type SpaceDetails,
  TENANCY_SERVICE,
  type TenancyService,
} from './application/tenancy.service.ts'
export {
  canonicalLocale,
  DEFAULT_ENVIRONMENT_KEY,
  type Environment,
  type Locale,
  localeCodeSchema,
  nameSchema,
  type Organization,
  type Space,
  slugSchema,
} from './domain/tenancy.ts'
export { organizationCreated, spaceCreated, spaceDeleted, spaceUpdated } from './events.ts'
export { type SpacesModuleOptions, spacesModule } from './module.ts'

# Authorization

How modules declare permissions, check them, and prove the checks with the authorization matrix (architecture §5, §30; plan 009). Roles and evaluation are owned by `@blixis/permissions`.

Related: [Tenancy](./tenancy.md) · [Testing](./testing.md) · [Manual: Actors and permissions](../../apps/docs/src/content/docs/concepts/permissions.mdx)

---

## The rules

1. **Declare permissions in the module definition** with `definePermission`:
   - use your namespace first: `<module>.<action>` or `<module>.<resource>.<action>`;
   - give it a `scope` (`space` by default, or `organization`) and `defaultRoles` for `admin`, `editor` and `viewer`;
   - export them as constants (e.g. `SPACES_PERMISSIONS`) and reference those, never string literals scattered through code.
2. **Check in services, not handlers:**
   - call `AUTHORIZATION_SERVICE.require({ actor, action, resource })` before reading or changing tenant data;
   - pass the actor into the service, so REST, GraphQL and background jobs share the check.
3. **Pass a verified tenant in the `ResourceRef`:**
   - `organizationId` for organization permissions, plus `spaceId` for space permissions;
   - take them from `spaceScoped()`, or from the organization or space you loaded by id — never from the request body.
4. **Let `require` pick the error:**
   - `401` for anonymous actors;
   - `404` when the actor isn't a member of the tenant, so existence isn't revealed;
   - `403` for members without the permission.

   Don't catch and remap these.
5. **Never compare role names.** Roles are configuration. `role === 'admin'`, `eq(x.roleKey, 'owner')` and `['owner', …].includes(role)` fail `pnpm lint` (`role-name-check`) outside `@blixis/permissions`. The last-owner invariant in `@blixis/users` uses `OWNER_ROLE`, because it is a rule about ownership data, not an access decision.
6. **Guard role grants:** code that assigns, changes or removes a membership role calls `ROLE_SERVICE.assertCanGrant(actor, tenant, role)`. An actor can only grant or take away a role whose permissions it holds.
7. **`system` actors** pass only when the call sets `allowSystem: true`. Set it only where platform code must act, such as tenant resolution for queue consumers, and say why in a comment.

## API tokens

A token acts with its owner's permissions **intersected with its scopes**, and a token without scopes can do nothing. Operations that no permission covers (creating organizations, managing tokens) are refused for tokens.

## The authorization matrix

`tooling/tenant-isolation/test/authz-matrix.test.ts` runs every permission-guarded route (`test/authz-routes.ts`) as every case:
- `owner`, `admin`, `editor` and `viewer` of the organization;
- `admin`, `editor` and `viewer` of the space only;
- an owner of another organization;
- an anonymous caller;
- the owner's API tokens, one read-only and one with every scope.

Each case gets a **fresh tenant**, so allowed changes and deletions really run. The expected status follows from the case's permissions:

| Case | Expected |
|---|---|
| anonymous | `401` |
| no membership at the route's level | `404` |
| holds the route's permission | `2xx` |
| otherwise | `403` |

The expected permissions come from the system roles (`systemRoles(catalog)`), so changing a module's `defaultRoles` changes the expectations with it.

### Adding your routes

1. Add a row to `AUTHZ_ROUTES`:

   ```ts
   {
     method: 'POST',
     path: '/api/v1/spaces/:spaceId/notes',
     body: { title: 'Matrix' },           // must succeed for an allowed actor
     permission: 'notes.write',
     level: 'space',
   },
   ```
2. **Order matters:** each case runs the rows in order against its own tenant. Put reads first and deletions of shared fixtures last. `DELETE /spaces/:spaceId` is always the final row.
3. **New fixtures:** if the route needs a fixture (such as `:noteId`), create it in the `tenant()` seed and return it in `params`. Use `paramsFrom` when one parameter name means different things on different routes.
4. **Coverage is enforced:** the suite fails for tenant-scoped routes missing from `AUTHZ_ROUTES`, and for rows that match no registered route. Register the route in the [isolation suite](./tenancy.md) too.

The harness (`defineAuthzMatrix`, `checkAuthzMatrix`, `expectedAuthzStatus`) lives in `@blixis/testing` for module-level matrices as well.

**Runs in the Node pool:** the matrix runs in the Node pool against the test database, like every Postgres test. `pg` can't reach Postgres from the Workers pool (see [Testing](./testing.md)).

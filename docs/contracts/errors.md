# Public Errors

Transport-agnostic error model from architecture §28, implemented in [`packages/contracts/src/errors.ts`](../../packages/contracts/src/errors.ts). Services throw these classes; each transport maps the `code` to its protocol. Services never throw Hono `HTTPException`s or GraphQL errors.

Related: [Contracts overview](./README.md) · [Code standards §6](../conventions/code-standards.md#6-errors)

---

## Classes and mapping

| Class | `code` | Exposed to clients | REST status | GraphQL `extensions.code` |
|---|---|---|---|---|
| `ValidationError` | `VALIDATION_FAILED` | yes (+ `details.issues`) | 400 | `VALIDATION_FAILED` (Yoga may use `BAD_USER_INPUT` alias — decided in 012.003) |
| `NotFoundError` | `NOT_FOUND` | yes | 404 | `NOT_FOUND` |
| `ConflictError` | `CONFLICT` | yes | 409 | `CONFLICT` |
| `ForbiddenError` | `FORBIDDEN` | yes | 403 | `FORBIDDEN` |
| `UnauthorizedError` | `UNAUTHORIZED` | yes | 401 | `UNAUTHORIZED` |
| `RateLimitError` | `RATE_LIMITED` | yes (+ `Retry-After` from `retryAfterSeconds`) | 429 | `RATE_LIMITED` |
| `ModuleError` | `MODULE_ERROR` | **no** (generic message) | 500 | `INTERNAL` |
| `InfrastructureError` | `INFRASTRUCTURE_ERROR` | **no** (generic message) | 503 if `retryable`, else 500 | `INFRASTRUCTURE_ERROR` |
| anything else | `INTERNAL` | **no** | 500 | `INTERNAL` |

The REST mapping is implemented by the kernel (003.006) and the GraphQL mapping by `@blixis/graphql` (012.003); both use `toPublicErrorShape()` so redaction rules live in one place. The REST body format (RFC 9457 problem details) is defined in 003.006.

## Rules

- **`isBlixisError(value)`** uses a `Symbol.for` brand, so it works across duplicated package instances — prefer it over `instanceof`.
- **`toPublicErrorShape(error)`** returns `{ code, message, details? }`. Non-exposed errors (`ModuleError`, `InfrastructureError`) and unknown values get a generic message and no details. Stack traces and `cause` are never included.
- Put only JSON-serialisable, non-sensitive data in `details`.
- Wrap driver/SDK failures in `InfrastructureError` with `cause` at the infrastructure boundary; set `retryable: true` for transient failures.
- `ModuleError` messages are prefixed with the module name (§26); they appear in logs, not in responses.
- Non-members accessing tenant resources get `NotFoundError`, not `ForbiddenError`, to avoid ID enumeration (plan 008).

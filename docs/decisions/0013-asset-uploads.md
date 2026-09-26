# 0013 — Asset uploads, storage, and serving

- Status: accepted
- Date: 2026-09-26
- Roadmap task: [014.001](../plans/014-assets/001-upload-strategy-and-object-storage.md) (decision register D16)

## Context

Editors upload images, PDFs, video and other files to a space (plan 014). §17: binaries live in R2, the canonical asset record lives in Postgres. The API is one Worker (§46) and should use bindings, not REST APIs with credentials (§19).

**Platform limits** (Cloudflare documentation, checked 2026-09-26):

| Limit | Value |
|---|---|
| Worker request body | 100 MB (Free, Pro), 200 MB (Business), up to 5 GB (Enterprise) |
| Worker isolate memory | 128 MB, all requests of the isolate together |
| R2 single `put` | 5 GiB |
| R2 multipart | parts 5 MiB–5 GiB, all parts but the last the same size, ≤ 10 000 parts, objects ≤ 5 TiB; incomplete uploads are aborted after 7 days |
| R2 checksums on `put` | one of md5, sha1, sha256, sha384, sha512; a mismatch fails the `put` and nothing is stored |

- **Memory:** a 128 MB isolate serves many requests at once, so an upload must **stream** to R2. Buffering even one large file (`await request.arrayBuffer()`) can crash the isolate.
- **XSS:** files are served from the API origin until a custom domain exists. An uploaded HTML or SVG file that runs scripts there could read a signed-in user's data.

## Decision

### 1. Uploads stream through the Worker to the R2 binding

- **Direct upload** (one request): the request body streams straight into `bucket.put()`. The client must send `Content-Length`; the Worker never reads the body into memory. Default maximum **90 MiB**, below the 100 MB limit of every plan (`assetsModule({ maxDirectUploadBytes })`).
- **Multipart upload** (large files), through the binding's multipart API:
  1. `POST …/uploads` creates the upload and returns an `uploadId` and the part size to use.
  2. `PUT …/uploads/:uploadId/parts/:n` streams each part (same size except the last; 5–90 MiB).
  3. `POST …/uploads/:uploadId/complete` completes it and creates the asset.
  4. `DELETE …/uploads/:uploadId` aborts. Abandoned uploads are aborted by R2 after 7 days.
- **Maximum asset size:** default **1 GiB** (`assetsModule({ maxAssetBytes })`), configurable up to R2's 5 TiB.
- **Not chosen now: presigned direct-to-R2 URLs.** They need R2 S3 API credentials as a Worker secret and CORS on the bucket, and the Worker can no longer check the upload before it lands. Revisit when uploads need to bypass the Worker (very large video).

### 2. Postgres is canonical; R2 holds immutable objects

- **The asset record** (plan 014.002) lives in Postgres with the tenancy columns of ADR 0007 (`organization_id`, `space_id`, `environment_id`), like entries.
- **Object keys are opaque and tenant-prefixed:** `<spaceId>/<assetId>/<fileId>`.
  - `fileId` is a new UUIDv7 for every uploaded file. Replacing an asset's file writes a new object, so an object never changes after it is written.
  - Keys are never derived from file names; the original file name is metadata.
  - The space prefix lets space deletion and orphan cleanup list a space's objects.
- **R2 object metadata** carries only `contentType` (for direct reads during debugging). It's never read as the source of truth.
- **Deleting objects** happens after the Postgres transaction commits, in an idempotent consumer of `asset.deleted` (and of `asset.updated` for a replaced file). A rolled-back delete never loses a binary (014.006).

### 3. Integrity

- **Direct uploads:** the Worker computes the SHA-256 while streaming (`crypto.DigestStream` on a tee of the body) and stores it with the asset. A client may send `Content-Digest: sha-256=:<base64>:` (RFC 9530); the Worker passes it to R2's `sha256` option, so a corrupted upload fails and nothing is stored.
- **Multipart uploads:** parts are verified by length only; the asset's `sha256` stays `null`. (R2 exposes no whole-object checksum for multipart objects.)
- **Size:** the stored size is R2's, never the client's claim.

### 4. File types

- **Allow-list** of declared MIME types, configurable (`assetsModule({ allowedTypes })`). The default covers images (`jpeg`, `png`, `gif`, `webp`, `avif`, `svg+xml`), `application/pdf`, audio (`mpeg`, `ogg`, `wav`), video (`mp4`, `webm`), `text/plain`, `text/csv`, `application/json`, `application/zip`, and Office/OpenDocument formats.
- **Never allowed:** `text/html`, `application/xhtml+xml`, JavaScript, and anything else a browser executes as a document or script.
- **Signature check:** for images and PDF, the first bytes must match the declared type (magic numbers); a mismatch is `400`. This stops a script disguised as `image/png`.

### 5. Serving

- **Where:** a delivery route on the API origin for the MVP (014.004). Once custom domains exist (plan 021), assets move to a separate hostname (`assets.<domain>`), so no uploaded file shares an origin with the API.
- **Headers on every asset response:**
  - `X-Content-Type-Options: nosniff`;
  - `Content-Security-Policy: default-src 'none'; style-src 'unsafe-inline'; sandbox`, so an SVG can't run scripts even when opened directly;
  - `Content-Disposition: inline` for images, audio, video and PDF, and `attachment` for everything else, with the original file name (RFC 6266 `filename*`);
  - `Cache-Control: public, max-age=31536000, immutable`, because the URL names the immutable `fileId`; a new file means a new URL;
  - `ETag` and `Range` support (`206`), for video seeking.
- **Published only:** delivery serves assets that are published (014.004). Drafts are read through the management API.
- **Image transformations** (resizing, formats) are deferred: Cloudflare Images or Image Resizing on the custom domain, decided with plan 021.

### 6. The storage port

- **`ObjectStorage` in `@blixis/contracts`**, with the `OBJECT_STORAGE` service token. Third-party modules that need files (imports, exports, generated PDFs) get storage through the same port and capability, without depending on `@blixis/cloudflare`.
- **Operations:** `put`, `get` (with ranges), `head`, `delete` (idempotent, many keys), `list` (by prefix), and multipart `createMultipart`, `uploadPart`, `completeMultipart`, `abortMultipart`.
- **Adapters:** `r2ObjectStorage(bucket)` and `r2StorageModule({ binding })` in `@blixis/cloudflare`; `createMemoryObjectStorage()` in `@blixis/testing`, which enforces the same multipart rules.
- **Binding:** `ASSETS`, buckets `blixis-assets-staging` and `blixis-assets-production` (local: simulated by wrangler).

## Alternatives considered

- **Buffer uploads in the Worker:** simplest, but a few concurrent uploads exhaust the 128 MB isolate.
- **Presigned S3 URLs:** no Worker in the data path and no body limit, but credentials as secrets, bucket CORS, and no server-side check before the object exists (see §1).
- **Keys from file names** (`<space>/<name>`): readable, but collisions, path tricks, and renames that move objects. Opaque ids avoid all three.
- **Mutable object per asset** (overwrite on replace): fewer objects, but URLs can't be cached as immutable, and a failed replace can corrupt the only copy.
- **Port inside `@blixis/assets`:** simpler, but other modules would have to depend on the assets module to store a file.

## Consequences

- Uploads over 90 MiB need the multipart flow; the SDK (plan 017) should hide it.
- Every file replacement leaves an old object until the `asset.updated` consumer deletes it (seconds).
- Serving from the API origin is safe only with the headers above; moving to `assets.<domain>` is part of plan 021.
- The owner creates the R2 buckets once per environment before the first deploy that binds them.

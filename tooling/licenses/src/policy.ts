/**
 * Licence policy for production dependencies (security review 020.004). Blixis is MIT and its
 * packages are published: anything that would put obligations on users of the published
 * packages or the deployed Worker needs a decision first.
 */

/** Permissive licences accepted without review (SPDX ids). */
export const ALLOWED = new Set([
  'MIT',
  'MIT-0',
  'ISC',
  'Apache-2.0',
  'BSD-2-Clause',
  'BSD-3-Clause',
  '0BSD',
  'BlueOak-1.0.0',
  'CC0-1.0',
  'CC-BY-4.0',
  'Unlicense',
  'Python-2.0',
])

/**
 * Packages accepted under another licence, with the reason. Add entries in the PR that
 * introduces the dependency; reviewers check the reason.
 */
export const EXCEPTIONS: Readonly<Record<string, string>> = {
  lightningcss:
    'MPL-2.0 (file-level copyleft); build-time CSS tool for the admin and docs, not modified, not shipped in the Worker',
}

/** `pnpm licenses list --json` output: licence → packages. */
export type LicenseReport = Readonly<Record<string, readonly { readonly name: string }[]>>

/** Violations as `name (licence)`; a compound expression passes when one side is allowed. */
export function violations(report: LicenseReport): string[] {
  const allowed = (license: string) =>
    license
      .replace(/[()]/g, '')
      .split(/\s+OR\s+/i)
      .some((part) => part.split(/\s+AND\s+/i).every((id) => ALLOWED.has(id.trim())))
  const found: string[] = []
  for (const [license, packages] of Object.entries(report)) {
    if (allowed(license)) continue
    for (const { name } of packages) if (!(name in EXCEPTIONS)) found.push(`${name} (${license})`)
  }
  return found.sort()
}

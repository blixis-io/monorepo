import { execFileSync } from 'node:child_process'
import { type LicenseReport, violations } from './policy.ts'

// Checks the licences of production dependencies against the policy (docs/security/checklist.md).
const report = JSON.parse(
  execFileSync('pnpm', ['licenses', 'list', '--prod', '--json'], {
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
  }),
) as LicenseReport
const found = violations(report)
if (found.length > 0) {
  process.stderr.write(
    `licenses: ${found.length} dependencies outside the policy (tooling/licenses/src/policy.ts):\n` +
      found.map((line) => `  - ${line}\n`).join(''),
  )
  process.exit(1)
}
process.stdout.write(
  `licenses: ok (${Object.values(report).reduce((n, list) => n + list.length, 0)} packages)\n`,
)

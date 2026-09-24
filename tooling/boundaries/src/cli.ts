#!/usr/bin/env node
import path from 'node:path'
import process from 'node:process'
import { checkImports, checkPackages } from './rules.ts'
import { loadPackages, loadSourceFiles } from './workspace.ts'

const root = path.resolve(import.meta.dirname, '../../..')
const packages = loadPackages(root)
const files = loadSourceFiles(root, packages)
const violations = [...checkPackages(packages), ...checkImports(packages, files)]

if (violations.length === 0) {
  console.log(`boundaries: ok (${packages.length} packages, ${files.length} files)`)
} else {
  for (const v of violations) {
    const location = v.line === undefined ? v.file : `${v.file}:${v.line}`
    console.error(`${location}  ${v.rule}  ${v.message}`)
  }
  console.error(`\nboundaries: ${violations.length} violation(s)`)
  process.exitCode = 1
}

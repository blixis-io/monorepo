// Conventional Commits with the Blixis scopes — docs/conventions/commit-messages.md
export default {
  extends: ['@commitlint/config-conventional'],
  rules: {
    'header-max-length': [2, 'always', 72],
    'body-max-line-length': [2, 'always', 100],
    'scope-enum': [
      2,
      'always',
      [
        // platform packages
        'contracts',
        'kernel',
        'cloudflare',
        'database',
        'events',
        'graphql',
        'sdk',
        'testing',
        'shared',
        'content-api',
        // domain modules
        'auth',
        'users',
        'spaces',
        'permissions',
        'content',
        'assets',
        'webhooks',
        'releases',
        // apps
        'api',
        'admin',
        'example-site',
        // cross-cutting
        'deps',
        'repo',
        'roadmap',
        'adr',
        'release',
      ],
    ],
    'trailer-exists': [0],
  },
}

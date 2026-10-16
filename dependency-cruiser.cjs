/** @type {import('dependency-cruiser').IConfiguration} */
module.exports = {
  forbidden: [
    {
      name: 'schema-no-deps',
      severity: 'error',
      comment: 'schema may only depend on Zod (external).',
      from: { path: '^packages/schema/src' },
      to: {
        path: '^packages/(?!schema)',
        pathNot: '^packages/schema',
      },
    },
    {
      name: 'engine-only-schema',
      severity: 'error',
      comment: 'engine may only depend on schema.',
      from: { path: '^packages/engine/src', pathNot: '\\.test\\.ts$' },
      to: {
        path: '^packages/(?!engine|schema)',
      },
    },
    {
      name: 'engine-tests-may-use-fixtures',
      severity: 'error',
      comment: 'Engine tests may import synthetic fixtures. Production engine code may not.',
      from: { path: '^packages/engine/src/.*\\.test\\.ts$' },
      to: {
        path: '^packages/(?!engine|schema|test-fixtures)',
      },
    },
    {
      name: 'fixtures-only-schema',
      severity: 'error',
      comment: 'Synthetic fixtures stay free of engine so tests do not create a package cycle.',
      from: { path: '^packages/test-fixtures/src' },
      to: {
        path: '^packages/(?!test-fixtures|schema)',
      },
    },
    {
      name: 'api-only-schema',
      severity: 'error',
      comment: 'api may only depend on schema.',
      from: { path: '^packages/api/src' },
      to: {
        path: '^packages/(?!api|schema)',
      },
    },
    {
      name: 'core-allowed-deps',
      severity: 'error',
      comment: 'core may depend on schema, engine, and api only.',
      from: { path: '^packages/core/src', pathNot: '(\\.test\\.ts$|^packages/core/src/test/)' },
      to: {
        path: '^packages/(?!core|schema|engine|api)',
      },
    },
    {
      name: 'core-tests-may-use-fixtures',
      severity: 'error',
      comment: 'core tests and test helpers may also use the synthetic fixtures.',
      from: { path: '(^packages/core/src/.*\\.test\\.ts$|^packages/core/src/test/)' },
      to: {
        path: '^packages/(?!core|schema|engine|api|test-fixtures)',
      },
    },
    {
      name: 'no-adapters-from-core-or-engine',
      severity: 'error',
      comment: 'core and engine must not import adapters.',
      from: { path: '^packages/(core|engine)/src' },
      to: { path: '^packages/adapters-' },
    },
    {
      name: 'no-circular',
      severity: 'error',
      from: {},
      to: { circular: true },
    },
  ],
  options: {
    doNotFollow: {
      path: 'node_modules',
    },
    tsPreCompilationDeps: true,
    tsConfig: {
      fileName: 'tsconfig.json',
    },
    enhancedResolveOptions: {
      exportsFields: ['exports'],
      conditionNames: ['import', 'require', 'node', 'default'],
    },
  },
};

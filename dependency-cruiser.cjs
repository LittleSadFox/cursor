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
      from: { path: '^packages/engine/src' },
      to: {
        path: '^packages/(?!engine|schema)',
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
      from: { path: '^packages/core/src' },
      to: {
        path: '^packages/(?!core|schema|engine|api)',
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

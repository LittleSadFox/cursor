import base from '@climbing-coach/config/eslint';

export default [
  ...base,
  {
    files: ['packages/engine/src/**/*.ts'],
    ignores: ['**/*.test.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          paths: [
            { name: 'fs', message: 'engine must not do I/O' },
            { name: 'node:fs', message: 'engine must not do I/O' },
            { name: 'path', message: 'engine must not do I/O' },
            { name: 'node:path', message: 'engine must not do I/O' },
          ],
        },
      ],
      'no-restricted-syntax': [
        'error',
        {
          selector: "CallExpression[callee.object.name='Date'][callee.property.name='now']",
          message: 'engine must not read clocks',
        },
        {
          selector: "CallExpression[callee.object.name='Math'][callee.property.name='random']",
          message: 'engine must not use Math.random',
        },
        {
          selector: "MemberExpression[object.name='process']",
          message: 'engine must not touch process',
        },
      ],
    },
  },
  {
    ignores: [
      'packages/config/**',
      'packages/**/scripts/**',
      'research/**',
      'datasets/**',
      'dependency-cruiser.cjs',
      'turbo.json',
    ],
  },
];

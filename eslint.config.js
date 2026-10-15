import base from '@climbing-coach/config/eslint';

export default [
  ...base,
  {
    ignores: [
      'packages/config/**',
      'research/**',
      'datasets/**',
      'dependency-cruiser.cjs',
      'turbo.json',
    ],
  },
];

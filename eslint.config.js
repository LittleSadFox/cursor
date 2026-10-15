import base from '@climbing-coach/config/eslint';

export default [
  ...base,
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

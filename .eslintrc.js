module.exports = {
  extends: ['airbnb-base'],
  env: {
    node: true,
    es2021: true,
    jest: true,
  },
  rules: {
    'no-console': 'warn',
    'no-unused-vars': ['error', { argsIgnorePattern: 'next' }],
    'linebreak-style': ['error', 'unix'],
    'import/no-extraneous-dependencies': [
      'error',
      {
        devDependencies: [
          '**/*.test.js',
          '**/*.spec.js',
        ],
      },
    ],
  },
};
module.exports = {
  root: true,
  parser: '@typescript-eslint/parser',
  parserOptions: {
    project: './tsconfig.json'
  },
  plugins: ['@typescript-eslint', 'tailwindcss'],
  extends: ['next/core-web-vitals', 'plugin:@typescript-eslint/recommended', 'prettier'],
  rules: {
    'tailwindcss/classnames-order': 'warn',
    '@typescript-eslint/consistent-type-imports': 'error'
  },
  ignorePatterns: ['.next', 'node_modules']
};

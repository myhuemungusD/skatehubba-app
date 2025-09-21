export default {
  '*.{js,ts,tsx}': ['eslint --max-warnings=0', 'prettier --write'],
  '*.{json,css,md}': ['prettier --write']
};

// If you want to use other PostCSS plugins, see the following:
// https://tailwindcss.com/docs/using-with-preprocessors
module.exports = {
  plugins: [
    'postcss-import',
    'tailwindcss',
    'tailwindcss/nesting',
    'postcss-nested', // or require('postcss-nesting')
    'autoprefixer',
  ],
};

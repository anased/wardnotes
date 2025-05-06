module.exports = {
  plugins: {
    'postcss-import': {},
    'tailwindcss/nesting': 'postcss-nesting', // Add this line to enable CSS nesting
    tailwindcss: {},
    autoprefixer: {},
  },
}
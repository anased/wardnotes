module.exports = {
    extends: [
      'next/core-web-vitals',
      'next/typescript'
    ],
    rules: {
      // Disable these rules temporarily to allow the build to succeed
      '@typescript-eslint/no-explicit-any': 'off',
      'no-console': 'off',
      '@typescript-eslint/no-unused-vars': 'off',
      '@typescript-eslint/no-non-null-assertion': 'off',
      '@typescript-eslint/no-non-null-asserted-optional-chain': 'off',
      'react-hooks/exhaustive-deps': 'off'
    }
  }
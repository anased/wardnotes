import { dirname } from "path";
import { fileURLToPath } from "url";
import { FlatCompat } from "@eslint/eslintrc";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const compat = new FlatCompat({
  baseDirectory: __dirname,
});

const eslintConfig = [
  ...compat.extends("next/core-web-vitals", "next/typescript"),
  
  // Add custom rules
  {
    rules: {
      // Disable the no-page-custom-font warning as we're using Next.js font system correctly
      "@next/next/no-page-custom-font": "off",
      
      // Enforce typesafety by disallowing 'any' type
      "@typescript-eslint/no-explicit-any": "error",
      
      // Additional rules for better code quality
      "react/no-unescaped-entities": "off",
      "react/react-in-jsx-scope": "off",
      "react/prop-types": "off",
      "@typescript-eslint/no-unused-vars": ["warn", { 
        "argsIgnorePattern": "^_",
        "varsIgnorePattern": "^_" 
      }],
      "@typescript-eslint/explicit-function-return-type": "off",
      "@typescript-eslint/explicit-module-boundary-types": "off",
      "@typescript-eslint/no-non-null-assertion": "error",
      "no-console": ["warn", { "allow": ["warn", "error"] }]
    }
  }
];

export default eslintConfig;
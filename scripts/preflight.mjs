#!/usr/bin/env node

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import chalk from 'chalk';
import dotenv from 'dotenv';

// Setup paths
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.join(__dirname, '..');

// Load environment variables
dotenv.config({ path: path.join(rootDir, '.env.local') });

console.log(chalk.blue('Running preflight checks before deployment...\n'));

// Check for required environment variables
const requiredEnvVars = [
  'NEXT_PUBLIC_SUPABASE_URL',
  'NEXT_PUBLIC_SUPABASE_ANON_KEY',
];

let envMissing = false;
requiredEnvVars.forEach(envVar => {
  if (!process.env[envVar]) {
    console.log(chalk.red(`❌ Missing environment variable: ${envVar}`));
    envMissing = true;
  } else {
    console.log(chalk.green(`✓ Environment variable found: ${envVar}`));
  }
});

if (envMissing) {
  console.log(chalk.yellow('\nPlease add the missing environment variables to your .env.local file.'));
} else {
  console.log(chalk.green('\nAll required environment variables are set!'));
}

// Check for required files
const requiredFiles = [
  'public/favicon.ico',
  'public/favicon.svg',
  'public/og-image.jpg',
  'public/robots.txt',
];

let filesMissing = false;
requiredFiles.forEach(file => {
  const filePath = path.join(rootDir, file);
  if (!fs.existsSync(filePath)) {
    console.log(chalk.red(`❌ Missing file: ${file}`));
    filesMissing = true;
  } else {
    console.log(chalk.green(`✓ File exists: ${file}`));
  }
});

if (filesMissing) {
  console.log(chalk.yellow('\nPlease create the missing files before deployment.'));
} else {
  console.log(chalk.green('\nAll required files are present!'));
}

// Check for build errors
console.log(chalk.blue('\nChecking for TypeScript errors...'));
try {
  const { execSync } = await import('child_process');
  execSync('tsc --noEmit', { stdio: 'inherit', cwd: rootDir });
  console.log(chalk.green('✓ No TypeScript errors found!'));
} catch (error) {
  console.log(chalk.red('❌ TypeScript errors found. Please fix them before deployment.'));
  process.exit(1);
}

// Final status
if (envMissing || filesMissing) {
  console.log(chalk.yellow('\nPreflight check completed with warnings. Please fix the issues before deployment.'));
  process.exit(1);
} else {
  console.log(chalk.green('\nPreflight check completed successfully! Your application is ready for deployment.'));
}
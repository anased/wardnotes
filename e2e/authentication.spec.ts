import { test, expect } from '@playwright/test';

test.describe('Authentication', () => {
  test('should allow user to sign in', async ({ page }) => {
    // Navigate to the auth page
    await page.goto('/auth');
    
    // Fill in the credentials
    await page.fill('input[type="email"]', 'test@example.com');
    await page.fill('input[type="password"]', 'Password123!');
    
    // Click the sign in button
    await page.click('button[type="submit"]');
    
    // Expect to be redirected to the dashboard
    await expect(page).toHaveURL('/dashboard');
    
    // Verify some elements on the dashboard
    await expect(page.locator('h1')).toContainText('Dashboard');
  });
  
  test('should show error for invalid credentials', async ({ page }) => {
    // Navigate to the auth page
    await page.goto('/auth');
    
    // Fill in invalid credentials
    await page.fill('input[type="email"]', 'test@example.com');
    await page.fill('input[type="password"]', 'wrong');
    
    // Click the sign in button
    await page.click('button[type="submit"]');
    
    // Expect error message
    await expect(page.locator('.text-red-700')).toBeVisible();
  });
});
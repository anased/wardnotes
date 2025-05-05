import { test, expect, Page} from '@playwright/test';

// Helper to sign in
async function signIn(page: Page) {
    await page.goto('/auth');
    await page.fill('input[type="email"]', 'test@example.com');
    await page.fill('input[type="password"]', 'Password123!');
    await page.click('button[type="submit"]');
    // Wait for navigation
    await expect(page).toHaveURL('/dashboard');
  }
  
  

test.describe('Note Management', () => {
  test.beforeEach(async ({ page }) => {
    await signIn(page);
  });
  
  test('should create a new note', async ({ page }) => {
    // Navigate to create note page
    await page.click('text=Create New Note');
    
    // Fill in the note details
    await page.fill('input[placeholder="Enter a descriptive title"]', 'Test Note Title');
    
    // Select a category
    await page.selectOption('select', { label: 'Cardiology' });
    
    // Add tags
    const tagInput = page.locator('input[placeholder="Add tags (press Enter or comma to add)"]');
    await tagInput.fill('test');
    await tagInput.press('Enter');
    await tagInput.fill('example');
    await tagInput.press('Enter');
    
    // Fill in the content using the TipTap editor
    await page.locator('.ProseMirror').click();
    await page.keyboard.type('This is test content');
    
    // Save the note
    await page.click('button:has-text("Save Note")');
    
    // Expect to be redirected to note view
    await expect(page.url()).toContain('/notes/');
    
    // Verify the note content
    await expect(page.locator('h1')).toContainText('Test Note Title');
    await expect(page.locator('.ProseMirror')).toContainText('This is test content');
  });
  
  test('should edit an existing note', async ({ page }) => {
    // Navigate to notes page
    await page.click('text=Library');
    
    // Click on the first note
    await page.click('.card >> nth=0');
    
    // Click edit button
    await page.click('button:has-text("Edit")');
    
    // Update the title
    await page.fill('input[placeholder="Enter a descriptive title"]', 'Updated Note Title');
    
    // Save the changes
    await page.click('button:has-text("Update Note")');
    
    // Verify the updated content
    await expect(page.locator('h1')).toContainText('Updated Note Title');
  });
  
  test('should delete a note', async ({ page }) => {
    // Navigate to notes page
    await page.click('text=Library');
    
    // Click on the first note
    await page.click('.card >> nth=0');
    
    // Click delete button
    await page.click('button:has-text("Delete")');
    
    // Confirm deletion
    await page.getByRole('button', { name: 'Delete' }).click();

    
    // Expect to be redirected to notes page
    await expect(page).toHaveURL('/notes');
  });
});
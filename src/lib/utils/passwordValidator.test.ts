import { validatePassword } from './passwordValidator';

describe('passwordValidator', () => {
  test('should validate a strong password', () => {
    const result = validatePassword('StrongP@ssw0rd');
    
    expect(result.isValid).toBe(true);
    expect(result.strength).toBe('strong');
    expect(result.errors.length).toBe(null);
    expect(result.errors.uppercase).toBe(null);
    expect(result.errors.lowercase).toBe(null);
    expect(result.errors.number).toBe(null);
    expect(result.errors.special).toBe(null);
  });
  
  test('should fail for a weak password', () => {
    const result = validatePassword('weak');
    
    expect(result.isValid).toBe(false);
    expect(result.strength).toBe('weak');
    expect(result.errors.length).not.toBe(null);
    expect(result.errors.uppercase).not.toBe(null);
    expect(result.errors.number).not.toBe(null);
    expect(result.errors.special).not.toBe(null);
  });
});
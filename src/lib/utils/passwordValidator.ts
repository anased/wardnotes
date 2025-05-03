// src/lib/utils/passwordValidator.ts
export interface PasswordValidationResult {
    isValid: boolean;
    errors: {
      length: string | null;
      uppercase: string | null;
      lowercase: string | null;
      number: string | null;
      special: string | null;
    };
    strength: 'weak' | 'medium' | 'strong';
  }
  
  export const validatePassword = (password: string): PasswordValidationResult => {
    const hasLength = password.length >= 8;
    const hasUpper = /[A-Z]/.test(password);
    const hasLower = /[a-z]/.test(password);
    const hasNumber = /[0-9]/.test(password);
    const hasSpecial = /[^A-Za-z0-9]/.test(password);
    
    // Calculate strength
    const criteriaCount = [hasLength, hasUpper, hasLower, hasNumber, hasSpecial].filter(Boolean).length;
    let strength: 'weak' | 'medium' | 'strong' = 'weak';
    
    if (criteriaCount >= 4 && hasLength) {
      strength = 'strong';
    } else if (criteriaCount >= 3 && hasLength) {
      strength = 'medium';
    }
    
    return {
      isValid: hasLength && hasUpper && hasLower && hasNumber && hasSpecial,
      errors: {
        length: !hasLength ? 'Password must be at least 8 characters' : null,
        uppercase: !hasUpper ? 'Include at least one uppercase letter (A-Z)' : null,
        lowercase: !hasLower ? 'Include at least one lowercase letter (a-z)' : null,
        number: !hasNumber ? 'Include at least one number (0-9)' : null,
        special: !hasSpecial ? 'Include at least one special character (!@#$%^&*)' : null,
      },
      strength
    };
  };
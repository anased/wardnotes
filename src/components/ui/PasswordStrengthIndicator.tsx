// src/components/ui/PasswordStrengthIndicator.tsx
import { validatePassword } from '@/lib/utils/passwordValidator';

interface PasswordStrengthIndicatorProps {
  password: string;
}

export default function PasswordStrengthIndicator({ password }: PasswordStrengthIndicatorProps) {
  const { isValid, errors, strength } = validatePassword(password);
  
  const getColorClass = () => {
    switch (strength) {
      case 'strong':
        return 'bg-green-500';
      case 'medium':
        return 'bg-yellow-500';
      default:
        return 'bg-red-500';
    }
  };
  
  return (
    <div className="mt-2 space-y-2">
      <div className="flex items-center gap-2">
        <div className="w-full h-2 bg-gray-200 rounded-full dark:bg-gray-700">
          <div 
            className={`h-2 rounded-full ${getColorClass()}`} 
            style={{ 
              width: strength === 'weak' ? '33%' : 
                     strength === 'medium' ? '66%' : '100%' 
            }}
          />
        </div>
        <span className="text-xs font-medium text-gray-500 dark:text-gray-400 w-16">
          {strength.charAt(0).toUpperCase() + strength.slice(1)}
        </span>
      </div>
      
      {/* Display validation errors */}
      {password.length > 0 && (
        <ul className="text-xs space-y-1">
          {Object.values(errors).map((error, index) => 
            error ? (
              <li key={index} className="text-red-500">{error}</li>
            ) : null
          )}
        </ul>
      )}
    </div>
  );
}
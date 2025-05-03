import useCategories from '@/lib/hooks/useCategories';

interface CategoryBadgeProps {
  category: string;
  size?: 'sm' | 'md';
}

export default function CategoryBadge({ 
  category, 
  size = 'md' 
}: CategoryBadgeProps) {
  const { categories } = useCategories();
  
  // Find the category in our list to get its color
  const categoryData = categories.find(
    cat => cat.name.toLowerCase() === category.toLowerCase()
  );
  
  // Default to blue if category not found
  const color = categoryData?.color || 'blue';
  
  // Determine size class
  const sizeClass = size === 'sm' ? 'text-xs px-2 py-0.5' : 'text-sm px-2.5 py-0.5';
  
  // Apply color styles based on the category's color
  let colorClasses = '';
  
  switch (color) {
    case 'blue':
      colorClasses = 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-300';
      break;
    case 'red':
      colorClasses = 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-300';
      break;
    case 'green':
      colorClasses = 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-300';
      break;
    case 'yellow':
      colorClasses = 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-300';
      break;
    case 'purple':
      colorClasses = 'bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-300';
      break;
    case 'pink':
      colorClasses = 'bg-pink-100 text-pink-800 dark:bg-pink-900 dark:text-pink-300';
      break;
    case 'indigo':
      colorClasses = 'bg-indigo-100 text-indigo-800 dark:bg-indigo-900 dark:text-indigo-300';
      break;
    case 'gray':
      colorClasses = 'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-300';
      break;
    default:
      colorClasses = 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-300';
  }
  
  return (
    <span className={`font-medium rounded-full ${sizeClass} ${colorClasses}`}>
      {category}
    </span>
  );
}
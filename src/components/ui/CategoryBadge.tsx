interface CategoryBadgeProps {
    category: string;
    size?: 'sm' | 'md';
  }
  
  export default function CategoryBadge({ 
    category, 
    size = 'md' 
  }: CategoryBadgeProps) {
    // Convert category to lowercase and remove spaces for CSS class
    const categoryClass = category.toLowerCase().replace(/\s+/g, '');
    
    const sizeClass = size === 'sm' ? 'text-xs' : 'text-sm';
    
    return (
      <span className={`category-badge category-badge-${categoryClass} ${sizeClass}`}>
        {category}
      </span>
    );
  }
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import Button from './Button';

describe('Button Component', () => {
  test('renders with children', () => {
    render(<Button>Click me</Button>);
    
    expect(screen.getByText('Click me')).toBeInTheDocument();
  });
  
  test('calls onClick handler when clicked', async () => {
    const onClick = jest.fn();
    render(<Button onClick={onClick}>Click me</Button>);
    
    await userEvent.click(screen.getByText('Click me'));
    expect(onClick).toHaveBeenCalledTimes(1);
  });
  
  test('shows loading spinner when isLoading is true', () => {
    render(<Button isLoading={true}>Click me</Button>);
    
    expect(screen.getByText('Click me')).toBeInTheDocument();
    expect(screen.getByRole('presentation')).toBeInTheDocument(); // The SVG spinner
  });
  
  test('disables button when isLoading or disabled is true', () => {
    const { rerender } = render(<Button isLoading={true}>Click me</Button>);
    
    expect(screen.getByRole('button')).toBeDisabled();
    
    rerender(<Button disabled={true}>Click me</Button>);
    expect(screen.getByRole('button')).toBeDisabled();
  });
  
  test('applies different variant styles', () => {
    const { rerender } = render(<Button variant="primary">Primary</Button>);
    
    let button = screen.getByRole('button');
    expect(button).toHaveClass('bg-primary-600');
    
    rerender(<Button variant="secondary">Secondary</Button>);
    button = screen.getByRole('button');
    expect(button).toHaveClass('bg-secondary-600');
    
    rerender(<Button variant="outline">Outline</Button>);
    button = screen.getByRole('button');
    expect(button).toHaveClass('border');
  });
});
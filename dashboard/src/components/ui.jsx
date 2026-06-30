import { cn } from '../lib/utils.js';

export function Button({ className, variant = 'default', size = 'default', ...props }) {
  return (
    <button
      className={cn(
        'inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50',
        variant === 'default' && 'bg-primary text-primary-foreground hover:bg-primary/90',
        variant === 'secondary' && 'bg-secondary text-secondary-foreground hover:bg-secondary/80',
        variant === 'outline' && 'border border-input bg-background/70 text-foreground hover:bg-accent hover:text-accent-foreground',
        variant === 'ghost' && 'hover:bg-accent hover:text-accent-foreground',
        size === 'default' && 'h-10 px-4 py-2',
        size === 'sm' && 'h-8 rounded-md px-3 text-xs',
        className
      )}
      {...props}
    />
  );
}

export function Badge({ className, variant = 'default', ...props }) {
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold transition-colors',
        variant === 'default' && 'border-transparent bg-primary text-primary-foreground',
        variant === 'secondary' && 'border-border bg-secondary text-secondary-foreground',
        variant === 'outline' && 'border-border bg-background/70 text-foreground',
        variant === 'success' && 'border-emerald-400/60 bg-emerald-950/80 text-emerald-100',
        variant === 'warning' && 'border-amber-400/60 bg-amber-950/80 text-amber-100',
        className
      )}
      {...props}
    />
  );
}

export function Card({ className, ...props }) {
  return <div className={cn('rounded-lg border bg-card text-card-foreground shadow-sm', className)} {...props} />;
}

export function CardHeader({ className, ...props }) {
  return <div className={cn('flex flex-col space-y-1.5 p-5', className)} {...props} />;
}

export function CardTitle({ className, ...props }) {
  return <h3 className={cn('text-base font-semibold leading-none tracking-normal', className)} {...props} />;
}

export function CardDescription({ className, ...props }) {
  return <p className={cn('text-sm text-muted-foreground', className)} {...props} />;
}

export function CardContent({ className, ...props }) {
  return <div className={cn('p-5 pt-0', className)} {...props} />;
}

export function Input({ className, ...props }) {
  return (
    <input
      className={cn(
        'flex h-10 w-full rounded-md border border-input bg-background/75 px-3 py-2 text-sm text-foreground ring-offset-background placeholder:text-slate-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
        className
      )}
      {...props}
    />
  );
}

export function Select({ className, ...props }) {
  return (
    <select
      className={cn(
        'flex h-10 w-full rounded-md border border-input bg-background/75 px-3 py-2 text-sm text-foreground ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
        className
      )}
      {...props}
    />
  );
}

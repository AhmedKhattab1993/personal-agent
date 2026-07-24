function cx(...parts) {
  return parts.filter(Boolean).join(' ') || undefined;
}

export function Button({ className, variant = 'default', size = 'default', ...props }) {
  return (
    <button
      className={cx(
        'ui-button',
        variant === 'outline' && 'ui-button-outline',
        variant === 'ghost' && 'ui-button-ghost',
        size === 'sm' && 'ui-button-sm',
        className
      )}
      {...props}
    />
  );
}

export function Badge({ className, ...props }) {
  return <span className={cx('ui-badge', className)} {...props} />;
}

export function Input({ className, ...props }) {
  return <input className={cx('ui-input', className)} {...props} />;
}

export function Select({ className, ...props }) {
  return <select className={cx('ui-input', className)} {...props} />;
}

export function Dialog({ open, children }) {
  if (!open) return null;
  return (
    <div className="ui-dialog">
      {children}
    </div>
  );
}

export function DialogContent({ className, ...props }) {
  return <div className={cx('ui-dialog-content', className)} {...props} />;
}

export function DialogHeader({ className, ...props }) {
  return <div className={cx('ui-dialog-header', className)} {...props} />;
}

export function DialogTitle({ className, ...props }) {
  return <h2 className={cx('ui-dialog-title', className)} {...props} />;
}

export function DialogBody({ className, ...props }) {
  return <div className={cx('ui-dialog-body', className)} {...props} />;
}

export function DialogFooter({ className, ...props }) {
  return <div className={cx('ui-dialog-footer', className)} {...props} />;
}

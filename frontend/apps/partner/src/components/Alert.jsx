export default function Alert({ type = 'error', children, onClose }) {
  if (!children) return null;
  return (
    <div className={`alert alert-${type}`} role="alert">
      <span>{children}</span>
      {onClose ? (
        <button type="button" className="alert-close" onClick={onClose} aria-label="Dismiss">
          ×
        </button>
      ) : null}
    </div>
  );
}

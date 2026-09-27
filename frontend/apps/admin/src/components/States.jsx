export function Loading({ message = 'Loading…', fullScreen = false }) {
  return (
    <div className={fullScreen ? 'state state-fullscreen' : 'state'}>
      <div className="spinner" />
      <p>{message}</p>
    </div>
  );
}

export function ErrorState({ message, onRetry }) {
  return (
    <div className="state">
      <p className="state-error-text">⚠️ {message || 'Something went wrong.'}</p>
      {onRetry && (
        <button className="btn btn-outline" onClick={onRetry} type="button">
          Try again
        </button>
      )}
    </div>
  );
}

export function EmptyState({ message = 'Nothing here yet.' }) {
  return (
    <div className="state">
      <p className="state-empty">{message}</p>
    </div>
  );
}

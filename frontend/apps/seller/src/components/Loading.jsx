export default function Loading({ full = false }) {
  return (
    <div className={full ? 'center-page' : 'loading-inline'}>
      <div className="spinner" role="status" aria-label="Loading" />
    </div>
  )
}

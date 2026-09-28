import { useEffect, useRef, useState } from 'react';
import Icon from './Icon';

export default function OtpModal({ isOpen, type, onSubmit, onClose }) {
  const [otp, setOtp] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const inputRef = useRef(null);

  useEffect(() => {
    if (isOpen) {
      setOtp('');
      setError('');
      setSubmitting(false);
      setTimeout(() => {
        if (inputRef.current) {
          inputRef.current.focus();
        }
      }, 50);
    }
  }, [isOpen, type]);

  if (!isOpen) return null;

  const isPickup = type === 'picked';
  const title = isPickup ? 'Pickup Verification' : 'Delivery Verification';
  const subtitle = isPickup
    ? 'Enter the 4-digit pickup code from the shop'
    : 'Enter the 4-digit delivery code from the customer';

  const handleChange = (e) => {
    const val = e.target.value.replace(/\D/g, '').slice(0, 4);
    setOtp(val);
    if (error) setError('');
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (otp.length !== 4) {
      setError('Please enter a 4-digit code.');
      return;
    }
    setSubmitting(true);
    setError('');
    try {
      await onSubmit(otp);
      onClose();
    } catch (err) {
      setError(
        err?.response?.data?.error ||
        err?.friendlyMessage ||
        'Verification failed. Please check the code and try again.'
      );
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="modal-backdrop" onClick={onClose} role="dialog" aria-modal="true" aria-labelledby="otp-title">
      <div className="modal-card" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <div className="modal-icon-badge">
            <Icon name={isPickup ? 'box' : 'check'} size={22} />
          </div>
          <button
            type="button"
            className="modal-close-btn"
            onClick={onClose}
            disabled={submitting}
            aria-label="Close"
          >
            <Icon name="close" size={18} />
          </button>
        </div>

        <h3 id="otp-title" className="modal-title">{title}</h3>
        <p className="modal-copy muted">{subtitle}</p>

        {error ? (
          <div className="alert alert-error otp-error-alert" role="alert">
            <span>{error}</span>
          </div>
        ) : null}

        <form onSubmit={handleSubmit} className="otp-form">
          <div className="otp-input-wrap">
            <input
              ref={inputRef}
              type="text"
              inputMode="numeric"
              pattern="[0-9]*"
              maxLength={4}
              value={otp}
              onChange={handleChange}
              placeholder="••••"
              className="otp-input"
              disabled={submitting}
              autoComplete="one-time-code"
            />
          </div>

          <div className="modal-actions">
            <button
              type="button"
              className="btn btn-ghost"
              onClick={onClose}
              disabled={submitting}
            >
              Cancel
            </button>
            <button
              type="submit"
              className="btn btn-primary"
              disabled={submitting || otp.length !== 4}
            >
              {submitting ? 'Verifying…' : isPickup ? 'Confirm pickup' : 'Confirm delivery'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

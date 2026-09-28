import { useState } from 'react';
import Icon from './Icon';

const SCREENS = [
  {
    step: 1,
    icon: 'lock',
    title: 'Verify pickup with 4-digit code',
    text: 'Verify items with the 4-digit pickup code at the shop — never pick up without it.',
    note: null,
  },
  {
    step: 2,
    icon: 'check',
    title: 'Confirm handoff at drop-off',
    text: 'Never mark an order delivered before the customer receives it.',
    note: null,
  },
  {
    step: 3,
    icon: 'map',
    title: 'Double-check drop details',
    text: 'Check the items and the drop address before leaving the shop.',
    note: null,
  },
  {
    step: 4,
    icon: 'help',
    title: 'Failed pickup procedure',
    text: 'If a pickup fails, take a photo note and contact support.',
    note: 'Support: in-app help (coming soon)',
  },
  {
    step: 5,
    icon: 'scooter',
    title: 'Stay online when ready',
    text: 'Stay online only when ready to deliver; going offline pauses new requests.',
    note: null,
  },
];

export default function TrainingPrimer({ isOpen, onComplete, onClose }) {
  const [currentStep, setCurrentStep] = useState(0);
  const [submitting, setSubmitting] = useState(false);

  if (!isOpen) return null;

  const current = SCREENS[currentStep];
  const total = SCREENS.length;
  const isLast = currentStep === total - 1;

  const handleNext = async () => {
    if (!isLast) {
      setCurrentStep((prev) => prev + 1);
    } else {
      setSubmitting(true);
      try {
        await onComplete();
      } finally {
        setSubmitting(false);
      }
    }
  };

  const handlePrev = () => {
    if (currentStep > 0) {
      setCurrentStep((prev) => prev - 1);
    }
  };

  return (
    <div className="modal-backdrop" role="dialog" aria-modal="true" aria-labelledby="primer-title">
      <div className="modal-card primer-card" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <span className="primer-step-indicator">
            Step {current.step} of {total}
          </span>
          {onClose ? (
            <button
              type="button"
              className="modal-close-btn"
              onClick={onClose}
              disabled={submitting}
              aria-label="Close"
            >
              <Icon name="close" size={18} />
            </button>
          ) : null}
        </div>

        <div className="primer-content">
          <div className="primer-icon-wrap">
            <Icon name={current.icon} size={36} />
          </div>
          <h3 id="primer-title" className="primer-title">{current.title}</h3>
          <p className="primer-text">{current.text}</p>
          {current.note ? (
            <p className="primer-note muted tiny">{current.note}</p>
          ) : null}
        </div>

        <div className="primer-progress-dots">
          {SCREENS.map((_, idx) => (
            <span
              key={idx}
              className={`primer-dot ${idx === currentStep ? 'active' : idx < currentStep ? 'completed' : ''}`}
            />
          ))}
        </div>

        <div className="modal-actions primer-actions">
          {currentStep > 0 ? (
            <button
              type="button"
              className="btn btn-ghost"
              onClick={handlePrev}
              disabled={submitting}
            >
              Previous
            </button>
          ) : (
            <button
              type="button"
              className="btn btn-ghost"
              onClick={onClose}
              disabled={submitting}
            >
              Cancel
            </button>
          )}

          <button
            type="button"
            className="btn btn-primary"
            onClick={handleNext}
            disabled={submitting}
          >
            {isLast
              ? submitting
                ? 'Completing…'
                : 'Start delivering'
              : 'Next'}
          </button>
        </div>
      </div>
    </div>
  );
}

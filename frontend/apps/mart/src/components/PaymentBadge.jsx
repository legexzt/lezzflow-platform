import { useEffect, useState } from 'react';
import api from '../api';

export default function PaymentBadge() {
  const [message, setMessage] = useState('Payment coming soon');

  useEffect(() => {
    let mounted = true;
    api
      .get('/api/payment')
      .then((res) => {
        if (!mounted) return;
        const msg =
          res.data?.message ||
          (res.data?.status === 'coming_soon' ? 'Payment coming soon' : null);
        if (msg) setMessage(msg);
      })
      .catch(() => {
        // Keep the default badge text if the endpoint is unreachable.
      });
    return () => {
      mounted = false;
    };
  }, []);

  return <span className="payment-badge">💳 {message}</span>;
}

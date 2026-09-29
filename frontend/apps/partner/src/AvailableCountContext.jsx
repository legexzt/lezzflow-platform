import { createContext, useContext, useState } from 'react';

// Shares the available-request count between the Dashboard (which computes it)
// and the BottomNav (which badges it).
const AvailableCountContext = createContext({ count: 0, setCount: () => {} });

export function AvailableCountProvider({ children }) {
  const [count, setCount] = useState(0);
  return (
    <AvailableCountContext.Provider value={{ count, setCount }}>
      {children}
    </AvailableCountContext.Provider>
  );
}

export function useAvailableCount() {
  return useContext(AvailableCountContext);
}

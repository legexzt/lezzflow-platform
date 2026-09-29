// Shared SVG icon set — Blinkit-style clean icons, no emojis
const paths = {
  camera: <><path d="M4 8h3l2-3h6l2 3h3v11H4V8z" /><circle cx="12" cy="13" r="3.5" /></>,
  check: <path d="M5 13l4 4L19 7" />,
  location: <><path d="M12 21s-7-5.5-7-11a7 7 0 0 1 14 0c0 5.5-7 11-7 11z" /><circle cx="12" cy="10" r="2.5" /></>,
  box: <><path d="M12 3l8 4.5v9L12 21l-8-4.5v-9L12 3z" /><path d="M4 7.5l8 4.5 8-4.5" /><path d="M12 12v9" /></>,
  bag: <><path d="M6 8h12l1 12H5L6 8z" /><path d="M9 8V6a3 3 0 0 1 6 0v2" /></>,
  scan: <><path d="M4 8V5a1 1 0 0 1 1-1h3" /><path d="M16 4h3a1 1 0 0 1 1 1v3" /><path d="M20 16v3a1 1 0 0 1-1 1h-3" /><path d="M8 20H5a1 1 0 0 1-1-1v-3" /><path d="M4 12h16" /></>,
  edit: <><path d="M4 20l1-4L16.5 4.5a2.1 2.1 0 0 1 3 3L8 19l-4 1z" /></>,
  receipt: <><path d="M6 3h12v18l-2-1.5L14 21l-2-1.5L10 21l-2-1.5L6 21V3z" /><path d="M9 8h6M9 12h6" /></>,
  scooter: <><circle cx="6" cy="17" r="2.5" /><circle cx="18" cy="17" r="2.5" /><path d="M6 17h6l3-7h3" /><path d="M12 6h4" /></>,
  runner: <><circle cx="14" cy="5" r="1.8" /><path d="M12 8l-3 5 3 2v6" /><path d="M9 13l-3 2" /><path d="M12 10l4 2 3 1" /></>,
  card: <><rect x="3" y="6" width="18" height="13" rx="2" /><path d="M3 10h18" /></>,
  close: <path d="M6 6l12 12M18 6L6 18" />,
  warning: <><path d="M12 3L2 20h20L12 3z" /><path d="M12 10v4" /><circle cx="12" cy="17" r="0.5" /></>,
  money: <><rect x="3" y="7" width="18" height="11" rx="2" /><circle cx="12" cy="12.5" r="2.5" /></>,
  map: <><path d="M9 4L3 6v14l6-2 6 2 6-2V4l-6 2-6-2z" /><path d="M9 4v14" /><path d="M15 6v14" /></>,
  settings: <><circle cx="12" cy="12" r="3" /><path d="M19 12a7 7 0 0 0-.1-1.2l2-1.6-2-3.4-2.4 1a7 7 0 0 0-2-1.2L14 3h-4l-.5 2.6a7 7 0 0 0-2 1.2l-2.4-1-2 3.4 2 1.6A7 7 0 0 0 5 12c0 .4 0 .8.1 1.2l-2 1.6 2 3.4 2.4-1a7 7 0 0 0 2 1.2L10 21h4l.5-2.6a7 7 0 0 0 2-1.2l2.4 1 2-3.4-2-1.6c.07-.4.1-.8.1-1.2z" /></>,
  help: <><circle cx="12" cy="12" r="9" /><path d="M9.5 9a2.5 2.5 0 0 1 4.9.7c0 1.6-2.4 2-2.4 3.3" /><circle cx="12" cy="17" r="0.5" /></>,
  chart: <><path d="M4 20V10" /><path d="M10 20V4" /><path d="M16 20v-8" /><path d="M22 20H2" /></>,
  home: <><path d="M4 11l8-7 8 7" /><path d="M6 9.5V20h12V9.5" /><path d="M10 20v-5h4v5" /></>,
  cart: <><circle cx="9" cy="20" r="1.5" /><circle cx="17" cy="20" r="1.5" /><path d="M3 4h2l2.5 11h10L20 8H7" /></>,
  users: <><circle cx="9" cy="8" r="3.5" /><path d="M3 20c0-3.3 2.7-6 6-6s6 2.7 6 6" /><path d="M16 4.5a3.5 3.5 0 0 1 0 7" /><path d="M18 14.5c2 .8 3 2.6 3 5.5" /></>,
  idcard: <><rect x="3" y="5" width="18" height="14" rx="2" /><circle cx="9" cy="11" r="2" /><path d="M6 16c.5-1.5 1.7-2.5 3-2.5s2.5 1 3 2.5" /><path d="M14 9h4M14 13h4" /></>,
  lock: <><rect x="5" y="11" width="14" height="9" rx="2" /><path d="M8 11V8a4 4 0 0 1 8 0v3" /></>,
  car: <><path d="M5 16l1.5-5A2 2 0 0 1 8.4 9.5h7.2a2 2 0 0 1 1.9 1.5L19 16" /><path d="M4 16h16v4H4z" /><circle cx="8" cy="18.5" r="1.5" /><circle cx="16" cy="18.5" r="1.5" /></>,
  // Cycle-2 additions: SOS, masked calling, referrals — SVG only, no emojis
  phone: <><path d="M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.1 4.2 2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.13.96.36 1.9.7 2.8a2 2 0 0 1-.45 2.1L8.1 9.9a16 16 0 0 0 6 6l1.3-1.3a2 2 0 0 1 2.1-.45c.9.34 1.84.57 2.8.7A2 2 0 0 1 22 16.9z" /></>,
  sos: <><circle cx="12" cy="12" r="9" /><path d="M12 8v5" /><circle cx="12" cy="16.5" r="0.6" /></>,
  share: <><circle cx="18" cy="5" r="3" /><circle cx="6" cy="12" r="3" /><circle cx="18" cy="19" r="3" /><path d="M8.6 10.6l6.8-4.2" /><path d="M8.6 13.4l6.8 4.2" /></>,
  userPlus: <><circle cx="9" cy="8" r="3.5" /><path d="M3 20c0-3.3 2.7-6 6-6s6 2.7 6 6" /><path d="M19 8v6M16 11h6" /></>,
  copy: <><rect x="9" y="9" width="12" height="12" rx="2" /><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" /></>,
  // Cycle-3: offline + sync indicators
  wifiOff: <><path d="M5 12a10 10 0 0 1 3-2.2M12 12a5 5 0 0 1 2.5-.7M8.5 15.5a5 5 0 0 1 5-1.4" /><path d="M12 19h.01" /><path d="M3 3l18 18" /></>,
  sync: <><path d="M21 12a9 9 0 1 1-2.6-6.4" /><path d="M21 3v6h-6" /></>,
  bell: <><path d="M18 8a6 6 0 0 0-12 0c0 6-3 8-3 8h18s-3-2-3-8" /><path d="M13.73 21a2 2 0 0 1-3.46 0" /></>,
}

export default function Icon({ name, size = 20, className = '' }) {
  return (
    <svg
      viewBox="0 0 24 24"
      width={size}
      height={size}
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={`icon ${className}`}
      aria-hidden="true"
    >
      {paths[name] || null}
    </svg>
  )
}

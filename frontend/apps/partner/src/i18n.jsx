import { createContext, useCallback, useContext, useEffect, useState } from 'react';

// Hindi-first: default from device locale, one-tap toggle, persisted.
const STRINGS = {
  en: {
    signOut: 'Sign out',
    dutyOnline: "You're online — new requests will reach you",
    dutyOnlineSub: 'Stay online to receive delivery requests nearby.',
    dutyOffline: "You're offline",
    dutyOfflineSub: 'Go online to receive and accept delivery requests.',
    goOnline: 'Go online',
    goOffline: 'Go offline',
    updating: 'Updating…',
    tabDeliveries: 'Deliveries',
    tabEarnings: 'Earnings',
    tabRefer: 'Refer',
    completed: 'Completed',
    active: 'Active',
    available: 'Available',
    activeDelivery: 'Active delivery',
    availableRequests: 'Available requests',
    refresh: 'Refresh',
    refreshing: 'Refreshing…',
    noRequests: 'No delivery requests right now.',
    noRequestsSub: 'New requests from nearby shops will appear here automatically.',
    offlineEmpty: "You're offline — go online to receive requests.",
    offlineEmptySub: 'Switch your duty toggle above to start receiving order dispatches.',
    accept: 'Accept',
    accepting: 'Accepting…',
    acceptBatch: 'Accept batch',
    payoutTbd: 'Payout: to be confirmed',
    orders: 'orders',
    pickup: 'pickup',
    drops: 'drops',
    totalFee: 'total fee',
    markPicked: 'Mark picked up',
    markDelivered: 'Mark delivered',
    deliveryAccepted: 'Delivery accepted. Head to the pickup point.',
    pickedNotice: 'Order picked up. Head to the customer.',
    deliveredNotice: 'Delivered. Great job!',
    acceptFailed: 'Could not accept this delivery. It may have been taken by another partner.',
    batchPartial: 'batch accepted, failed',
    shopPacking: 'Shop is packing',
    readyPickup: 'Ready for pickup',
    drop: 'Drop',
    earningsTitle: 'Delivery Earnings & Ledger',
    today: 'Today',
    thisWeek: 'This Week',
    allTime: 'All-Time',
    delivered: 'delivered',
    payoutStructure: 'Payout structure',
    payoutStructureBody:
      'Per-delivery payout structure is being finalized by the platform. Your earnings will appear here automatically once payouts begin.',
    feeHowItWorks: 'How your fee works',
    feeBase: 'base',
    feePerKm: '/km',
    feeUnset: 'The fee formula is being finalized. Your per-delivery payout will show here once set.',
    weeklyPayout: 'Weekly payout',
    weeklyPayoutBody: 'Payouts are processed weekly. Instant withdrawal is not available in beta.',
    deliveredOrders: 'Delivered Orders',
    noDelivered: 'No delivered orders yet.',
    noDeliveredSub: 'Completed orders will appear in your ledger here.',
    sosTitle: 'Need help?',
    sosCallSupport: 'Call support team',
    sosCallCustomer: 'Call customer (masked)',
    sosSendAlert: 'Send SOS alert',
    sosNotePh: 'What happened? (optional)',
    sosSent: 'SOS alert sent. The team has your location and trip details.',
    sosFailed: 'Could not send SOS. Please try again.',
    supportNotSet: 'Support number not configured yet.',
    maskedSoon: 'Masked calling is coming soon — send an SOS and the team will help.',
    cancel: 'Cancel',
    send: 'Send',
    referTitle: 'Invite a partner',
    referCode: 'Your invite code',
    copy: 'Copy',
    copied: 'Copied!',
    share: 'Share',
    referTerms: 'bonus for you and your friend after their first completed trip — credited with the weekly payout after verification.',
    referComingSoon: 'Referral rewards are coming soon.',
    referHaveCode: 'Have a code? Enter it',
    referClaim: 'Claim',
    referClaimed: 'Referral claimed. Bonus unlocks after your first completed trip.',
    referClaimFailed: 'Could not claim this code.',
    referList: 'Partners you invited',
    referEmpty: 'No invites yet. Share your code to start.',
    statusPending: 'pending',
    statusQualified: 'qualified',
    statusPaid: 'paid',
    bonus: 'bonus',
    couldNotLoad: 'Could not load delivery requests.',
  },
  hi: {
    signOut: 'साइन आउट',
    dutyOnline: 'आप ऑनलाइन हैं — नए रिक्वेस्ट आपको मिलेंगे',
    dutyOnlineSub: 'आस-पास के डिलीवरी रिक्वेस्ट पाने के लिए ऑनलाइन रहें।',
    dutyOffline: 'आप ऑफलाइन हैं',
    dutyOfflineSub: 'डिलीवरी रिक्वेस्ट पाने के लिए ऑनलाइन जाएं।',
    goOnline: 'ऑनलाइन जाएं',
    goOffline: 'ऑफलाइन जाएं',
    updating: 'अपडेट हो रहा…',
    tabDeliveries: 'डिलीवरी',
    tabEarnings: 'कमाई',
    tabRefer: 'रेफर करें',
    completed: 'पूरी हुई',
    active: 'चालू',
    available: 'उपलब्ध',
    activeDelivery: 'चालू डिलीवरी',
    availableRequests: 'उपलब्ध रिक्वेस्ट',
    refresh: 'रिफ्रेश',
    refreshing: 'रिफ्रेश हो रहा…',
    noRequests: 'अभी कोई डिलीवरी रिक्वेस्ट नहीं है।',
    noRequestsSub: 'आस-पास की दुकानों से नए रिक्वेस्ट यहां अपने आप दिखेंगे।',
    offlineEmpty: 'आप ऑफलाइन हैं — रिक्वेस्ट पाने के लिए ऑनलाइन जाएं।',
    offlineEmptySub: 'ऑर्डर पाने के लिए ऊपर दिया टॉगल ऑन करें।',
    accept: 'स्वीकार करें',
    accepting: 'स्वीकार हो रहा…',
    acceptBatch: 'बैच स्वीकार करें',
    payoutTbd: 'पेआउट: कन्फर्म होना बाकी',
    orders: 'ऑर्डर',
    pickup: 'पिकअप',
    drops: 'ड्रॉप',
    totalFee: 'कुल फी',
    markPicked: 'पिकअप हो गया',
    markDelivered: 'डिलीवर हो गया',
    deliveryAccepted: 'डिलीवरी स्वीकार हो गई। पिकअप पॉइंट पर जाएं।',
    pickedNotice: 'ऑर्डर पिकअप हो गया। ग्राहक की ओर जाएं।',
    deliveredNotice: 'डिलीवर हो गया। बहुत बढ़िया!',
    acceptFailed: 'यह डिलीवरी स्वीकार नहीं हो सकी। शायद कोई और पार्टनर ले गया।',
    batchPartial: 'बैच स्वीकार हुआ, असफल',
    shopPacking: 'दुकान पैक कर रही है',
    readyPickup: 'पिकअप के लिए तैयार',
    drop: 'ड्रॉप',
    earningsTitle: 'डिलीवरी कमाई और हिसाब',
    today: 'आज',
    thisWeek: 'इस हफ्ते',
    allTime: 'कुल',
    delivered: 'डिलीवर हुए',
    payoutStructure: 'पेआउट स्ट्रक्चर',
    payoutStructureBody:
      'प्लेटफॉर्म प्रति-डिलीवरी पेआउट स्ट्रक्चर तय कर रहा है। पेआउट शुरू होते ही आपकी कमाई यहां अपने आप दिखेगी।',
    feeHowItWorks: 'आपकी फी कैसे बनती है',
    feeBase: 'बेस',
    feePerKm: '/किमी',
    feeUnset: 'फी फॉर्मूला तय हो रहा है। तय होते ही प्रति-डिलीवरी पेआउट यहां दिखेगा।',
    weeklyPayout: 'साप्ताहिक पेआउट',
    weeklyPayoutBody: 'पेआउट हर हफ्ते प्रोसेस होता है। बीटा में तुरंत निकासी उपलब्ध नहीं है।',
    deliveredOrders: 'डिलीवर किए ऑर्डर',
    noDelivered: 'अभी कोई डिलीवर ऑर्डर नहीं है।',
    noDeliveredSub: 'पूरे हुए ऑर्डर आपके हिसाब में यहां दिखेंगे।',
    sosTitle: 'मदद चाहिए?',
    sosCallSupport: 'सपोर्ट टीम को कॉल करें',
    sosCallCustomer: 'ग्राहक को कॉल (मास्क्ड)',
    sosSendAlert: 'SOS अलर्ट भेजें',
    sosNotePh: 'क्या हुआ? (वैकल्पिक)',
    sosSent: 'SOS अलर्ट भेज दिया गया। टीम के पास आपकी लोकेशन और ट्रिप डिटेल है।',
    sosFailed: 'SOS नहीं भेजा जा सका। दोबारा कोशिश करें।',
    supportNotSet: 'सपोर्ट नंबर अभी सेट नहीं हुआ है।',
    maskedSoon: 'मास्क्ड कॉलिंग जल्द आ रही है — SOS भेजें, टीम मदद करेगी।',
    cancel: 'रद्द करें',
    send: 'भेजें',
    referTitle: 'पार्टनर को बुलाएं',
    referCode: 'आपका इन्वाइट कोड',
    copy: 'कॉपी',
    copied: 'कॉपी हो गया!',
    share: 'शेयर',
    referTerms: 'का बोनस आपको और आपके दोस्त को — उसकी पहली पूरी ट्रिप के बाद, वेरिफिकेशन के बाद साप्ताहिक पेआउट के साथ।',
    referComingSoon: 'रेफरल रिवॉर्ड जल्द आ रहे हैं।',
    referHaveCode: 'कोड है? यहां डालें',
    referClaim: 'क्लेम करें',
    referClaimed: 'रेफरल क्लेम हो गया। पहली पूरी ट्रिप के बाद बोनस मिलेगा।',
    referClaimFailed: 'यह कोड क्लेम नहीं हो सका।',
    referList: 'आपके बुलाए पार्टनर',
    referEmpty: 'अभी कोई इन्वाइट नहीं। शुरू करने के लिए कोड शेयर करें।',
    statusPending: 'पेंडिंग',
    statusQualified: 'क्वालिफाइड',
    statusPaid: 'पेड',
    bonus: 'बोनस',
    couldNotLoad: 'डिलीवरी रिक्वेस्ट लोड नहीं हो सके।',
  },
};

const LangContext = createContext({ lang: 'en', setLang: () => {}, t: (k) => k });

export function LangProvider({ children }) {
  const [lang, setLangState] = useState(() => {
    try {
      const saved = localStorage.getItem('lf_partner_lang');
      if (saved === 'hi' || saved === 'en') return saved;
      return navigator.language && navigator.language.toLowerCase().startsWith('hi')
        ? 'hi'
        : 'en';
    } catch {
      return 'en';
    }
  });

  const setLang = useCallback((l) => {
    setLangState(l);
    try {
      localStorage.setItem('lf_partner_lang', l);
    } catch {
      // ignore
    }
  }, []);

  const t = useCallback(
    (key) => STRINGS[lang][key] ?? STRINGS.en[key] ?? key,
    [lang],
  );

  useEffect(() => {
    document.documentElement.lang = lang === 'hi' ? 'hi' : 'en';
  }, [lang]);

  return (
    <LangContext.Provider value={{ lang, setLang, t }}>
      {children}
    </LangContext.Provider>
  );
}

export function useLang() {
  return useContext(LangContext);
}

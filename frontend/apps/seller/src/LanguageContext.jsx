import { createContext, useCallback, useContext, useEffect, useState } from 'react'

const LANG_KEY = 'lf_seller_lang'

const STRINGS = {
  en: {
    nav_home: 'Home', nav_orders: 'Orders', nav_products: 'Products',
    nav_offers: 'Offers', nav_money: 'Money', nav_more: 'More',
    title_dashboard: 'Dashboard', title_orders: 'Orders', title_products: 'Products',
    title_offers: 'Dukaan Offers', title_money: 'Money', title_more: 'More',
    title_shop: 'Manage shop', title_new_shop: 'Create your shop',
    save: 'Save', cancel: 'Cancel', saving: 'Saving…', edit: 'Edit', add: 'Add',
    close: 'Close', delete: 'Delete', update: 'Update', create: 'Create',
    language: 'Language', lang_en: 'English', lang_hi: 'हिन्दी', lang_hing: 'Hinglish',
    offers_sub: 'Discounts customers see on your shop in the Mart app.',
    new_offer: 'New offer', offer_title: 'Offer title', offer_title_ph: 'e.g. Diwali Dhamaka — ₹50 off',
    offer_desc: 'Description (optional)', discount_type: 'Discount type',
    type_flat: 'Flat (₹)', type_percent: 'Percent (%)',
    discount_value: 'Discount value', min_order: 'Minimum order (₹)',
    valid_from: 'Valid from', valid_to: 'Valid to', active: 'Active',
    no_offers: 'No offers yet. Create your first offer to attract customers.',
    offer_created: 'Offer created', offer_updated: 'Offer updated',
    offer_off: 'OFF', offer_min: 'min',
    timings_title: 'Shop timings', timings_hint: 'Customers see these hours on your shop.',
    day_0: 'Sunday', day_1: 'Monday', day_2: 'Tuesday', day_3: 'Wednesday',
    day_4: 'Thursday', day_5: 'Friday', day_6: 'Saturday',
    closed: 'Closed', open: 'Open', timings_saved: 'Timings saved',
    cost_price: 'Cost price (optional)', cost_price_hint: 'What you paid for it — used only to show your margin.',
    margin: 'margin', print_slip: 'Print slip', packing_slip: 'Packing slip',
    shop_open: 'Shop is open',
  },
  hi: {
    nav_home: 'होम', nav_orders: 'ऑर्डर', nav_products: 'उत्पाद',
    nav_offers: 'ऑफर', nav_money: 'पैसे', nav_more: 'और',
    title_dashboard: 'डैशबोर्ड', title_orders: 'ऑर्डर', title_products: 'उत्पाद',
    title_offers: 'दुकान ऑफर', title_money: 'पैसे', title_more: 'और',
    title_shop: 'दुकान प्रबंधित करें', title_new_shop: 'अपनी दुकान बनाएं',
    save: 'सहेजें', cancel: 'रद्द करें', saving: 'सहेज रहे हैं…', edit: 'बदलें', add: 'जोड़ें',
    close: 'बंद करें', delete: 'हटाएं', update: 'अपडेट करें', create: 'बनाएं',
    language: 'भाषा', lang_en: 'English', lang_hi: 'हिन्दी', lang_hing: 'Hinglish',
    offers_sub: 'छूट जो ग्राहक मार्ट ऐप में आपकी दुकान पर देखेंगे।',
    new_offer: 'नया ऑफर', offer_title: 'ऑफर का नाम', offer_title_ph: 'जैसे दिवाली धमाका — ₹50 छूट',
    offer_desc: 'विवरण (वैकल्पिक)', discount_type: 'छूट का प्रकार',
    type_flat: 'फिक्स्ड (₹)', type_percent: 'प्रतिशत (%)',
    discount_value: 'छूट की राशि', min_order: 'न्यूनतम ऑर्डर (₹)',
    valid_from: 'कब से', valid_to: 'कब तक', active: 'चालू',
    no_offers: 'अभी कोई ऑफर नहीं। ग्राहकों को लाने के लिए पहला ऑफर बनाएं।',
    offer_created: 'ऑफर बन गया', offer_updated: 'ऑफर अपडेट हो गया',
    offer_off: 'छूट', offer_min: 'न्यूनतम',
    timings_title: 'दुकान का समय', timings_hint: 'ग्राहक आपकी दुकान पर यही समय देखेंगे।',
    day_0: 'रविवार', day_1: 'सोमवार', day_2: 'मंगलवार', day_3: 'बुधवार',
    day_4: 'गुरुवार', day_5: 'शुक्रवार', day_6: 'शनिवार',
    closed: 'बंद', open: 'खुला', timings_saved: 'समय सहेज लिया',
    cost_price: 'लागत मूल्य (वैकल्पिक)', cost_price_hint: 'आपने कितने में खरीदा — सिर्फ आपका मार्जिन दिखाने के लिए।',
    margin: 'मार्जिन', print_slip: 'पर्ची प्रिंट करें', packing_slip: 'पैकिंग पर्ची',
    shop_open: 'दुकान खुली है',
  },
  hing: {
    nav_home: 'Home', nav_orders: 'Orders', nav_products: 'Products',
    nav_offers: 'Offers', nav_money: 'Paise', nav_more: 'Aur',
    title_dashboard: 'Dashboard', title_orders: 'Orders', title_products: 'Products',
    title_offers: 'Dukaan Offers', title_money: 'Paise', title_more: 'Aur',
    title_shop: 'Dukaan manage karo', title_new_shop: 'Apni dukaan banao',
    save: 'Save karo', cancel: 'Cancel', saving: 'Save ho raha…', edit: 'Edit', add: 'Add karo',
    close: 'Band karo', delete: 'Hatao', update: 'Update karo', create: 'Banao',
    language: 'Bhasha', lang_en: 'English', lang_hi: 'हिन्दी', lang_hing: 'Hinglish',
    offers_sub: 'Discounts jo customer Mart app me aapki dukaan pe dekhenge.',
    new_offer: 'Naya offer', offer_title: 'Offer ka naam', offer_title_ph: 'jaise Diwali Dhamaka — ₹50 off',
    offer_desc: 'Details (optional)', discount_type: 'Discount ka type',
    type_flat: 'Flat (₹)', type_percent: 'Percent (%)',
    discount_value: 'Discount kitna', min_order: 'Minimum order (₹)',
    valid_from: 'Kab se', valid_to: 'Kab tak', active: 'Chalu',
    no_offers: 'Abhi koi offer nahi. Customer lane ke liye pehla offer banao.',
    offer_created: 'Offer ban gaya', offer_updated: 'Offer update ho gaya',
    offer_off: 'off', offer_min: 'min',
    timings_title: 'Dukaan ka time', timings_hint: 'Customer aapki dukaan pe yehi time dekhenge.',
    day_0: 'Ravivaar', day_1: 'Somvaar', day_2: 'Mangalvaar', day_3: 'Budhvaar',
    day_4: 'Guruvaar', day_5: 'Shukravaar', day_6: 'Shanivaar',
    closed: 'Band', open: 'Khula', timings_saved: 'Time save ho gaya',
    cost_price: 'Cost price (optional)', cost_price_hint: 'Aapne kitne me kharida — sirf aapka margin dikhane ke liye.',
    margin: 'margin', print_slip: 'Parchi print karo', packing_slip: 'Packing parchi',
    shop_open: 'Dukaan khuli hai',
  },
}

const LangContext = createContext(null)

export function LanguageProvider({ children }) {
  const [lang, setLang] = useState(() => {
    try {
      const saved = localStorage.getItem(LANG_KEY)
      return saved && STRINGS[saved] ? saved : 'en'
    } catch {
      return 'en'
    }
  })

  useEffect(() => {
    try {
      localStorage.setItem(LANG_KEY, lang)
    } catch {
      // storage unavailable — language just won't persist
    }
  }, [lang])

  const t = useCallback((key) => STRINGS[lang]?.[key] ?? STRINGS.en[key] ?? key, [lang])

  return <LangContext.Provider value={{ lang, setLang, t }}>{children}</LangContext.Provider>
}

export function useLang() {
  const ctx = useContext(LangContext)
  if (!ctx) throw new Error('useLang must be used inside LanguageProvider')
  return ctx
}

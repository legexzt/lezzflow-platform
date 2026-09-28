# Expansion Playbook — Density First

> **Rule #1: NO city-wide launch. Ek locality jeeto, phir agli socho.**
> LezzFlow ki taakat density hai — paas-paas dukanein = tez delivery = khush customer. Bikhri hui 100 dukanein < ek locality ki 5 zinda dukanein.

---

## 1. Shuruaat — Pehla Cluster

- **Ek locality** chuno (2–3 km radius — ek delivery partner cycle/bike se cover kar sake).
- **3–5 kirana shops** se shuru karo. Criteria:
  - Owner khud smartphone chalata ho (ya ghar me koi chalata ho jo dukaan par hota hai),
  - Roz khulne wali, bharosemand dukaan (2+ saal purani ko preference),
  - Fast-moving samaan rakhti ho (aata, tel, masale — daily-need items).
- Har shop ka go-live `saathi-training-script.md` se, quality check `saathi-ops-checklist.md` se.

## 2. Agla Cluster TABHI — Expansion Criteria

Naya cluster **sirf tab** kholo jab current cluster **lagatar 2 hafte tak ~25–40 orders/day sustain** kare.

- "Lagatar" = 14 din me se kam se kam 12 din threshold ke andar. 2–3 dhamakedaar din ginati me nahi aayenge.
- Orders = **real customer orders** (test/mock orders excluded).
- Iske saath ye bhi check karo:
  - Kam se kam 3 shops roz orders le rahi hon (ek shop par saara load nahi),
  - Repeat customers dikh rahe hon (koi doosri-teen baar order kar raha hai),
  - Delivery partner bina delay ke pickup kar paa raha ho.

## 3. Kab RUKNA Hai — Hold Criteria

- 2 hafte me orders/day **10 se neeche** atka ho → naya cluster mat kholo. Pehle samjho: product range kam? Timing galat? Owner active nahi?
- **Red flags (rukne ke signal):**
  - 🔴 Shops "active" to hain par owner khud app nahi chalata — Saathi ke jaate hi dormant.
  - 🔴 Ek hi shop par 80%+ orders — baki shops showpiece hain.
  - 🔴 Customers order karke cancel kar rahe hain (stock ya timing ki dikkat).
  - 🔴 Delivery pickup me roz delay — partner bandwidth se zyada load.
  - 🔴 Kisi shop ne **earnings guarantee samajhkar** join kiya tha aur ab naraaz hai — Saathi script review karo, aage aisa wada dobara na ho.

## 4. Kab WAPAS KHINCHNA Hai — Pullback

- Koi cluster 4 hafte tak 10 orders/day bhi sustain na kare → use "dormant" ghoshit karo, Saathi wahan se hatao.
- Wajah likho (ops log me): demand nahi? galat locality? execution gap? — bina wajah ke dobara mat kholo.

## 5. Kya KABHI NAHI Karna

1. **NO city-wide launch** — pure sheher me poster/banner lagakar launch karna banned hai jab tak 3+ clusters sustain na kar rahe hon.
2. **NO earnings promises** — na owner ko, na Saathi ko, na marketing me. "Roz X order / ₹Y kamai" jaise daave kabhi mat likho/kaho.
3. **NO vanity metrics** — "500 shops onboarded" ka jashn mat manao agar 450 dormant hain. Sirf **active shops** gino.
4. Naya cluster kholne se pehle purane cluster ka 2-week data ops sheet me darj hona chahiye — data ke bina expansion nahi.

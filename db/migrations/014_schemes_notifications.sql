-- Migration: 014_schemes_notifications.sql
-- Sarkari Yojanaen (Government Schemes) + Notification Panel for Mart customer app.
-- Idempotent: safe to re-run (IF NOT EXISTS / ON CONFLICT (title) DO NOTHING).

-- -------------------------------------------------------
-- Table: government_schemes
-- -------------------------------------------------------
CREATE TABLE IF NOT EXISTS government_schemes (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    title       TEXT NOT NULL UNIQUE,
    description TEXT,
    category    TEXT,
    eligibility TEXT,
    benefits    TEXT,
    apply_url   TEXT,
    source_url  TEXT,
    status      TEXT NOT NULL DEFAULT 'active'
                    CHECK (status IN ('active', 'check')),
    valid_from  DATE,
    valid_to    DATE,
    is_active   BOOLEAN DEFAULT true,
    created_at  TIMESTAMPTZ DEFAULT now(),
    updated_at  TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_government_schemes_status
    ON government_schemes (status, is_active);

-- -------------------------------------------------------
-- Table: notifications
-- user_id NULL = broadcast to all users; INT FK -> users(id)
-- -------------------------------------------------------
CREATE TABLE IF NOT EXISTS notifications (
    id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id    INT NULL REFERENCES users(id) ON DELETE CASCADE,
    title      TEXT NOT NULL,
    body       TEXT,
    type       TEXT NOT NULL DEFAULT 'system'
                   CHECK (type IN ('scheme_offer', 'order_update', 'promo', 'system')),
    data       JSONB DEFAULT '{}',
    is_read    BOOLEAN DEFAULT false,
    created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_notifications_user_created
    ON notifications (user_id, created_at DESC);

-- -------------------------------------------------------
-- Seed: government_schemes (11 schemes from JSON research file)
-- Verified via web search 2026-09-29. Nothing invented.
-- active_2026 = 'active'            -> status = 'active'  (8 schemes)
-- active_2026 = 'uncertain' /
--               'deadline_edge'     -> status = 'check'   (3 schemes)
--
-- UUIDs are hardcoded so seed is idempotent in pg-mem tests
-- (pg-mem evaluates gen_random_uuid() DEFAULT once per statement
-- causing duplicate-key errors on multi-row seed inserts).
-- -------------------------------------------------------

-- 1. PM Vishwakarma (active)
INSERT INTO government_schemes
    (id, title, description, category, eligibility, benefits, apply_url, source_url, status)
VALUES (
    'a1000001-0000-4000-8000-000000000001',
    'PM Vishwakarma',
    'Collateral-free loan + toolkit + training stipend for artisans in 18 traditional trades. Includes digital-transaction incentive up to ₹1/day (max 100/month).',
    'Artisan / Credit',
    '18+, self-employed artisan in one of 18 notified traditional trades, unorganised sector; one member per family',
    'Collateral-free loan up to ₹3 lakh at 5% interest (₹1L/18mo + ₹2L/30mo); toolkit up to ₹15,000; ₹500/day training stipend; ₹1 digital-transaction incentive (max 100/month)',
    'https://pmvishwakarma.gov.in',
    'https://pmvishwakarma.gov.in',
    'active'
) ON CONFLICT (title) DO NOTHING;

-- 2. PM MUDRA Yojana (active)
INSERT INTO government_schemes
    (id, title, description, category, eligibility, benefits, apply_url, source_url, status)
VALUES (
    'a1000002-0000-4000-8000-000000000002',
    'PM MUDRA Yojana',
    'Collateral-free business loans for micro/small enterprises across four tiers: Shishu, Kishore, Tarun, and Tarun Plus.',
    'Credit / MSME',
    'Non-farm, non-corporate micro/small enterprises including small traders and shopkeepers',
    'Collateral-free loans up to ₹20 lakh — Shishu (≤₹50,000), Kishore (₹50,001–₹5L), Tarun (₹5L–₹10L), Tarun Plus (₹10L–₹20L for successful Tarun repayers)',
    'https://www.mudra.org.in',
    'https://www.mudra.org.in',
    'active'
) ON CONFLICT (title) DO NOTHING;

-- 3. Stand-Up India (check — original scheme expired 31 Mar 2025; revamp pending)
INSERT INTO government_schemes
    (id, title, description, category, eligibility, benefits, apply_url, source_url, status)
VALUES (
    'a1000003-0000-4000-8000-000000000003',
    'Stand-Up India',
    'Bank loans for first-time SC/ST and women entrepreneurs. Original scheme expired 31 Mar 2025; revamped scheme modalities being finalised as of Mar 2026.',
    'Credit / Women / SC-ST',
    'SC/ST and women first-time entrepreneurs (manufacturing, services, trading, agri-allied)',
    'Original: bank loans ₹10L–₹1cr. Revamp announced: up to ₹2cr term loans for first-time women/SC/ST entrepreneurs',
    'https://www.standupmitra.in',
    'https://www.standupmitra.in',
    'check'
) ON CONFLICT (title) DO NOTHING;

-- 4. PMEGP (check — continuation only till 31 Mar 2026; EFC pending)
INSERT INTO government_schemes
    (id, title, description, category, eligibility, benefits, apply_url, source_url, status)
VALUES (
    'a1000004-0000-4000-8000-000000000004',
    'PMEGP',
    'Credit-linked subsidy for new micro-enterprises. Continuation approved only till 31 Mar 2026; EFC 5-year continuation pending.',
    'Subsidy / Micro-enterprise',
    '18+, new micro-enterprises only; VIII pass required for higher subsidy slabs',
    'Credit-linked subsidy 15–35% of project cost (25%/35% urban/rural for special categories incl. women, SC/ST, OBC); max project cost ₹50L (manufacturing) / ₹20L (service)',
    'https://www.kviconline.gov.in',
    'https://www.kviconline.gov.in',
    'check'
) ON CONFLICT (title) DO NOTHING;

-- 5. PM SVANidhi Restructured (active)
INSERT INTO government_schemes
    (id, title, description, category, eligibility, benefits, apply_url, source_url, status)
VALUES (
    'a1000005-0000-4000-8000-000000000005',
    'PM SVANidhi (Restructured)',
    'Graduated working-capital loans, interest subsidy, digital cashback and UPI credit card for street vendors identified by Urban Local Bodies.',
    'Street Vendor / Credit',
    'Street vendors/hawkers identified by Urban Local Bodies (vending certificate / survey / Letter of Recommendation)',
    'Graduated collateral-free working-capital loans ₹15k → ₹25k → ₹50k (up to ₹90k total); 7% p.a. interest subsidy via DBT; digital cashback up to ₹1,600/yr; UPI-linked RuPay credit card up to ₹30k',
    'https://www.myscheme.gov.in',
    'https://www.myscheme.gov.in',
    'active'
) ON CONFLICT (title) DO NOTHING;

-- 6. TEAM Scheme (active)
INSERT INTO government_schemes
    (id, title, description, category, eligibility, benefits, apply_url, source_url, status)
VALUES (
    'a1000006-0000-4000-8000-000000000006',
    'TEAM Scheme (Trade Enablement and Marketing)',
    'Financial assistance for micro/small sellers to onboard ONDC — covering cataloguing, logistics, packaging and account management.',
    'Digital Commerce / MSME',
    'Micro and small enterprises incl. local retailers, SHGs, FPOs, artisans; 50% beneficiaries women-owned',
    'Financial assistance for onboarding ONDC — onboarding, cataloguing, account management, logistics, packaging material & design; 1.16L+ retail sellers live (Dec 2025)',
    'https://www.pib.gov.in/PressReleasePage.aspx?PRID=2204664&reg=3&lang=1',
    'https://www.pib.gov.in/PressReleasePage.aspx?PRID=2204664&reg=3&lang=1',
    'active'
) ON CONFLICT (title) DO NOTHING;

-- 7. BHIM-UPI Low-Value P2M Incentive (active)
INSERT INTO government_schemes
    (id, title, description, category, eligibility, benefits, apply_url, source_url, status)
VALUES (
    'a1000007-0000-4000-8000-000000000007',
    'BHIM-UPI Low-Value P2M Incentive',
    '0.15% incentive per transaction up to ₹2,000 for small merchants accepting BHIM-UPI; zero MDR.',
    'Digital Payments',
    'Small merchants accepting BHIM-UPI person-to-merchant transactions up to ₹2,000 (large merchants excluded)',
    '0.15% incentive per transaction (up to ₹2,000) for small merchants; zero MDR — accept UPI at no additional cost',
    'https://www.pmindia.gov.in/en/news_updates/cabinet-approves-incentive-scheme-for-promotion-of-low-value-bhim-upi-transactions-p2m/',
    'https://www.pmindia.gov.in/en/news_updates/cabinet-approves-incentive-scheme-for-promotion-of-low-value-bhim-upi-transactions-p2m/',
    'active'
) ON CONFLICT (title) DO NOTHING;

-- 8. CGTMSE Credit Guarantee (active)
INSERT INTO government_schemes
    (id, title, description, category, eligibility, benefits, apply_url, source_url, status)
VALUES (
    'a1000008-0000-4000-8000-000000000008',
    'CGTMSE Credit Guarantee',
    'Government credit guarantee cover (50–85%) for collateral-free MSE loans. From Sept 2026 also covers TReDS invoice-financing platforms.',
    'Credit Guarantee / MSME',
    'Micro & small enterprises incl. retail traders; TReDS cover needs both buyer and seller to be MSEs',
    'Collateral-free MSE loans with 50–85% government guarantee cover (~50% for retail trade); Sept 2026: 75% cover live on TReDS invoice-financing platforms (M1xchange, RXIL, DTX)',
    'https://www.pib.gov.in/PressReleaseDetail.aspx?PRID=2314945&reg=48&lang=1',
    'https://www.pib.gov.in/PressReleaseDetail.aspx?PRID=2314945&reg=48&lang=1',
    'active'
) ON CONFLICT (title) DO NOTHING;

-- 9. PMFME (check — valid only till 30 Sept 2026; continuation not yet approved)
INSERT INTO government_schemes
    (id, title, description, category, eligibility, benefits, apply_url, source_url, status)
VALUES (
    'a1000009-0000-4000-8000-000000000009',
    'PMFME (PM Formalisation of Micro Food Processing Enterprises)',
    '35% capital subsidy for micro food-processing units. Valid only till 30 Sept 2026; PMFME 2.0 proposed but not yet approved as of Aug 2026.',
    'Food Processing / Subsidy',
    'Existing micro food-processing units, SHGs, FPOs, producer cooperatives (new units only for ODOP products)',
    '35% credit-linked capital subsidy up to ₹10 lakh per unit; SHG seed capital ₹40,000/member (max ₹4L/group)',
    'https://pmfme.mofpi.gov.in',
    'https://pmfme.mofpi.gov.in',
    'check'
) ON CONFLICT (title) DO NOTHING;

-- 10. Udyam Registration (active)
INSERT INTO government_schemes
    (id, title, description, category, eligibility, benefits, apply_url, source_url, status)
VALUES (
    'a100000a-0000-4000-8000-00000000000a',
    'Udyam Registration (MSME)',
    'Free MSME registration unlocking priority-sector lending, CGTMSE loans, delayed-payment protection, tender/GeM preference and fee concessions.',
    'MSME / Registration',
    'Micro/small/medium enterprises incl. retail & wholesale traders (traders'' benefits restricted to priority-sector-lending only)',
    'Free registration unlocking priority-sector lending, CGTMSE collateral-free loans, delayed-payment protection (45-day rule, 3x interest via MSME Samadhaan), tender/GeM preference, patent/trademark fee concessions',
    'https://udyamregistration.gov.in',
    'https://udyamregistration.gov.in',
    'active'
) ON CONFLICT (title) DO NOTHING;

-- 11. Udyogini Scheme Karnataka (active)
INSERT INTO government_schemes
    (id, title, description, category, eligibility, benefits, apply_url, source_url, status)
VALUES (
    'a100000b-0000-4000-8000-00000000000b',
    'Udyogini Scheme (Karnataka)',
    'Business loan with 30–50% government subsidy for women permanent residents of Karnataka, via KSWDC. State-level example — swap per user state.',
    'Women Entrepreneurship / State',
    'Women permanent residents of Karnataka only (via KSWDC)',
    'Business loan up to ₹3 lakh for women with 30–50% government subsidy, no collateral',
    'https://kswdc.karnataka.gov.in',
    'https://kswdc.karnataka.gov.in',
    'active'
) ON CONFLICT (title) DO NOTHING;

-- -------------------------------------------------------
-- Table: notification_reads (per-user read state for broadcasts)
-- A broadcast (user_id IS NULL) is shared, so marking it read must NOT
-- flip a global flag — each user gets their own row here.
-- Targeted notifications (user_id = me) keep using notifications.is_read.
-- -------------------------------------------------------
CREATE TABLE IF NOT EXISTS notification_reads (
    notification_id UUID NOT NULL REFERENCES notifications(id) ON DELETE CASCADE,
    user_id         INT  NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    read_at         TIMESTAMPTZ DEFAULT now(),
    PRIMARY KEY (notification_id, user_id)
);

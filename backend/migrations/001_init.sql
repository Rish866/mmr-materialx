-- ============================================================
-- MMR MaterialX — Initial schema
-- Postgres 15+
-- ============================================================

-- ---------- CATEGORIES ----------
CREATE TABLE IF NOT EXISTS categories (
    id          SERIAL PRIMARY KEY,
    name        TEXT NOT NULL,
    slug        TEXT UNIQUE NOT NULL,
    icon        TEXT,
    sort_order  INT DEFAULT 0
);

-- ---------- USERS ----------
CREATE TABLE IF NOT EXISTS users (
    id            BIGSERIAL PRIMARY KEY,
    phone         VARCHAR(15) UNIQUE NOT NULL,   -- E.164 digits, e.g. 919820012345
    name          TEXT,
    business_name TEXT,
    latitude      DOUBLE PRECISION,
    longitude     DOUBLE PRECISION,
    hub_name      TEXT,
    created_at    TIMESTAMPTZ DEFAULT now()
);

-- ---------- OTP (ephemeral auth) ----------
CREATE TABLE IF NOT EXISTS otp_codes (
    id         BIGSERIAL PRIMARY KEY,
    phone      VARCHAR(15) NOT NULL,
    code       VARCHAR(6)  NOT NULL,
    expires_at TIMESTAMPTZ NOT NULL,
    consumed   BOOLEAN DEFAULT FALSE
);
CREATE INDEX IF NOT EXISTS idx_otp_phone ON otp_codes(phone);

-- ---------- LISTINGS ----------
CREATE TABLE IF NOT EXISTS listings (
    id           BIGSERIAL PRIMARY KEY,
    user_id      BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    category_id  INT NOT NULL REFERENCES categories(id),
    title        TEXT NOT NULL,
    quantity     NUMERIC(12,2),
    unit         TEXT,
    price        NUMERIC(12,2),
    price_type   TEXT DEFAULT 'per_unit',   -- 'per_unit' | 'total'
    is_urgent    BOOLEAN DEFAULT FALSE,
    latitude     DOUBLE PRECISION NOT NULL,
    longitude    DOUBLE PRECISION NOT NULL,
    hub_name     TEXT,
    photos       TEXT[] DEFAULT '{}',
    status       TEXT DEFAULT 'active',     -- 'active' | 'sold' | 'expired'
    expires_at   TIMESTAMPTZ,
    created_at   TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_listings_status ON listings(status);
CREATE INDEX IF NOT EXISTS idx_listings_cat    ON listings(category_id);
CREATE INDEX IF NOT EXISTS idx_listings_geo    ON listings(latitude, longitude);

-- ---------- DEAL INTERESTS (analytics) ----------
CREATE TABLE IF NOT EXISTS deal_interests (
    id          BIGSERIAL PRIMARY KEY,
    listing_id  BIGINT REFERENCES listings(id) ON DELETE CASCADE,
    buyer_id    BIGINT REFERENCES users(id),
    offer_price NUMERIC(12,2),
    created_at  TIMESTAMPTZ DEFAULT now()
);

-- ---------- SEED CATEGORIES ----------
INSERT INTO categories (name, slug, icon, sort_order) VALUES
('Paints & Coatings',    'paints',    '🎨', 1),
('Metal Sheets & Scrap', 'metal',     '🔩', 2),
('Polymers & Plastics',  'polymer',   '🧪', 3),
('Packaging Material',   'packaging', '📦', 4),
('Chemicals',            'chemicals', '⚗️', 5),
('Other',                'other',     '📋', 99)
ON CONFLICT (slug) DO NOTHING;

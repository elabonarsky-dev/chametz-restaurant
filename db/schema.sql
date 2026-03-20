CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

CREATE TABLE IF NOT EXISTS bookings (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  pickup_address  TEXT NOT NULL,
  travel_time_minutes INTEGER NOT NULL,
  satellite_confirmation BOOLEAN DEFAULT FALSE,
  preferred_dates JSONB NOT NULL,
  status          VARCHAR(20) DEFAULT 'pending' CHECK (status IN ('pending', 'confirmed', 'cancelled', 'refunded')),
  stripe_payment_id TEXT,
  deposit_amount  INTEGER DEFAULT 0,
  occasion        TEXT,
  phone           TEXT,
  email           TEXT,
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  updated_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS guests (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  booking_id      UUID NOT NULL REFERENCES bookings(id) ON DELETE CASCADE,
  name            TEXT NOT NULL,
  birthday        DATE NOT NULL,
  beverage_pairing VARCHAR(20) NOT NULL CHECK (beverage_pairing IN ('alcoholic', 'non-alcoholic')),
  allergies       TEXT DEFAULT '',
  is_primary      BOOLEAN DEFAULT FALSE,
  created_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS available_dates (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  date            DATE UNIQUE NOT NULL,
  is_open         BOOLEAN DEFAULT TRUE,
  max_guests      INTEGER DEFAULT 0,
  is_special_event BOOLEAN DEFAULT FALSE,
  notes           TEXT DEFAULT '',
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  updated_at      TIMESTAMPTZ DEFAULT NOW()
);

-- Add confirmed_date if it doesn't exist yet (safe to re-run)
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS confirmed_date DATE;

CREATE INDEX IF NOT EXISTS idx_bookings_created_at ON bookings(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_bookings_status ON bookings(status);
CREATE INDEX IF NOT EXISTS idx_guests_booking_id ON guests(booking_id);
CREATE INDEX IF NOT EXISTS idx_available_dates_date ON available_dates(date);
CREATE INDEX IF NOT EXISTS idx_available_dates_is_open ON available_dates(is_open);

-- App-wide key/value settings (venue info, reservation limit, admin password)
CREATE TABLE IF NOT EXISTS app_settings (
  key        VARCHAR(100) PRIMARY KEY,
  value      TEXT NOT NULL DEFAULT '',
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Seed sensible defaults (do nothing if row already exists)
INSERT INTO app_settings (key, value) VALUES
  ('venue_name',         'The Chametz Restaurant'),
  ('cuisine_type',       'American'),
  ('venue_address',      ''),
  ('contact_email',      ''),
  ('contact_phone',      ''),
  ('reservation_limit',  '')
ON CONFLICT (key) DO NOTHING;

-- Migration 0004: cache of barcode lookups against Open Food Facts (#10).
--
-- Global, not per user: a barcode means the same product for everyone, and it
-- holds no personal data. The RAW product is stored and normalised on every
-- read, so an improvement to the normalisation rules applies to products
-- already cached.
--
-- "Not found" is cached too (found = 0), briefly, so a barcode that is not in
-- the database does not cause a fresh upstream request on every scan.
CREATE TABLE barcode_cache (
    barcode     TEXT    PRIMARY KEY,        -- canonical form, see barcode/gtin.ts
    found       INTEGER NOT NULL CHECK (found IN (0, 1)),
    product     TEXT,                       -- raw Open Food Facts product JSON when found
    fetched_at  INTEGER NOT NULL            -- unix seconds
);

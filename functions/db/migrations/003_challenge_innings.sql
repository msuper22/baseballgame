-- Migration: add innings column to challenges so captains can specify game length.
-- Run once against production; safe to re-run since a failed ALTER (column exists) is non-fatal.

ALTER TABLE challenges ADD COLUMN innings INTEGER NOT NULL DEFAULT 9;

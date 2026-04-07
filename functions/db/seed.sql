-- Seed admin account (password: admin123 - CHANGE THIS IN PRODUCTION)
-- bcrypt hash of 'admin123' with cost 10
INSERT OR IGNORE INTO players (username, password, display_name, role)
VALUES ('admin', '$2a$10$N9qo8uLOickgx2ZMRZoMyeIjZAgcfl7p92ldGxad68LJZdL17lhWy', 'Admin', 'admin');

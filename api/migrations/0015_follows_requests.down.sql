ALTER TABLE articles DROP COLUMN IF EXISTS assigned_to;
DROP TABLE IF EXISTS privacy_requests;
DROP TABLE IF EXISTS student_verifications;
ALTER TABLE users DROP COLUMN IF EXISTS student_verified_until;
DROP TABLE IF EXISTS ad_inquiries;
DROP TABLE IF EXISTS user_authors;
DROP TABLE IF EXISTS user_categories;

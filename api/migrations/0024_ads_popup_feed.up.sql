-- Slot iklan baru: popup (app & web) dan iklan geser di feed Ocean Short ala TikTok (app).
-- Popup dibatasi frekuensinya di perangkat (sekali per 6 jam per kampanye); iklan feed muncul tiap 5 video.
INSERT INTO ad_slots (code, surface, placement, width, height, pages) VALUES
  ('app_popup',      'app', 'popup', 320,  480,  '{home,article,category,other}'),
  ('web_popup',      'web', 'popup', 400,  500,  '{home,article,category,other}'),
  ('app_short_feed', 'app', 'feed',  1080, 1920, '{short}')
ON CONFLICT (code) DO NOTHING;

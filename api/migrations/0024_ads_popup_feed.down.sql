DELETE FROM ad_campaigns WHERE slot_code IN ('app_popup', 'web_popup', 'app_short_feed');
DELETE FROM ad_slots WHERE code IN ('app_popup', 'web_popup', 'app_short_feed');

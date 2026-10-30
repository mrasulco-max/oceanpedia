-- Data contoh untuk development. Isi berita adalah CONTOH, bukan berita nyata.
BEGIN;

INSERT INTO categories (slug, name, description, icon, sort_order) VALUES
 ('saham',     'Saham',            'Emiten, IPO, dividen',          'chart',    1),
 ('komoditas', 'Komoditas',        'Emas, minyak, nikel, CPO',      'flag',     2),
 ('crypto',    'Crypto',           'Bitcoin, Ethereum, regulasi',   'bolt',     3),
 ('forex',     'Forex',            'Rupiah & mata uang global',     'globe',    4),
 ('ekonomi',   'Ekonomi',          'Makro, BI, The Fed',            'doc',      5),
 ('analisis',  'Analisis',         'Riset & opini analis',          'pen',      6),
 ('kebijakan', 'Politik & Kebijakan', 'Regulasi dan kebijakan publik', 'shield', 7)
ON CONFLICT (slug) DO NOTHING;

INSERT INTO authors (slug, name, title, bio, verified) VALUES
 ('maya-lestari',  'Maya Lestari',  'Analis Saham',   'Meliput pasar modal sejak 2021. Fokus pada saham perbankan, IPO, dan dividen.', true),
 ('hendra-kusuma', 'Hendra Kusuma', 'Editor Ekonomi', 'Menulis kebijakan moneter dan makroekonomi.', true),
 ('redaksi',       'Redaksi OceanBird', 'Redaksi', 'Tim redaksi OceanBird.', true)
ON CONFLICT (slug) DO NOTHING;

INSERT INTO instruments (symbol, name, exchange, asset_class, currency, provider_symbol, sector) VALUES
 ('BBCA',   'Bank Central Asia Tbk',      'IDX',    'equity',    'IDR', 'BBCA:IDX',  'Keuangan'),
 ('BBRI',   'Bank Rakyat Indonesia Tbk',  'IDX',    'equity',    'IDR', 'BBRI:IDX',  'Keuangan'),
 ('BMRI',   'Bank Mandiri Tbk',           'IDX',    'equity',    'IDR', 'BMRI:IDX',  'Keuangan'),
 ('TLKM',   'Telkom Indonesia Tbk',       'IDX',    'equity',    'IDR', 'TLKM:IDX',  'Telekomunikasi'),
 ('ASII',   'Astra International Tbk',    'IDX',    'equity',    'IDR', 'ASII:IDX',  'Industri'),
 ('GOTO',   'GoTo Gojek Tokopedia Tbk',   'IDX',    'equity',    'IDR', 'GOTO:IDX',  'Teknologi'),
 ('IHSG',   'Indeks Harga Saham Gabungan','IDX',    'index',     'IDR', 'JKSE',      NULL),
 ('LQ45',   'Indeks LQ45',                'IDX',    'index',     'IDR', 'JKLQ45',    NULL),
 ('BTCUSD', 'Bitcoin / Dolar AS',         'Crypto', 'crypto',    'USD', 'BTC/USD',   NULL),
 ('ETHUSD', 'Ethereum / Dolar AS',        'Crypto', 'crypto',    'USD', 'ETH/USD',   NULL),
 ('XAUUSD', 'Emas / Dolar AS',            'Spot',   'commodity', 'USD', 'XAU/USD',   NULL),
 ('USDIDR', 'Dolar AS / Rupiah',          'Forex',  'forex',     'IDR', 'USD/IDR',   NULL)
ON CONFLICT (symbol) DO NOTHING;

WITH c AS (SELECT slug, id FROM categories), a AS (SELECT slug, id FROM authors),
src (slug, title, excerpt, cat, author, premium, breaking, minutes, views, ago, cover) AS (VALUES
 ('ihsg-menguat-ditopang-saham-perbankan', 'IHSG Menguat Ditopang Saham Perbankan, Asing Kembali Net Buy Rp1,2 T', 'Indeks ditutup naik 0,84% ke 7.284,16 dengan beli bersih asing terbesar di saham bank.', 'saham', 'maya-lestari', false, false, 5, 12400, interval '20 minutes', '/img/news-1.jpg'),
 ('bbca-laba-kuartal-iii-naik-11-persen', 'BBCA Catat Laba Kuartal III Naik 11%, Dividen Interim Dinanti', 'Laba bersih tumbuh dua digit ditopang penyaluran kredit dan biaya dana yang rendah.', 'saham', 'maya-lestari', false, false, 4, 8100, interval '1 hour', '/img/news-2.jpg'),
 ('bi-tahan-suku-bunga-6-persen', 'BI Tahan Suku Bunga 6,00%, Rupiah Menguat ke 15.612', 'Rapat Dewan Gubernur mempertahankan BI-Rate; ruang pelonggaran terbuka pada kuartal I 2027.', 'ekonomi', 'hendra-kusuma', false, true, 4, 9800, interval '40 minutes', '/img/news-1.jpg'),
 ('bitcoin-kembali-di-atas-68-ribu', 'Bitcoin Kembali di Atas US$68 Ribu, ETF Catat Arus Masuk', 'Arus masuk ETF lima hari beruntun mendorong harga aset kripto terbesar dunia.', 'crypto', 'redaksi', false, false, 3, 6300, interval '2 hours', '/img/news-2.jpg'),
 ('harga-nikel-naik-di-lme', 'Harga Nikel Naik 1,8% di LME Didorong Permintaan Baterai', 'Permintaan kendaraan listrik di Tiongkok mengangkat harga logam dasar.', 'komoditas', 'redaksi', false, false, 3, 2900, interval '3 hours', '/img/news-1.jpg'),
 ('harga-emas-melemah-jelang-inflasi-as', 'Harga Emas Melemah Jelang Rilis Inflasi AS', 'Investor menahan posisi menunggu data CPI yang menentukan arah suku bunga The Fed.', 'komoditas', 'redaksi', false, false, 3, 7100, interval '4 hours', '/img/news-2.jpg'),
 ('rupiah-menguat-tipis-jelang-keputusan-bi', 'Rupiah Menguat Tipis Jelang Keputusan BI', 'Mata uang Garuda bergerak stabil di kisaran 15.600 per dolar AS.', 'forex', 'hendra-kusuma', false, false, 2, 3400, interval '5 hours', '/img/news-1.jpg'),
 ('outlook-bbca-dan-saham-bank-akhir-tahun', 'Outlook BBCA dan Saham Bank Menjelang Akhir Tahun', 'Laba tumbuh dua digit dan rasio kredit bermasalah terjaga; valuasi dinilai masih wajar.', 'analisis', 'maya-lestari', true, false, 8, 5200, interval '1 day', '/img/news-2.jpg'),
 ('tiga-sektor-diuntungkan-suku-bunga-turun', 'Tiga Sektor yang Diuntungkan Saat Suku Bunga Turun', 'Properti, perbankan, dan konsumer berpotensi diuntungkan pelonggaran moneter.', 'analisis', 'maya-lestari', true, false, 6, 4400, interval '1 day 2 hours', '/img/news-1.jpg'),
 ('ojk-terbitkan-aturan-aset-kripto', 'OJK Terbitkan Aturan Baru Perdagangan Aset Kripto', 'Bursa kripto lokal wajib melaporkan transaksi harian ke regulator.', 'kebijakan', 'redaksi', false, false, 4, 3900, interval '6 hours', '/img/news-2.jpg'),
 ('ipo-kuartal-iv-tujuh-perusahaan', 'IPO Kuartal IV: Tujuh Perusahaan Antre Melantai di BEI', 'Sektor energi baru terbarukan dan teknologi mendominasi daftar calon emiten.', 'saham', 'redaksi', false, false, 4, 3100, interval '1 day 4 hours', '/img/news-1.jpg'),
 ('dpr-sahkan-rapbn-2027', 'DPR Sahkan RAPBN 2027, Defisit Dipatok 2,5% dari PDB', 'Belanja infrastruktur dan subsidi energi menjadi pos terbesar.', 'kebijakan', 'hendra-kusuma', false, false, 5, 2700, interval '7 hours', '/img/news-2.jpg')
)
INSERT INTO articles (slug, title, excerpt, body, cover_url, cover_alt, category_id, author_id, status, is_premium, is_breaking, reading_minutes, view_count, published_at, ai_summary)
SELECT s.slug, s.title, s.excerpt,
       s.excerpt || E'\n\nJAKARTA — Ini adalah isi artikel contoh untuk pengembangan. Paragraf ini menjelaskan konteks peristiwa, data pendukung, dan pandangan analis.' ||
       E'\n\nParagraf kedua memuat dampak terhadap pasar dan aset terkait, serta hal yang perlu dicermati investor dalam beberapa hari ke depan.',
       s.cover, 'Ilustrasi berita', c.id, a.id, 'published', s.premium, s.breaking, s.minutes, s.views, now() - s.ago,
       'Ringkasan AI contoh: ' || s.excerpt
FROM src s JOIN c ON c.slug = s.cat JOIN a ON a.slug = s.author
ON CONFLICT (slug) DO NOTHING;

INSERT INTO tags (slug, name) VALUES ('ihsg', 'IHSG'), ('the-fed', 'The Fed'), ('bitcoin', 'Bitcoin'), ('dividen', 'Dividen'), ('emas', 'Emas'), ('rupiah', 'Rupiah')
ON CONFLICT (slug) DO NOTHING;
INSERT INTO article_tags SELECT ar.id, t.id FROM articles ar, tags t
WHERE (ar.slug, t.slug) IN (('ihsg-menguat-ditopang-saham-perbankan','ihsg'), ('bbca-laba-kuartal-iii-naik-11-persen','dividen'), ('bitcoin-kembali-di-atas-68-ribu','bitcoin'),
                            ('harga-emas-melemah-jelang-inflasi-as','emas'), ('harga-emas-melemah-jelang-inflasi-as','the-fed'), ('bi-tahan-suku-bunga-6-persen','rupiah'))
ON CONFLICT DO NOTHING;
INSERT INTO article_instruments SELECT ar.id, i.symbol FROM articles ar, instruments i
WHERE (ar.slug, i.symbol) IN (('ihsg-menguat-ditopang-saham-perbankan','IHSG'), ('ihsg-menguat-ditopang-saham-perbankan','BBCA'), ('ihsg-menguat-ditopang-saham-perbankan','BBRI'),
                              ('bbca-laba-kuartal-iii-naik-11-persen','BBCA'), ('bitcoin-kembali-di-atas-68-ribu','BTCUSD'), ('harga-emas-melemah-jelang-inflasi-as','XAUUSD'),
                              ('bi-tahan-suku-bunga-6-persen','USDIDR'), ('outlook-bbca-dan-saham-bank-akhir-tahun','BBCA'))
ON CONFLICT DO NOTHING;

INSERT INTO economic_events (country, title, impact, scheduled_at, actual, forecast, previous, related_symbols) VALUES
 ('ID', 'Penjualan Ritel Indonesia (YoY)', 'medium', date_trunc('day', now()) + interval '2 hours', '4,8%', '4,5%', '4,1%', '{IHSG,USDIDR}'),
 ('ID', 'Keputusan Suku Bunga BI',         'high',   date_trunc('day', now()) + interval '7 hours 20 minutes', '6,00%', '6,00%', '6,00%', '{IHSG,BBCA}'),
 ('US', 'Inflasi Inti AS (CPI, MoM)',      'high',   date_trunc('day', now()) + interval '12 hours 30 minutes', NULL, '0,3%', '0,3%', '{XAUUSD,BTCUSD,USDIDR}'),
 ('US', 'Penjualan Rumah Baru AS',         'low',    date_trunc('day', now()) + interval '14 hours', NULL, '710 rb', '716 rb', '{}'),
 ('US', 'Stok Minyak EIA',                 'medium', date_trunc('day', now()) + interval '14 hours 30 minutes', NULL, '−1,2 jt', '0,8 jt', '{}')
ON CONFLICT DO NOTHING;

INSERT INTO subscription_plans (code, name, price_amount, billing_period, min_seats, features) VALUES
 ('student',   'Student',   19000, 'month', 1, '["Artikel & analisis tanpa batas","Newsletter pelanggan","10 price alert"]'),
 ('essential', 'Essential', 59000, 'month', 1, '["Tanpa iklan","Price alert tanpa batas","Analisis AI","Riset eksklusif"]'),
 ('essential_yearly', 'Essential Tahunan', 590000, 'year', 1, '["Tanpa iklan","Price alert tanpa batas","Analisis AI","Riset eksklusif"]'),
 ('corporate', 'Corporate', 49000, 'month', 5, '["Semua fitur Essential","Dashboard admin tim","Invoice & faktur pajak"]')
ON CONFLICT (code) DO NOTHING;

INSERT INTO ad_slots (code, surface, placement, width, height, pages) VALUES
 ('web_leaderboard_top', 'web', 'below_header', 970, 90,  '{home,article,category}'),
 ('web_leaderboard_mid', 'web', 'in_content',   728, 90,  '{home,article,category}'),
 ('web_sky_left',        'web', 'rail_left',    160, 600, '{home,article,category,legal}'),
 ('web_sky_right',       'web', 'rail_right',   160, 600, '{home,article,category,legal}'),
 ('web_native_feed',     'web', 'in_feed',      0,   0,   '{home,category}'),
 ('app_native_card',     'app', 'in_feed',      350, 0,   '{home,category}'),
 ('app_mrec',            'app', 'in_content',   300, 250, '{home,article}'),
 ('app_banner',          'app', 'sticky_bottom',320, 50,  '{article}')
ON CONFLICT (code) DO NOTHING;

COMMIT;

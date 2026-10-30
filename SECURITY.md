# Kebijakan Keamanan

Laporkan kerentanan secara pribadi ke **help@jalaexplorer.com** (subjek: `SECURITY`). Jangan membuka issue publik.
Kami menanggapi dalam 3 hari kerja.

Rahasia (API key Twelve Data, `API_JWT_SECRET`, kredensial database & payment gateway) hanya disimpan di environment server / secret manager,
tidak pernah di repositori atau kode frontend. Bila sebuah kunci pernah terekspos, rotasi segera.

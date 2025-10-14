# Roadmap Pengembangan Crush Rush

## Tahap 0 – Pra-produksi
- Bentuk tim inti (game designer, client engineer, artist 2D, QA) dan tetapkan pipeline.
- Finalisasi GDD ringkas: core loop match-3, tema dunia, karakter, tone audio.
- Pilih toolchain: Vite + TypeScript + Canvas, asset pipeline (aseprite/figma), manajemen proyek.
- Susun definisi KPI awal (retensi D1/D7, waktu sesi) & target platform (desktop web terlebih dahulu).

## Tahap 1 – Fondasi Gameplay (Sprint 1-2)
- Board match-3 dinamis: grid fleksibel, generator tile valid tanpa deadlock awal.
- Interaksi dasar pemain: swap tile adjacent, rollback jika tidak match.
- Mekanika match & cascade: deteksi 3+ searah, clear, drop tile, refill.
- UI dasar: skor, langkah tersisa, target level, tombol restart.
- Framework state game (loading → playing → hasil) dan loop level berakhir.
- Telemetry debug (logger sederhana) untuk analisa internal.

## Tahap 2 – Polishing Inti (Sprint 3-4)
- Animasi swapping, popping, dan cascade; efek partikel ringan.
- Sistem life/nyawa dan star rating hasil level.
- Tutorial interaktif level 1 (petunjuk visual, highlight langkah wajib).
- Progres linear: world map sederhana, penyimpanan progres lokal.
- QA smoke test otomatis (playthrough script) + checklist manual.

## Tahap 3 – Special Candies & Obstacles (Sprint 5-6)
- Special candy match-4 (garis) dan match-L/T (bomb) + kombinasi antar special.
- Cascade berantai multi-layer & scoring kombo.
- Rintangan generasi 1: jelly, crate; kondisi kemenangan multi-target.
- Balancing awal parameter drop-rate special & kesulitan level 1-30.
- Update tutorial untuk mengenalkan special dan rintangan baru.

## Tahap 4 – Pipeline Level & Tools (Sprint 7-8)
- Editor level internal berbasis web (drag-drop tile, export JSON).
- Format paket level (episode → level) dengan versi & metadata kesulitan.
- Integrasi editor ke game client (load via config), dukungan hot-reload.
- Analitik progres (level attempts, win rate) dengan export file lokal.
- Playtest terstruktur + sesi feedback.

## Tahap 5 – Booster & Ekonomi (Sprint 9-10)
- Booster pra-level (color bomb, hammer) dan in-level (shuffle, extra moves).
- Sistem currency soft & hard; UI toko dasar & inventori booster.
- Daily reward & quest harian/mingguan dasar.
- Placeholder integrasi IAP (mock service) + persiapan compliance store.
- AB testing harga booster dengan flag konfigurasi.

## Tahap 6 – Meta & Sosial (Sprint 11-13)
- Leaderboard teman (menggunakan ID lokal / mock backend).
- Sinkronisasi cloud (opsional backend ringan, mis. Firebase) & save cross-device.
- Event terbatas (treasure hunt, race skor) dengan scheduler.
- Sistem misi musiman/pas battle pass ringan.
- Integrasi notifikasi (email/push) opsional, toggle privasi.

## Tahap 7 – Live Ops & Kualitas (Sprint 14-16)
- Dashboard analitik internal & pipeline konten mingguan terotomasi.
- Alerting performa (frame drop, load time) & logging produksi.
- Regression test suite (unit + e2e) terintegrasi CI.
- Optimasi performa: batching render, pooling object, memory profiling.
- Soft launch (region terbatas) + iterasi balancing berbasis data.

## Tahap 8 – Global Launch & Pasca Rilis
- Kampanye peluncuran, ASO, materi promosi.
- Cadence konten (level baru mingguan, event tematik).
- Sistem feature flag & rollback cepat untuk live ops.
- Monitoring KPI pasca rilis, roadmap ekspansi (platform mobile native, kolaborasi IP).

## Prinsip Kualitas
- QA berlapis: unit test logic match-3, snapshot render, playtest manual harian.
- Aksesibilitas: mode colorblind, hint otomatis, opsi kontrol keyboard/mouse.
- Lokalisasi sejak dini (string table), siap multi bahasa.
- Keamanan transaksi & mitigasi cheat (validasi sisi server untuk monetisasi).

## Deliverable Utama
1. Game client web berbasis TypeScript yang modular & mudah diekspor ke mobile.
2. Tool internal level editor + pipeline konten.
3. Sistem Live Ops siap scale dengan analitik & feature flag.
4. Dokumentasi desain, QA, dan teknis yang terus diperbarui.

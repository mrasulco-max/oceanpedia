import 'package:material_ui/material_ui.dart';
import 'package:go_router/go_router.dart';
import 'package:provider/provider.dart';

import '../../core/session.dart';
import '../../core/theme.dart';
import '../../data/api_repository.dart';

class AccountScreen extends StatelessWidget {
  const AccountScreen({super.key});

  @override
  Widget build(BuildContext context) {
    final session = context.watch<SessionStore>();
    final user = session.user;

    return Scaffold(
      body: SafeArea(
        child: ListView(
          padding: const EdgeInsets.fromLTRB(16, 12, 16, 32),
          children: [
            const Text('Akun', style: TextStyle(fontSize: 22, fontWeight: FontWeight.w800)),
            const SizedBox(height: 20),
            if (!session.isLoggedIn)
              Container(
                padding: const EdgeInsets.all(20),
                decoration: BoxDecoration(
                  color: ObColors.surface,
                  borderRadius: BorderRadius.circular(20),
                  border: Border.all(color: ObColors.border),
                ),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    const Text(
                      'Masuk untuk sinkron watchlist, jurnal & notifikasi',
                      style: TextStyle(fontWeight: FontWeight.w600, fontSize: 16),
                    ),
                    const SizedBox(height: 16),
                    ElevatedButton(onPressed: () => context.push('/masuk'), child: const Text('Masuk')),
                    const SizedBox(height: 8),
                    OutlinedButton(onPressed: () => context.push('/daftar'), child: const Text('Daftar')),
                  ],
                ),
              )
            else
              Row(
                children: [
                  CircleAvatar(
                    radius: 28,
                    backgroundColor: ObColors.brandSoft,
                    child: Text(
                      (user!.fullName.isNotEmpty ? user.fullName[0] : '?').toUpperCase(),
                      style: const TextStyle(color: ObColors.brand, fontWeight: FontWeight.w800, fontSize: 22),
                    ),
                  ),
                  const SizedBox(width: 14),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(user.fullName, style: const TextStyle(fontSize: 18, fontWeight: FontWeight.w700)),
                        Text(user.email, style: const TextStyle(color: ObColors.textSecondary)),
                        if (user.plan != null)
                          Text('Paket ${user.plan}', style: const TextStyle(color: ObColors.brand, fontWeight: FontWeight.w600, fontSize: 13)),
                      ],
                    ),
                  ),
                ],
              ),
            const SizedBox(height: 24),
            _tile(Icons.play_circle_outline, 'Ocean Short', () => context.push('/short')),
            _tile(Icons.podcasts, 'Live', () => context.push('/live')),
            _tile(Icons.workspace_premium_outlined, 'Plus', () => context.push('/plus')),
            _tile(Icons.auto_awesome, 'Aurora AI', () => context.push('/ai')),
            _tile(Icons.menu_book_outlined, 'Jurnal Trading', () => context.push('/jurnal')),
            _tile(Icons.star_outline, 'Watchlist', () => context.push('/watchlist')),
            _tile(Icons.bookmark_border, 'Tersimpan', () => context.push('/tersimpan')),
            _tile(Icons.notifications_active_outlined, 'Price alert', () => context.push('/alert')),
            _tile(Icons.notifications_none, 'Notifikasi', () => context.push('/notifikasi')),
            _tile(Icons.settings_outlined, 'Pengaturan', () => context.push('/pengaturan')),
            if (session.canWrite || session.user?.isStaff == true)
              _tile(Icons.edit_note, 'Redaksi', () => context.push('/redaksi')),
            if (session.isLoggedIn)
              _tile(
                Icons.logout,
                'Keluar',
                () async {
                  await context.read<ApiRepository>().logout();
                  if (context.mounted) {
                    ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('Sudah keluar')));
                  }
                },
                danger: true,
              ),
          ],
        ),
      ),
    );
  }

  Widget _tile(IconData icon, String title, VoidCallback onTap, {bool danger = false}) {
    return ListTile(
      contentPadding: EdgeInsets.zero,
      leading: Container(
        width: 40,
        height: 40,
        decoration: BoxDecoration(
          color: ObColors.surface,
          borderRadius: BorderRadius.circular(12),
          border: Border.all(color: ObColors.border),
        ),
        child: Icon(icon, color: danger ? ObColors.error : ObColors.textSecondary),
      ),
      title: Text(
        title,
        style: TextStyle(fontWeight: FontWeight.w600, color: danger ? ObColors.error : ObColors.text),
      ),
      trailing: const Icon(Icons.chevron_right, color: ObColors.textMuted),
      onTap: onTap,
    );
  }
}

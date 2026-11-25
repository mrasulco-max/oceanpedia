import 'package:material_ui/material_ui.dart';
import 'package:go_router/go_router.dart';
import 'package:provider/provider.dart';

import '../../core/session.dart';
import '../../core/theme.dart';

class AppShell extends StatelessWidget {
  const AppShell({super.key, required this.navigationShell});

  final StatefulNavigationShell navigationShell;

  static const _tabs = [
    _Tab(label: 'Beranda', icon: Icons.dashboard_outlined, activeIcon: Icons.dashboard),
    _Tab(label: 'Market', icon: Icons.show_chart_outlined, activeIcon: Icons.show_chart),
    _Tab(label: 'Cari', icon: Icons.search, activeIcon: Icons.search),
    _Tab(label: 'Kalender', icon: Icons.calendar_today_outlined, activeIcon: Icons.calendar_today),
    _Tab(label: 'Akun', icon: Icons.person_outline, activeIcon: Icons.person),
  ];

  void _showCreate(BuildContext context) {
    showModalBottomSheet<void>(
      context: context,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(24)),
      ),
      builder: (ctx) => Padding(
        padding: EdgeInsets.fromLTRB(20, 16, 20, 20 + MediaQuery.paddingOf(ctx).bottom),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Center(
              child: Container(
                width: 40,
                height: 4,
                decoration: BoxDecoration(color: ObColors.border, borderRadius: BorderRadius.circular(999)),
              ),
            ),
            const SizedBox(height: 12),
            const Text('Buat konten', style: TextStyle(fontSize: 17, fontWeight: FontWeight.w700)),
            const SizedBox(height: 12),
            ListTile(
              leading: const CircleAvatar(
                backgroundColor: ObColors.brandChip,
                child: Icon(Icons.article_outlined, color: ObColors.brand),
              ),
              title: const Text('Tulis artikel'),
              subtitle: const Text('Gambar, judul, deskripsi, market terkait'),
              onTap: () {
                Navigator.pop(ctx);
                context.push('/tulis/artikel');
              },
            ),
            ListTile(
              leading: const CircleAvatar(
                backgroundColor: ObColors.brandChip,
                child: Icon(Icons.videocam_outlined, color: ObColors.brand),
              ),
              title: const Text('Unggah Ocean Short'),
              subtitle: const Text('Video vertikal pendek'),
              onTap: () {
                Navigator.pop(ctx);
                context.push('/tulis/short');
              },
            ),
          ],
        ),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final idx = navigationShell.currentIndex;
    final canWrite = context.watch<SessionStore>().canWrite;
    return Scaffold(
      body: navigationShell,
      floatingActionButton: canWrite
          ? FloatingActionButton(
              backgroundColor: ObColors.text,
              onPressed: () => _showCreate(context),
              child: const Icon(Icons.add, color: Colors.white, size: 28),
            )
          : null,
      floatingActionButtonLocation: FloatingActionButtonLocation.endFloat,
      bottomNavigationBar: Container(
        decoration: const BoxDecoration(
          color: ObColors.white,
          border: Border(top: BorderSide(color: ObColors.border)),
        ),
        padding: EdgeInsets.only(
          top: 4,
          left: 8,
          right: 8,
          bottom: 8 + MediaQuery.paddingOf(context).bottom,
        ),
        child: Row(
          children: List.generate(_tabs.length, (i) {
            final t = _tabs[i];
            final on = i == idx;
            return Expanded(
              child: InkWell(
                onTap: () => navigationShell.goBranch(
                  i,
                  initialLocation: i == navigationShell.currentIndex,
                ),
                borderRadius: BorderRadius.circular(16),
                child: Padding(
                  padding: const EdgeInsets.only(top: 6, bottom: 2),
                  child: Column(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      Container(
                        width: 56,
                        height: 30,
                        decoration: BoxDecoration(
                          color: on ? ObColors.brandSoft : Colors.transparent,
                          borderRadius: BorderRadius.circular(999),
                        ),
                        child: Icon(
                          on ? t.activeIcon : t.icon,
                          size: 22,
                          color: on ? ObColors.brand : ObColors.textMuted,
                        ),
                      ),
                      const SizedBox(height: 4),
                      Text(
                        t.label,
                        style: TextStyle(
                          fontSize: 11,
                          fontWeight: on ? FontWeight.w700 : FontWeight.w500,
                          color: on ? ObColors.text : ObColors.textSecondary,
                        ),
                      ),
                    ],
                  ),
                ),
              ),
            );
          }),
        ),
      ),
    );
  }
}

class _Tab {
  const _Tab({required this.label, required this.icon, required this.activeIcon});
  final String label;
  final IconData icon;
  final IconData activeIcon;
}

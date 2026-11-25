import 'package:material_ui/material_ui.dart';
import 'package:go_router/go_router.dart';
import 'package:provider/provider.dart';

import '../../core/api_exception.dart';
import '../../core/session.dart';
import '../../core/theme.dart';
import '../../data/api_repository.dart';
import '../../data/models/extra.dart';
import '../../widgets/ob_widgets.dart';

class SettingsScreen extends StatefulWidget {
  const SettingsScreen({super.key});

  @override
  State<SettingsScreen> createState() => _SettingsScreenState();
}

class _SettingsScreenState extends State<SettingsScreen> {
  bool _digest = false;
  bool _breaking = true;
  bool _busy = false;
  List<DeviceSession> _sessions = [];

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) => _loadSessions());
  }

  Future<void> _loadSessions() async {
    if (!context.read<SessionStore>().isLoggedIn) return;
    try {
      final s = await context.read<ApiRepository>().sessions();
      if (!mounted) return;
      setState(() => _sessions = s);
    } catch (_) {}
  }

  Future<void> _savePrefs() async {
    setState(() => _busy = true);
    try {
      await context.read<ApiRepository>().patchMe({
        'preferences': {
          'morning_digest': _digest,
          'notify_breaking': _breaking,
        },
      });
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Pengaturan disimpan')),
      );
    } on ApiException catch (e) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(e.message)));
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final loggedIn = context.watch<SessionStore>().isLoggedIn;
    return Scaffold(
      body: SafeArea(
        child: Column(
          children: [
            const ObAppHeader(title: 'Pengaturan'),
            Expanded(
              child: !loggedIn
                  ? Center(
                      child: ElevatedButton(
                        onPressed: () => context.push('/masuk'),
                        child: const Text('Masuk'),
                      ),
                    )
                  : ListView(
                      padding: const EdgeInsets.fromLTRB(16, 8, 16, 32),
                      children: [
                        SwitchListTile(
                          title: const Text('Ringkasan pagi'),
                          value: _digest,
                          activeThumbColor: ObColors.brand,
                          onChanged: (v) => setState(() => _digest = v),
                        ),
                        SwitchListTile(
                          title: const Text('Notifikasi breaking'),
                          value: _breaking,
                          activeThumbColor: ObColors.brand,
                          onChanged: (v) => setState(() => _breaking = v),
                        ),
                        const SizedBox(height: 8),
                        ElevatedButton(
                          onPressed: _busy ? null : _savePrefs,
                          child: Text(_busy ? 'Menyimpan…' : 'Simpan preferensi'),
                        ),
                        const SizedBox(height: 24),
                        const Text('Sesi perangkat', style: TextStyle(fontWeight: FontWeight.w700, fontSize: 16)),
                        const SizedBox(height: 8),
                        if (_sessions.isEmpty)
                          const Text('Tidak ada data sesi', style: TextStyle(color: ObColors.textMuted))
                        else
                          ..._sessions.map(
                            (s) => ListTile(
                              contentPadding: EdgeInsets.zero,
                              title: Text(
                                s.current ? 'Perangkat ini' : (s.userAgent.isEmpty ? 'Perangkat' : s.userAgent),
                                maxLines: 2,
                                overflow: TextOverflow.ellipsis,
                              ),
                              trailing: s.current
                                  ? null
                                  : IconButton(
                                      icon: const Icon(Icons.logout, color: ObColors.error),
                                      onPressed: () async {
                                        await context.read<ApiRepository>().deleteSession(s.id);
                                        _loadSessions();
                                      },
                                    ),
                            ),
                          ),
                      ],
                    ),
            ),
          ],
        ),
      ),
    );
  }
}

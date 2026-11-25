import 'package:material_ui/material_ui.dart';
import 'package:go_router/go_router.dart';
import 'package:provider/provider.dart';

import '../../core/api_exception.dart';
import '../../core/session.dart';
import '../../core/theme.dart';
import '../../data/api_repository.dart';
import '../../data/models/extra.dart';
import '../../widgets/ob_widgets.dart';

class AdminDashboardScreen extends StatefulWidget {
  const AdminDashboardScreen({super.key});

  @override
  State<AdminDashboardScreen> createState() => _AdminDashboardScreenState();
}

class _AdminDashboardScreenState extends State<AdminDashboardScreen> {
  Map<String, dynamic>? _dash;
  List<Map<String, dynamic>> _feed = [];
  List<AdminArticle> _articles = [];
  Object? _error;
  bool _loading = true;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) => _load());
  }

  Future<void> _load() async {
    final session = context.read<SessionStore>();
    if (!session.canWrite && session.user?.isStaff != true) {
      setState(() {
        _loading = false;
        _error = 'perm';
      });
      return;
    }
    setState(() {
      _loading = true;
      _error = null;
    });
    try {
      final repo = context.read<ApiRepository>();
      Map<String, dynamic>? dash;
      List<Map<String, dynamic>> feed = [];
      try {
        dash = await repo.adminDashboard();
      } catch (_) {}
      try {
        feed = await repo.adminFeed();
      } catch (_) {}
      final arts = await repo.adminArticles();
      if (!mounted) return;
      setState(() {
        _dash = dash;
        _feed = feed;
        _articles = arts;
        _loading = false;
      });
    } catch (e) {
      if (!mounted) return;
      setState(() {
        _error = e;
        _loading = false;
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      body: SafeArea(
        child: Column(
          children: [
            const ObAppHeader(title: 'Redaksi'),
            Expanded(
              child: _loading
                  ? const ObLoading()
                  : _error == 'perm'
                      ? const Center(child: Text('Tidak punya akses', style: TextStyle(color: ObColors.textMuted)))
                      : _error != null && _articles.isEmpty
                          ? ObErrorView(
                              message: _error is ApiException
                                  ? (_error as ApiException).message
                                  : 'Gagal memuat',
                              onRetry: _load,
                            )
                          : RefreshIndicator(
                              onRefresh: _load,
                              child: ListView(
                                padding: const EdgeInsets.fromLTRB(16, 8, 16, 32),
                                children: [
                                  Wrap(
                                    spacing: 8,
                                    children: [
                                      ElevatedButton(
                                        onPressed: () => context.push('/tulis/artikel'),
                                        child: const Text('Tulis artikel'),
                                      ),
                                      OutlinedButton(
                                        onPressed: () => context.push('/tulis/short'),
                                        child: const Text('Short'),
                                      ),
                                    ],
                                  ),
                                  if (_dash != null) ...[
                                    const SizedBox(height: 16),
                                    Text(
                                      'Dashboard: ${_dash!.keys.take(6).join(', ')}',
                                      style: const TextStyle(color: ObColors.textSecondary, fontSize: 13),
                                    ),
                                  ],
                                  const SizedBox(height: 16),
                                  const Text('Artikel saya', style: TextStyle(fontWeight: FontWeight.w700, fontSize: 16)),
                                  ..._articles.take(20).map(
                                        (a) => ListTile(
                                          contentPadding: EdgeInsets.zero,
                                          title: Text(a.title, maxLines: 2),
                                          subtitle: Text(a.status),
                                        ),
                                      ),
                                  if (_feed.isNotEmpty) ...[
                                    const SizedBox(height: 16),
                                    const Text('Aktivitas', style: TextStyle(fontWeight: FontWeight.w700, fontSize: 16)),
                                    ..._feed.take(15).map(
                                          (f) => ListTile(
                                            contentPadding: EdgeInsets.zero,
                                            dense: true,
                                            title: Text(
                                              (f['title'] ?? f['action'] ?? f['message'] ?? f.toString()).toString(),
                                              maxLines: 2,
                                            ),
                                          ),
                                        ),
                                  ],
                                ],
                              ),
                            ),
            ),
          ],
        ),
      ),
    );
  }
}

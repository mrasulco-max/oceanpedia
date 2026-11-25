import 'package:material_ui/material_ui.dart';
import 'package:go_router/go_router.dart';
import 'package:provider/provider.dart';

import '../../core/api_exception.dart';
import '../../core/session.dart';
import '../../core/theme.dart';
import '../../data/api_repository.dart';
import '../../data/models/models.dart';
import '../../widgets/ob_widgets.dart';

class NotificationsScreen extends StatefulWidget {
  const NotificationsScreen({super.key});

  @override
  State<NotificationsScreen> createState() => _NotificationsScreenState();
}

class _NotificationsScreenState extends State<NotificationsScreen> {
  List<AppNotification> _items = [];
  Object? _error;
  bool _loading = true;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) => _load());
  }

  Future<void> _load() async {
    final session = context.read<SessionStore>();
    if (!session.isLoggedIn) {
      setState(() {
        _loading = false;
        _error = 'login';
      });
      return;
    }
    setState(() {
      _loading = _items.isEmpty;
      _error = null;
    });
    try {
      final repo = context.read<ApiRepository>();
      final list = await repo.notifications();
      final unread = list.where((e) => e.isUnread).map((e) => e.id).toList();
      if (unread.isNotEmpty) {
        try {
          await repo.markNotificationsRead(ids: unread);
        } catch (_) {}
      }
      if (!mounted) return;
      setState(() {
        _items = list;
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

  void _openLink(String link) {
    if (link.isEmpty) return;
    final uri = Uri.tryParse(link);
    if (uri == null) return;
    final path = uri.path;
    if (path.startsWith('/berita/')) {
      context.push(path);
    } else if (path.startsWith('/market/')) {
      context.push(path);
    } else if (path.isNotEmpty) {
      context.push(path);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      body: SafeArea(
        child: Column(
          children: [
            const ObAppHeader(title: 'Notifikasi'),
            Expanded(
              child: _loading
                  ? const ObLoading()
                  : _error == 'login'
                      ? Center(
                          child: Padding(
                            padding: const EdgeInsets.all(24),
                            child: Column(
                              mainAxisSize: MainAxisSize.min,
                              children: [
                                const Text(
                                  'Masuk untuk melihat notifikasi',
                                  style: TextStyle(color: ObColors.textSecondary),
                                ),
                                const SizedBox(height: 16),
                                ElevatedButton(
                                  onPressed: () => context.push('/masuk'),
                                  child: const Text('Masuk'),
                                ),
                              ],
                            ),
                          ),
                        )
                      : _error != null && _items.isEmpty
                          ? ObErrorView(
                              message: _error is ApiException
                                  ? (_error as ApiException).message
                                  : 'Gagal memuat notifikasi',
                              onRetry: _load,
                            )
                          : RefreshIndicator(
                              color: ObColors.brand,
                              onRefresh: _load,
                              child: _items.isEmpty
                                  ? ListView(
                                      physics: const AlwaysScrollableScrollPhysics(),
                                      children: const [
                                        SizedBox(height: 120),
                                        Center(
                                          child: Text(
                                            'Belum ada notifikasi',
                                            style: TextStyle(color: ObColors.textMuted),
                                          ),
                                        ),
                                      ],
                                    )
                                  : ListView.separated(
                                      physics: const AlwaysScrollableScrollPhysics(),
                                      itemCount: _items.length,
                                      separatorBuilder: (_, __) =>
                                          const Divider(height: 1, color: ObColors.border),
                                      itemBuilder: (_, i) {
                                        final n = _items[i];
                                        return ListTile(
                                          onTap: () => _openLink(n.link),
                                          leading: CircleAvatar(
                                            backgroundColor: ObColors.brandSoft,
                                            child: Icon(
                                              _iconFor(n.kind),
                                              color: ObColors.brand,
                                              size: 20,
                                            ),
                                          ),
                                          title: Text(
                                            n.title,
                                            style: TextStyle(
                                              fontWeight:
                                                  n.isUnread ? FontWeight.w700 : FontWeight.w500,
                                            ),
                                          ),
                                          subtitle: Text(
                                            [
                                              if (n.body.isNotEmpty) n.body,
                                              formatRelative(n.createdAt),
                                            ].join('\n'),
                                            maxLines: 3,
                                          ),
                                          isThreeLine: n.body.isNotEmpty,
                                        );
                                      },
                                    ),
                            ),
            ),
          ],
        ),
      ),
    );
  }

  IconData _iconFor(String kind) {
    switch (kind) {
      case 'price_alert':
        return Icons.show_chart;
      case 'breaking':
        return Icons.campaign_outlined;
      case 'reply':
        return Icons.chat_bubble_outline;
      case 'billing':
        return Icons.payment_outlined;
      default:
        return Icons.notifications_none;
    }
  }
}

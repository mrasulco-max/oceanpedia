import 'package:material_ui/material_ui.dart';
import 'package:go_router/go_router.dart';
import 'package:provider/provider.dart';

import '../../core/api_exception.dart';
import '../../core/session.dart';
import '../../core/theme.dart';
import '../../data/api_repository.dart';
import '../../data/models/extra.dart';
import '../../data/models/models.dart';
import '../../widgets/ob_widgets.dart';

class SavedScreen extends StatefulWidget {
  const SavedScreen({super.key});

  @override
  State<SavedScreen> createState() => _SavedScreenState();
}

class _SavedScreenState extends State<SavedScreen> with SingleTickerProviderStateMixin {
  late final TabController _tabs;
  List<ArticleCard> _articles = [];
  List<ShortItem> _shorts = [];
  Object? _error;
  bool _loading = true;

  @override
  void initState() {
    super.initState();
    _tabs = TabController(length: 2, vsync: this);
    WidgetsBinding.instance.addPostFrameCallback((_) => _load());
  }

  @override
  void dispose() {
    _tabs.dispose();
    super.dispose();
  }

  Future<void> _load() async {
    if (!context.read<SessionStore>().isLoggedIn) {
      setState(() {
        _loading = false;
        _error = 'login';
      });
      return;
    }
    setState(() {
      _loading = true;
      _error = null;
    });
    try {
      final repo = context.read<ApiRepository>();
      final arts = await repo.bookmarks();
      List<ShortItem> shorts = [];
      try {
        shorts = await repo.savedShorts();
      } catch (_) {}
      if (!mounted) return;
      setState(() {
        _articles = arts;
        _shorts = shorts;
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
            const ObAppHeader(title: 'Tersimpan'),
            TabBar(
              controller: _tabs,
              labelColor: ObColors.brand,
              unselectedLabelColor: ObColors.textSecondary,
              indicatorColor: ObColors.brand,
              tabs: const [Tab(text: 'Artikel'), Tab(text: 'Short')],
            ),
            Expanded(
              child: _loading
                  ? const ObLoading()
                  : _error == 'login'
                      ? Center(
                          child: ElevatedButton(
                            onPressed: () => context.push('/masuk'),
                            child: const Text('Masuk'),
                          ),
                        )
                      : _error != null
                          ? ObErrorView(
                              message: _error is ApiException
                                  ? (_error as ApiException).message
                                  : 'Gagal memuat',
                              onRetry: _load,
                            )
                          : TabBarView(
                              controller: _tabs,
                              children: [
                                RefreshIndicator(
                                  onRefresh: _load,
                                  child: _articles.isEmpty
                                      ? ListView(
                                          children: const [
                                            SizedBox(height: 80),
                                            Center(child: Text('Belum ada bookmark', style: TextStyle(color: ObColors.textMuted))),
                                          ],
                                        )
                                      : ListView.builder(
                                          itemCount: _articles.length,
                                          itemBuilder: (_, i) {
                                            final a = _articles[i];
                                            return ListTile(
                                              title: Text(a.title, maxLines: 2),
                                              subtitle: Text(a.category.name),
                                              onTap: () => context.push('/berita/${a.slug}'),
                                            );
                                          },
                                        ),
                                ),
                                RefreshIndicator(
                                  onRefresh: _load,
                                  child: _shorts.isEmpty
                                      ? ListView(
                                          children: const [
                                            SizedBox(height: 80),
                                            Center(child: Text('Belum ada Short tersimpan', style: TextStyle(color: ObColors.textMuted))),
                                          ],
                                        )
                                      : ListView.builder(
                                          itemCount: _shorts.length,
                                          itemBuilder: (_, i) {
                                            final s = _shorts[i];
                                            return ListTile(
                                              title: Text(s.title),
                                              onTap: () => context.push('/short?v=${s.id}'),
                                            );
                                          },
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

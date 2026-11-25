import 'package:material_ui/material_ui.dart';
import 'package:go_router/go_router.dart';
import 'package:provider/provider.dart';

import '../../core/api_exception.dart';
import '../../core/session.dart';
import '../../core/theme.dart';
import '../../data/api_repository.dart';
import '../../data/models/models.dart';
import '../../widgets/ob_widgets.dart';

class WatchlistScreen extends StatefulWidget {
  const WatchlistScreen({super.key});

  @override
  State<WatchlistScreen> createState() => _WatchlistScreenState();
}

class _WatchlistScreenState extends State<WatchlistScreen> {
  List<WatchItem> _items = [];
  Map<String, Quote> _quotes = {};
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
      final list = await repo.watchlist();
      final quotes = list.isEmpty
          ? <QuoteItem>[]
          : await repo.quotes(list.map((e) => e.instrument.symbol).toList());
      final map = <String, Quote>{};
      for (final q in quotes) {
        if (q.quote != null) map[q.instrument.symbol] = q.quote!;
      }
      if (!mounted) return;
      setState(() {
        _items = list;
        _quotes = map;
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
            const ObAppHeader(title: 'Watchlist'),
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
                                  'Masuk untuk melihat watchlist',
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
                                  : 'Gagal memuat watchlist',
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
                                            'Watchlist masih kosong.\nTambah dari halaman detail market.',
                                            textAlign: TextAlign.center,
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
                                        final item = _items[i];
                                        final sym = item.instrument.symbol;
                                        return Dismissible(
                                          key: ValueKey(sym),
                                          direction: DismissDirection.endToStart,
                                          background: Container(
                                            color: ObColors.error,
                                            alignment: Alignment.centerRight,
                                            padding: const EdgeInsets.only(right: 20),
                                            child: const Icon(Icons.delete, color: Colors.white),
                                          ),
                                          onDismissed: (_) async {
                                            setState(() => _items.removeAt(i));
                                            try {
                                              await context.read<ApiRepository>().removeWatch(sym);
                                            } catch (_) {
                                              _load();
                                            }
                                          },
                                          child: QuoteRow(
                                            symbol: sym,
                                            name: item.instrument.name,
                                            quote: _quotes[sym],
                                            onTap: () => context.push('/market/$sym'),
                                          ),
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
}

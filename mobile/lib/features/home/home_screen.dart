import 'package:material_ui/material_ui.dart';
import 'package:go_router/go_router.dart';
import 'package:provider/provider.dart';

import '../../core/api_exception.dart';
import '../../core/theme.dart';
import '../../data/api_repository.dart';
import '../../data/models/models.dart';
import '../../widgets/ob_widgets.dart';

class HomeScreen extends StatefulWidget {
  const HomeScreen({super.key});

  @override
  State<HomeScreen> createState() => _HomeScreenState();
}

class _HomeScreenState extends State<HomeScreen> {
  HomeData? _data;
  List<QuoteItem> _ticker = [];
  Object? _error;
  bool _loading = true;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    setState(() {
      _loading = _data == null;
      _error = null;
    });
    try {
      final repo = context.read<ApiRepository>();
      final home = await repo.home();
      final instruments = await repo.instruments();
      final pick = instruments.take(12).map((e) => e.symbol).toList();
      final quotes = pick.isEmpty ? <QuoteItem>[] : await repo.quotes(pick);
      if (!mounted) return;
      setState(() {
        _data = home;
        _ticker = quotes;
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
    if (_loading) return const Scaffold(body: ObLoading());
    if (_error != null && _data == null) {
      return Scaffold(
        body: ObErrorView(
          message: _error is ApiException ? (_error as ApiException).message : 'Gagal memuat beranda',
          onRetry: _load,
        ),
      );
    }
    final data = _data!;
    return Scaffold(
      body: SafeArea(
        child: RefreshIndicator(
          color: ObColors.brand,
          onRefresh: _load,
          child: CustomScrollView(
            physics: const AlwaysScrollableScrollPhysics(),
            slivers: [
              SliverToBoxAdapter(
                child: Padding(
                  padding: const EdgeInsets.fromLTRB(16, 8, 16, 0),
                  child: Row(
                    children: [
                      const Expanded(
                        child: Text(
                          'OceanPedia',
                          style: TextStyle(
                            fontSize: 22,
                            fontWeight: FontWeight.w800,
                            color: ObColors.text,
                          ),
                        ),
                      ),
                      IconButton(
                        onPressed: () => context.push('/live'),
                        icon: const Icon(Icons.podcasts, color: ObColors.textSecondary),
                      ),
                      IconButton(
                        onPressed: () => context.push('/short'),
                        icon: const Icon(Icons.play_circle_outline, color: ObColors.textSecondary),
                      ),
                      IconButton(
                        onPressed: () => context.push('/notifikasi'),
                        icon: const Icon(Icons.notifications_none, color: ObColors.textSecondary),
                      ),
                    ],
                  ),
                ),
              ),
              SliverToBoxAdapter(
                child: Padding(
                  padding: const EdgeInsets.fromLTRB(16, 8, 16, 0),
                  child: Wrap(
                    spacing: 8,
                    children: [
                      ActionChip(
                        label: const Text('Short'),
                        avatar: const Icon(Icons.play_arrow, size: 18),
                        onPressed: () => context.push('/short'),
                      ),
                      ActionChip(
                        label: const Text('Live'),
                        avatar: const Icon(Icons.fiber_manual_record, size: 14, color: ObColors.down),
                        onPressed: () => context.push('/live'),
                      ),
                      ActionChip(
                        label: const Text('Plus'),
                        onPressed: () => context.push('/plus'),
                      ),
                      ActionChip(
                        label: const Text('AI'),
                        onPressed: () => context.push('/ai'),
                      ),
                    ],
                  ),
                ),
              ),
              if (_ticker.isNotEmpty)
                SliverToBoxAdapter(
                  child: SizedBox(
                    height: 44,
                    child: ListView.separated(
                      scrollDirection: Axis.horizontal,
                      padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
                      itemCount: _ticker.length,
                      separatorBuilder: (_, __) => const SizedBox(width: 12),
                      itemBuilder: (_, i) {
                        final q = _ticker[i];
                        final quote = q.quote;
                        final up = quote == null || quote.isUp;
                        return GestureDetector(
                          onTap: () => context.push('/market/${q.instrument.symbol}'),
                          child: Container(
                            padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
                            decoration: BoxDecoration(
                              color: ObColors.surface,
                              borderRadius: BorderRadius.circular(999),
                              border: Border.all(color: ObColors.border),
                            ),
                            child: Row(
                              children: [
                                Text(
                                  q.instrument.symbol,
                                  style: const TextStyle(
                                    fontWeight: FontWeight.w700,
                                    fontSize: 12,
                                    fontFamily: 'RobotoMono',
                                  ),
                                ),
                                const SizedBox(width: 6),
                                Text(
                                  quote == null
                                      ? '—'
                                      : '${up ? '+' : ''}${quote.changePercent.toStringAsFixed(2)}%',
                                  style: TextStyle(
                                    fontSize: 12,
                                    fontWeight: FontWeight.w600,
                                    color: quote == null
                                        ? ObColors.textMuted
                                        : (up ? ObColors.up : ObColors.down),
                                    fontFamily: 'RobotoMono',
                                  ),
                                ),
                              ],
                            ),
                          ),
                        );
                      },
                    ),
                  ),
                ),
              if (data.topStory != null)
                SliverToBoxAdapter(
                  child: Padding(
                    padding: const EdgeInsets.fromLTRB(16, 8, 16, 8),
                    child: ArticleCardTile(
                      article: data.topStory!,
                      large: true,
                      onTap: () => context.push('/berita/${data.topStory!.slug}'),
                    ),
                  ),
                ),
              if (data.latest.isNotEmpty) ...[
                const SliverToBoxAdapter(child: _SectionTitle('Terbaru')),
                SliverList(
                  delegate: SliverChildBuilderDelegate(
                    (context, i) {
                      final a = data.latest[i];
                      return Padding(
                        padding: const EdgeInsets.fromLTRB(16, 0, 16, 12),
                        child: ArticleCardTile(
                          article: a,
                          onTap: () => context.push('/berita/${a.slug}'),
                        ),
                      );
                    },
                    childCount: data.latest.length.clamp(0, 8),
                  ),
                ),
              ],
              if (data.mostRead.isNotEmpty) ...[
                const SliverToBoxAdapter(child: _SectionTitle('Terpopuler')),
                ...List.generate(data.mostRead.length.clamp(0, 5), (i) {
                  final a = data.mostRead[i];
                  return SliverToBoxAdapter(
                    child: ListTile(
                      onTap: () => context.push('/berita/${a.slug}'),
                      leading: CircleAvatar(
                        backgroundColor: ObColors.brandSoft,
                        child: Text(
                          '${i + 1}',
                          style: const TextStyle(
                            color: ObColors.brand,
                            fontWeight: FontWeight.w700,
                          ),
                        ),
                      ),
                      title: Text(
                        a.title,
                        maxLines: 2,
                        overflow: TextOverflow.ellipsis,
                        style: const TextStyle(fontWeight: FontWeight.w600, fontSize: 14),
                      ),
                      subtitle: Text(a.category.name, style: const TextStyle(fontSize: 12)),
                    ),
                  );
                }),
              ],
              const SliverToBoxAdapter(child: SizedBox(height: 24)),
            ],
          ),
        ),
      ),
    );
  }
}

class _SectionTitle extends StatelessWidget {
  const _SectionTitle(this.text);
  final String text;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.fromLTRB(16, 16, 16, 10),
      child: Text(
        text,
        style: const TextStyle(fontSize: 17, fontWeight: FontWeight.w700),
      ),
    );
  }
}

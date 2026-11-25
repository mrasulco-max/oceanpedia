import 'package:cached_network_image/cached_network_image.dart';
import 'package:material_ui/material_ui.dart';
import 'package:intl/intl.dart';
import 'package:provider/provider.dart';

import 'package:go_router/go_router.dart';

import '../../core/api_exception.dart';
import '../../core/session.dart';
import '../../core/theme.dart';
import '../../data/api_repository.dart';
import '../../data/models/models.dart';
import '../../widgets/ob_widgets.dart';

class ArticleScreen extends StatefulWidget {
  const ArticleScreen({super.key, required this.slug});

  final String slug;

  @override
  State<ArticleScreen> createState() => _ArticleScreenState();
}

class _ArticleScreenState extends State<ArticleScreen> {
  Article? _article;
  Object? _error;
  bool _loading = true;
  bool _bookmarked = false;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    setState(() {
      _loading = true;
      _error = null;
    });
    try {
      final a = await context.read<ApiRepository>().article(widget.slug);
      if (!mounted) return;
      setState(() {
        _article = a;
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
            ObAppHeader(
              title: _article?.category.name ?? 'Berita',
              actions: [
                IconButton(
                  onPressed: () async {
                    final session = context.read<SessionStore>();
                    if (!session.isLoggedIn) {
                      context.push('/masuk');
                      return;
                    }
                    try {
                      final repo = context.read<ApiRepository>();
                      if (_bookmarked) {
                        await repo.removeBookmark(widget.slug);
                        setState(() => _bookmarked = false);
                      } else {
                        await repo.addBookmark(widget.slug);
                        setState(() => _bookmarked = true);
                      }
                    } on ApiException catch (e) {
                      if (!context.mounted) return;
                      ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(e.message)));
                    }
                  },
                  icon: Icon(_bookmarked ? Icons.bookmark : Icons.bookmark_border),
                ),
                IconButton(
                  onPressed: () => context.push('/ai'),
                  icon: const Icon(Icons.auto_awesome, color: ObColors.brand),
                ),
              ],
            ),
            Expanded(
              child: _loading
                  ? const ObLoading()
                  : _error != null
                      ? ObErrorView(
                          message: _error is ApiException
                              ? (_error as ApiException).message
                              : 'Gagal memuat artikel',
                          onRetry: _load,
                        )
                      : _buildBody(_article!),
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildBody(Article a) {
    final paras = a.body
        .split(RegExp(r'\n\s*\n'))
        .map((e) => e.trim())
        .where((e) => e.isNotEmpty)
        .toList();
    return RefreshIndicator(
      color: ObColors.brand,
      onRefresh: _load,
      child: ListView(
        padding: const EdgeInsets.fromLTRB(20, 8, 20, 40),
        children: [
          if (a.isBreaking)
            Container(
              margin: const EdgeInsets.only(bottom: 10),
              padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
              decoration: BoxDecoration(
                color: ObColors.down.withValues(alpha: 0.1),
                borderRadius: BorderRadius.circular(999),
              ),
              child: const Text(
                'BREAKING',
                style: TextStyle(
                  color: ObColors.down,
                  fontWeight: FontWeight.w800,
                  fontSize: 11,
                ),
              ),
            ),
          Text(
            a.title,
            style: const TextStyle(
              fontSize: 26,
              fontWeight: FontWeight.w800,
              height: 1.2,
            ),
          ),
          const SizedBox(height: 10),
          Text(
            [
              a.authorName,
              if (a.readingMinutes > 0) '${a.readingMinutes} menit baca',
              if (a.publishedAt != null)
                DateFormat('d MMM y · HH.mm').format(a.publishedAt!.toLocal()),
            ].where((e) => e.isNotEmpty).join(' · '),
            style: const TextStyle(color: ObColors.textSecondary, fontSize: 13),
          ),
          if (a.coverUrl != null && a.coverUrl!.isNotEmpty) ...[
            const SizedBox(height: 16),
            ClipRRect(
              borderRadius: BorderRadius.circular(18),
              child: CachedNetworkImage(
                imageUrl: a.coverUrl!,
                fit: BoxFit.cover,
                placeholder: (_, __) => Container(
                  height: 200,
                  color: ObColors.surface,
                ),
                errorWidget: (_, __, ___) => const SizedBox.shrink(),
              ),
            ),
          ],
          if (a.locked) ...[
            const SizedBox(height: 20),
            Container(
              padding: const EdgeInsets.all(16),
              decoration: BoxDecoration(
                color: ObColors.brandSoft,
                borderRadius: BorderRadius.circular(16),
              ),
              child: const Text(
                'Artikel ini untuk pelanggan Plus. Cuplikan ditampilkan di bawah.',
                style: TextStyle(color: ObColors.brand),
              ),
            ),
          ],
          const SizedBox(height: 20),
          ...paras.map(
            (p) => Padding(
              padding: const EdgeInsets.only(bottom: 16),
              child: Text(
                p,
                style: const TextStyle(
                  fontSize: 16,
                  height: 1.55,
                  color: ObColors.text,
                ),
              ),
            ),
          ),
          if (a.symbols.isNotEmpty) ...[
            const SizedBox(height: 8),
            Wrap(
              spacing: 8,
              runSpacing: 8,
              children: a.symbols
                  .map(
                    (s) => Chip(
                      label: Text(s, style: const TextStyle(fontFamily: 'RobotoMono')),
                      backgroundColor: ObColors.surface,
                      side: const BorderSide(color: ObColors.border),
                    ),
                  )
                  .toList(),
            ),
          ],
        ],
      ),
    );
  }
}

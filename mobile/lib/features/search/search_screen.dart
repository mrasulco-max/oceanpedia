import 'dart:async';

import 'package:material_ui/material_ui.dart';
import 'package:go_router/go_router.dart';
import 'package:provider/provider.dart';

import '../../core/api_exception.dart';
import '../../core/theme.dart';
import '../../data/api_repository.dart';
import '../../data/models/models.dart';
import '../../widgets/ob_widgets.dart';

class SearchScreen extends StatefulWidget {
  const SearchScreen({super.key});

  @override
  State<SearchScreen> createState() => _SearchScreenState();
}

class _SearchScreenState extends State<SearchScreen> {
  final _controller = TextEditingController();
  SearchResult? _result;
  Object? _error;
  bool _loading = false;
  Timer? _debounce;

  @override
  void dispose() {
    _debounce?.cancel();
    _controller.dispose();
    super.dispose();
  }

  void _onChanged(String q) {
    setState(() {});
    _debounce?.cancel();
    _debounce = Timer(const Duration(milliseconds: 350), () => _search(q.trim()));
  }

  Future<void> _search(String q) async {
    if (q.isEmpty) {
      setState(() {
        _result = null;
        _error = null;
        _loading = false;
      });
      return;
    }
    setState(() {
      _loading = true;
      _error = null;
    });
    try {
      final res = await context.read<ApiRepository>().search(q);
      if (!mounted) return;
      setState(() {
        _result = res;
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
    final r = _result;
    return Scaffold(
      body: SafeArea(
        child: Column(
          children: [
            Padding(
              padding: const EdgeInsets.fromLTRB(16, 12, 16, 8),
              child: TextField(
                controller: _controller,
                onChanged: _onChanged,
                textInputAction: TextInputAction.search,
                decoration: InputDecoration(
                  hintText: 'Cari berita, aset, penulis…',
                  prefixIcon: const Icon(Icons.search, color: ObColors.textMuted),
                  suffixIcon: _controller.text.isEmpty
                      ? null
                      : IconButton(
                          onPressed: () {
                            _controller.clear();
                            setState(() {});
                            _onChanged('');
                          },
                          icon: const Icon(Icons.close),
                        ),
                ),
              ),
            ),
            Expanded(
              child: _loading
                  ? const ObLoading()
                  : _error != null
                      ? ObErrorView(
                          message: _error is ApiException
                              ? (_error as ApiException).message
                              : 'Pencarian gagal',
                          onRetry: () => _search(_controller.text.trim()),
                        )
                      : r == null
                          ? const Center(
                              child: Text(
                                'Ketik untuk mencari',
                                style: TextStyle(color: ObColors.textMuted),
                              ),
                            )
                          : _buildResults(r),
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildResults(SearchResult r) {
    final empty = r.instruments.isEmpty &&
        r.articles.isEmpty &&
        r.authors.isEmpty &&
        r.tags.isEmpty;
    if (empty) {
      return const Center(
        child: Text('Tidak ada hasil', style: TextStyle(color: ObColors.textMuted)),
      );
    }
    return ListView(
      children: [
        if (r.instruments.isNotEmpty) ...[
          const _Head('Aset'),
          ...r.instruments.map(
            (i) => ListTile(
              title: Text(i.symbol, style: const TextStyle(fontWeight: FontWeight.w700, fontFamily: 'RobotoMono')),
              subtitle: Text(i.name),
              onTap: () => context.push('/market/${i.symbol}'),
            ),
          ),
        ],
        if (r.articles.isNotEmpty) ...[
          const _Head('Berita'),
          ...r.articles.map(
            (a) => ListTile(
              title: Text(a.title, maxLines: 2, overflow: TextOverflow.ellipsis),
              subtitle: Text(a.category.name),
              onTap: () => context.push('/berita/${a.slug}'),
            ),
          ),
        ],
        if (r.authors.isNotEmpty) ...[
          const _Head('Penulis'),
          ...r.authors.map(
            (a) => ListTile(
              title: Text(a.name),
              subtitle: Text(a.title),
            ),
          ),
        ],
        if (r.tags.isNotEmpty) ...[
          const _Head('Topik'),
          Padding(
            padding: const EdgeInsets.fromLTRB(16, 0, 16, 16),
            child: Wrap(
              spacing: 8,
              runSpacing: 8,
              children: r.tags
                  .map(
                    (t) => Chip(
                      label: Text(t.name),
                      backgroundColor: ObColors.surface,
                      side: const BorderSide(color: ObColors.border),
                    ),
                  )
                  .toList(),
            ),
          ),
        ],
      ],
    );
  }
}

class _Head extends StatelessWidget {
  const _Head(this.text);
  final String text;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.fromLTRB(16, 16, 16, 4),
      child: Text(text, style: const TextStyle(fontWeight: FontWeight.w700, fontSize: 15)),
    );
  }
}

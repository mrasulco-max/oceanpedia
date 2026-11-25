import 'dart:async';

import 'package:material_ui/material_ui.dart';
import 'package:go_router/go_router.dart';
import 'package:intl/intl.dart';
import 'package:provider/provider.dart';

import '../../core/api_exception.dart';
import '../../core/theme.dart';
import '../../data/api_repository.dart';
import '../../data/models/extra.dart';
import '../../widgets/ob_widgets.dart';

class LiveScreen extends StatefulWidget {
  const LiveScreen({super.key});

  @override
  State<LiveScreen> createState() => _LiveScreenState();
}

class _LiveScreenState extends State<LiveScreen> {
  LiveBlog? _blog;
  Object? _error;
  bool _loading = true;
  Timer? _poll;

  @override
  void initState() {
    super.initState();
    _load();
    _poll = Timer.periodic(const Duration(seconds: 15), (_) => _load(silent: true));
  }

  @override
  void dispose() {
    _poll?.cancel();
    super.dispose();
  }

  Future<void> _load({bool silent = false}) async {
    if (!silent) {
      setState(() {
        _loading = _blog == null;
        _error = null;
      });
    }
    try {
      final blog = await context.read<ApiRepository>().live();
      if (!mounted) return;
      setState(() {
        _blog = blog;
        _loading = false;
      });
    } catch (e) {
      if (!mounted) return;
      setState(() {
        if (_blog == null) _error = e;
        _loading = false;
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    final blog = _blog;
    return Scaffold(
      body: SafeArea(
        child: Column(
          children: [
            ObAppHeader(
              title: 'Live',
              actions: [
                if (blog?.status == 'live')
                  Container(
                    margin: const EdgeInsets.only(right: 8),
                    padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
                    decoration: BoxDecoration(
                      color: ObColors.down.withValues(alpha: 0.12),
                      borderRadius: BorderRadius.circular(999),
                    ),
                    child: const Text(
                      'LIVE',
                      style: TextStyle(
                        color: ObColors.down,
                        fontWeight: FontWeight.w800,
                        fontSize: 11,
                      ),
                    ),
                  ),
              ],
            ),
            Expanded(
              child: _loading
                  ? const ObLoading()
                  : _error != null && blog == null
                      ? ObErrorView(
                          message: _error is ApiException
                              ? (_error as ApiException).message
                              : 'Live blog tidak tersedia',
                          onRetry: _load,
                        )
                      : RefreshIndicator(
                          color: ObColors.brand,
                          onRefresh: _load,
                          child: ListView(
                            physics: const AlwaysScrollableScrollPhysics(),
                            padding: const EdgeInsets.fromLTRB(16, 0, 16, 32),
                            children: [
                              Text(
                                blog!.title,
                                style: const TextStyle(fontSize: 22, fontWeight: FontWeight.w800),
                              ),
                              if (blog.summary.isNotEmpty) ...[
                                const SizedBox(height: 8),
                                Text(blog.summary, style: const TextStyle(color: ObColors.textSecondary)),
                              ],
                              if (blog.symbol != null) ...[
                                const SizedBox(height: 8),
                                ActionChip(
                                  label: Text(blog.symbol!),
                                  onPressed: () => context.push('/market/${blog.symbol}'),
                                ),
                              ],
                              const SizedBox(height: 16),
                              ...blog.posts.map((p) => _PostTile(post: p)),
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

class _PostTile extends StatelessWidget {
  const _PostTile({required this.post});
  final LivePost post;

  @override
  Widget build(BuildContext context) {
    return Container(
      margin: const EdgeInsets.only(bottom: 12),
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        color: post.pinned ? ObColors.brandSoft : ObColors.white,
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: ObColors.border),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              if (post.pinned)
                const Padding(
                  padding: EdgeInsets.only(right: 6),
                  child: Icon(Icons.push_pin, size: 14, color: ObColors.brand),
                ),
              Text(
                post.author,
                style: const TextStyle(fontWeight: FontWeight.w700, fontSize: 13),
              ),
              const Spacer(),
              if (post.createdAt != null)
                Text(
                  DateFormat('HH:mm').format(post.createdAt!.toLocal()),
                  style: const TextStyle(fontSize: 12, color: ObColors.textMuted, fontFamily: 'RobotoMono'),
                ),
            ],
          ),
          const SizedBox(height: 8),
          Text(post.body, style: const TextStyle(height: 1.4)),
        ],
      ),
    );
  }
}

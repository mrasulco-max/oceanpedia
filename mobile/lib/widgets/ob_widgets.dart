import 'package:cached_network_image/cached_network_image.dart';
import 'package:material_ui/material_ui.dart';
import 'package:intl/intl.dart';

import '../core/theme.dart';
import '../data/models/models.dart';

class ObBackButton extends StatelessWidget {
  const ObBackButton({super.key, this.onPressed});

  final VoidCallback? onPressed;

  @override
  Widget build(BuildContext context) {
    return IconButton(
      onPressed: onPressed ?? () => Navigator.of(context).maybePop(),
      style: IconButton.styleFrom(
        backgroundColor: ObColors.white,
        side: const BorderSide(color: ObColors.border),
        shape: const CircleBorder(),
        fixedSize: const Size(40, 40),
      ),
      icon: const Icon(Icons.chevron_left, color: ObColors.text, size: 28),
    );
  }
}

class ObAppHeader extends StatelessWidget implements PreferredSizeWidget {
  const ObAppHeader({
    super.key,
    required this.title,
    this.actions,
    this.showBack = true,
  });

  final String title;
  final List<Widget>? actions;
  final bool showBack;

  @override
  Size get preferredSize => const Size.fromHeight(56);

  @override
  Widget build(BuildContext context) {
    return SafeArea(
      bottom: false,
      child: Padding(
        padding: const EdgeInsets.fromLTRB(8, 4, 12, 4),
        child: Row(
          children: [
            if (showBack) const ObBackButton(),
            if (showBack) const SizedBox(width: 8),
            Expanded(
              child: Text(
                title,
                style: const TextStyle(
                  fontSize: 18,
                  fontWeight: FontWeight.w700,
                  color: ObColors.text,
                ),
              ),
            ),
            ...?actions,
          ],
        ),
      ),
    );
  }
}

class ObLoading extends StatelessWidget {
  const ObLoading({super.key});

  @override
  Widget build(BuildContext context) {
    return const Center(
      child: CircularProgressIndicator(color: ObColors.brand),
    );
  }
}

class ObErrorView extends StatelessWidget {
  const ObErrorView({super.key, required this.message, this.onRetry});

  final String message;
  final VoidCallback? onRetry;

  @override
  Widget build(BuildContext context) {
    return Center(
      child: Padding(
        padding: const EdgeInsets.all(24),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            const Icon(Icons.wifi_off_rounded, size: 40, color: ObColors.textMuted),
            const SizedBox(height: 12),
            Text(
              message,
              textAlign: TextAlign.center,
              style: const TextStyle(color: ObColors.textSecondary),
            ),
            if (onRetry != null) ...[
              const SizedBox(height: 16),
              OutlinedButton(onPressed: onRetry, child: const Text('Coba lagi')),
            ],
          ],
        ),
      ),
    );
  }
}

class ArticleCardTile extends StatelessWidget {
  const ArticleCardTile({
    super.key,
    required this.article,
    required this.onTap,
    this.large = false,
  });

  final ArticleCard article;
  final VoidCallback onTap;
  final bool large;

  @override
  Widget build(BuildContext context) {
    final cover = article.coverUrl;
    return InkWell(
      onTap: onTap,
      borderRadius: BorderRadius.circular(22),
      child: Container(
        decoration: BoxDecoration(
          color: ObColors.white,
          borderRadius: BorderRadius.circular(22),
          border: Border.all(color: ObColors.border),
        ),
        clipBehavior: Clip.antiAlias,
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            if (cover != null && cover.isNotEmpty)
              AspectRatio(
                aspectRatio: large ? 16 / 9 : 16 / 10,
                child: CachedNetworkImage(
                  imageUrl: cover,
                  fit: BoxFit.cover,
                  placeholder: (_, __) => Container(color: ObColors.surface),
                  errorWidget: (_, __, ___) => Container(
                    color: ObColors.surface,
                    alignment: Alignment.center,
                    child: const Icon(Icons.image_outlined, color: ObColors.textMuted),
                  ),
                ),
              ),
            Padding(
              padding: const EdgeInsets.fromLTRB(14, 12, 14, 14),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Row(
                    children: [
                      if (article.isBreaking)
                        Container(
                          margin: const EdgeInsets.only(right: 8),
                          padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 2),
                          decoration: BoxDecoration(
                            color: ObColors.down.withValues(alpha: 0.12),
                            borderRadius: BorderRadius.circular(999),
                          ),
                          child: const Text(
                            'BREAKING',
                            style: TextStyle(
                              fontSize: 10,
                              fontWeight: FontWeight.w700,
                              color: ObColors.down,
                            ),
                          ),
                        ),
                      Text(
                        article.category.name.toUpperCase(),
                        style: const TextStyle(
                          fontSize: 11,
                          fontWeight: FontWeight.w700,
                          color: ObColors.brand,
                          letterSpacing: 0.4,
                        ),
                      ),
                    ],
                  ),
                  const SizedBox(height: 6),
                  Text(
                    article.title,
                    maxLines: large ? 3 : 2,
                    overflow: TextOverflow.ellipsis,
                    style: TextStyle(
                      fontSize: large ? 18 : 15,
                      fontWeight: FontWeight.w700,
                      height: 1.25,
                      color: ObColors.text,
                    ),
                  ),
                  if (article.excerpt.isNotEmpty) ...[
                    const SizedBox(height: 6),
                    Text(
                      article.excerpt,
                      maxLines: large ? 3 : 2,
                      overflow: TextOverflow.ellipsis,
                      style: const TextStyle(
                        fontSize: 13,
                        height: 1.35,
                        color: ObColors.textSecondary,
                      ),
                    ),
                  ],
                  const SizedBox(height: 8),
                  Text(
                    [
                      article.authorName,
                      if (article.readingMinutes > 0) '${article.readingMinutes} mnt',
                      if (article.publishedAt != null)
                        DateFormat('d MMM').format(article.publishedAt!.toLocal()),
                    ].where((e) => e.isNotEmpty).join(' · '),
                    style: const TextStyle(fontSize: 12, color: ObColors.textMuted),
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

class QuoteRow extends StatelessWidget {
  const QuoteRow({
    super.key,
    required this.symbol,
    required this.name,
    this.quote,
    this.onTap,
    this.trailing,
  });

  final String symbol;
  final String name;
  final Quote? quote;
  final VoidCallback? onTap;
  final Widget? trailing;

  @override
  Widget build(BuildContext context) {
    final q = quote;
    final up = q == null || q.isUp;
    final color = q == null ? ObColors.textMuted : (up ? ObColors.up : ObColors.down);
    final nf = NumberFormat('#,##0.##', 'en_US');

    return ListTile(
      onTap: onTap,
      contentPadding: const EdgeInsets.symmetric(horizontal: 16, vertical: 4),
      title: Text(
        symbol,
        style: const TextStyle(
          fontWeight: FontWeight.w700,
          fontFamily: 'RobotoMono',
          fontSize: 15,
        ),
      ),
      subtitle: Text(
        name,
        maxLines: 1,
        overflow: TextOverflow.ellipsis,
        style: const TextStyle(fontSize: 12, color: ObColors.textSecondary),
      ),
      trailing: trailing ??
          (q == null
              ? const Text('—', style: TextStyle(color: ObColors.textMuted))
              : Column(
                  mainAxisAlignment: MainAxisAlignment.center,
                  crossAxisAlignment: CrossAxisAlignment.end,
                  children: [
                    Text(
                      nf.format(q.price),
                      style: const TextStyle(
                        fontWeight: FontWeight.w700,
                        fontFamily: 'RobotoMono',
                        fontSize: 15,
                      ),
                    ),
                    Text(
                      '${up ? '+' : ''}${q.changePercent.toStringAsFixed(2)}%',
                      style: TextStyle(
                        fontSize: 12,
                        fontWeight: FontWeight.w600,
                        color: color,
                        fontFamily: 'RobotoMono',
                      ),
                    ),
                  ],
                )),
    );
  }
}

String formatRelative(DateTime dt) {
  final d = DateTime.now().difference(dt.toLocal());
  if (d.inMinutes < 1) return 'baru saja';
  if (d.inMinutes < 60) return '${d.inMinutes} mnt lalu';
  if (d.inHours < 24) return '${d.inHours} jam lalu';
  if (d.inDays < 7) return '${d.inDays} hr lalu';
  return DateFormat('d MMM y').format(dt.toLocal());
}

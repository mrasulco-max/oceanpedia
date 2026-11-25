import 'package:fl_chart/fl_chart.dart';
import 'package:material_ui/material_ui.dart';
import 'package:go_router/go_router.dart';
import 'package:intl/intl.dart';
import 'package:provider/provider.dart';

import '../../core/api_exception.dart';
import '../../core/session.dart';
import '../../core/theme.dart';
import '../../data/api_repository.dart';
import '../../data/models/models.dart';
import '../../widgets/ob_widgets.dart';

class MarketDetailScreen extends StatefulWidget {
  const MarketDetailScreen({super.key, required this.symbol});

  final String symbol;

  @override
  State<MarketDetailScreen> createState() => _MarketDetailScreenState();
}

class _MarketDetailScreenState extends State<MarketDetailScreen> {
  InstrumentDetail? _detail;
  List<Candle> _candles = [];
  String _interval = '1day';
  Object? _error;
  bool _loading = true;
  bool _watching = false;
  bool _watchBusy = false;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    setState(() {
      _loading = _detail == null;
      _error = null;
    });
    try {
      final repo = context.read<ApiRepository>();
      final detail = await repo.instrument(widget.symbol);
      final candles = await repo.candles(widget.symbol, interval: _interval);
      var watching = false;
      if (!mounted) return;
      if (context.read<SessionStore>().isLoggedIn) {
        try {
          final wl = await repo.watchlist();
          watching = wl.any((e) => e.instrument.symbol == widget.symbol);
        } catch (_) {}
      }
      if (!mounted) return;
      setState(() {
        _detail = detail;
        _candles = candles;
        _watching = watching;
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

  Future<void> _toggleWatch() async {
    final session = context.read<SessionStore>();
    if (!session.isLoggedIn) {
      context.push('/masuk');
      return;
    }
    setState(() => _watchBusy = true);
    try {
      final repo = context.read<ApiRepository>();
      if (_watching) {
        await repo.removeWatch(widget.symbol);
        setState(() => _watching = false);
      } else {
        await repo.addWatch(widget.symbol);
        setState(() => _watching = true);
      }
    } on ApiException catch (e) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(e.message)));
    } finally {
      if (mounted) setState(() => _watchBusy = false);
    }
  }

  Future<void> _setInterval(String interval) async {
    setState(() => _interval = interval);
    try {
      final candles = await context.read<ApiRepository>().candles(
            widget.symbol,
            interval: interval,
          );
      if (!mounted) return;
      setState(() => _candles = candles);
    } catch (_) {}
  }

  @override
  Widget build(BuildContext context) {
    final d = _detail;
    final q = d?.quote;
    final up = q == null || q.isUp;
    final nf = NumberFormat('#,##0.##');

    return Scaffold(
      body: SafeArea(
        child: Column(
          children: [
            ObAppHeader(
              title: widget.symbol,
              actions: [
                IconButton(
                  onPressed: _watchBusy ? null : _toggleWatch,
                  icon: Icon(
                    _watching ? Icons.star : Icons.star_border,
                    color: _watching ? Colors.amber.shade700 : ObColors.textSecondary,
                  ),
                ),
              ],
            ),
            Expanded(
              child: _loading
                  ? const ObLoading()
                  : _error != null && d == null
                      ? ObErrorView(
                          message: _error is ApiException
                              ? (_error as ApiException).message
                              : 'Gagal memuat instrumen',
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
                                d!.instrument.name,
                                style: const TextStyle(
                                  color: ObColors.textSecondary,
                                  fontSize: 14,
                                ),
                              ),
                              const SizedBox(height: 8),
                              Text(
                                q == null ? '—' : nf.format(q.price),
                                style: const TextStyle(
                                  fontSize: 32,
                                  fontWeight: FontWeight.w800,
                                  fontFamily: 'RobotoMono',
                                ),
                              ),
                              if (q != null)
                                Text(
                                  '${up ? '+' : ''}${q.change.toStringAsFixed(2)} (${up ? '+' : ''}${q.changePercent.toStringAsFixed(2)}%)',
                                  style: TextStyle(
                                    color: up ? ObColors.up : ObColors.down,
                                    fontWeight: FontWeight.w600,
                                    fontFamily: 'RobotoMono',
                                  ),
                                ),
                              const SizedBox(height: 16),
                              SizedBox(
                                height: 36,
                                child: ListView(
                                  scrollDirection: Axis.horizontal,
                                  children: ['1h', '4h', '1day', '1week']
                                      .map((iv) {
                                        final on = _interval == iv;
                                        return Padding(
                                          padding: const EdgeInsets.only(right: 8),
                                          child: ChoiceChip(
                                            label: Text(iv),
                                            selected: on,
                                            onSelected: (_) => _setInterval(iv),
                                            selectedColor: ObColors.brandSoft,
                                            showCheckmark: false,
                                            labelStyle: TextStyle(
                                              color: on ? ObColors.brand : ObColors.textSecondary,
                                              fontWeight: FontWeight.w600,
                                              fontSize: 12,
                                            ),
                                          ),
                                        );
                                      })
                                      .toList(),
                                ),
                              ),
                              const SizedBox(height: 12),
                              SizedBox(
                                height: 220,
                                child: _candles.isEmpty
                                    ? const Center(
                                        child: Text(
                                          'Grafik belum tersedia',
                                          style: TextStyle(color: ObColors.textMuted),
                                        ),
                                      )
                                    : LineChart(
                                        LineChartData(
                                          gridData: const FlGridData(show: false),
                                          titlesData: const FlTitlesData(show: false),
                                          borderData: FlBorderData(show: false),
                                          lineTouchData: const LineTouchData(enabled: true),
                                          lineBarsData: [
                                            LineChartBarData(
                                              spots: [
                                                for (var i = 0; i < _candles.length; i++)
                                                  FlSpot(i.toDouble(), _candles[i].close),
                                              ],
                                              isCurved: true,
                                              color: up ? ObColors.up : ObColors.down,
                                              barWidth: 2,
                                              dotData: const FlDotData(show: false),
                                              belowBarData: BarAreaData(
                                                show: true,
                                                color: (up ? ObColors.up : ObColors.down)
                                                    .withValues(alpha: 0.08),
                                              ),
                                            ),
                                          ],
                                        ),
                                      ),
                              ),
                              if (q != null) ...[
                                const SizedBox(height: 16),
                                _kv('Open', nf.format(q.open)),
                                _kv('High', nf.format(q.high)),
                                _kv('Low', nf.format(q.low)),
                                _kv('Prev close', nf.format(q.previousClose)),
                              ],
                              if (d.news.isNotEmpty) ...[
                                const SizedBox(height: 24),
                                const Text(
                                  'Berita terkait',
                                  style: TextStyle(fontSize: 17, fontWeight: FontWeight.w700),
                                ),
                                const SizedBox(height: 8),
                                ...d.news.take(5).map(
                                      (a) => ListTile(
                                        contentPadding: EdgeInsets.zero,
                                        title: Text(
                                          a.title,
                                          maxLines: 2,
                                          overflow: TextOverflow.ellipsis,
                                          style: const TextStyle(fontWeight: FontWeight.w600),
                                        ),
                                        onTap: () => context.push('/berita/${a.slug}'),
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

  Widget _kv(String k, String v) {
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 6),
      child: Row(
        children: [
          Expanded(child: Text(k, style: const TextStyle(color: ObColors.textSecondary))),
          Text(v, style: const TextStyle(fontFamily: 'RobotoMono', fontWeight: FontWeight.w600)),
        ],
      ),
    );
  }
}

import 'package:material_ui/material_ui.dart';
import 'package:go_router/go_router.dart';
import 'package:provider/provider.dart';

import '../../core/api_exception.dart';
import '../../core/theme.dart';
import '../../data/api_repository.dart';
import '../../data/models/models.dart';
import '../../widgets/ob_widgets.dart';

class MarketScreen extends StatefulWidget {
  const MarketScreen({super.key});

  @override
  State<MarketScreen> createState() => _MarketScreenState();
}

class _MarketScreenState extends State<MarketScreen> {
  List<Instrument> _instruments = [];
  Map<String, Quote> _quotes = {};
  String _filter = 'all';
  Object? _error;
  bool _loading = true;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    setState(() {
      _loading = _instruments.isEmpty;
      _error = null;
    });
    try {
      final repo = context.read<ApiRepository>();
      final list = await repo.instruments();
      final quotes = await repo.quotes(list.map((e) => e.symbol).toList());
      final map = <String, Quote>{};
      for (final q in quotes) {
        if (q.quote != null) map[q.instrument.symbol] = q.quote!;
      }
      if (!mounted) return;
      setState(() {
        _instruments = list;
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

  List<Instrument> get _filtered {
    if (_filter == 'all') return _instruments;
    return _instruments.where((e) => e.assetClass == _filter).toList();
  }

  @override
  Widget build(BuildContext context) {
    final classes = <String>{
      'all',
      ..._instruments.map((e) => e.assetClass).where((e) => e.isNotEmpty),
    }.toList();

    return Scaffold(
      body: SafeArea(
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            const Padding(
              padding: EdgeInsets.fromLTRB(16, 12, 16, 8),
              child: Text(
                'Market',
                style: TextStyle(fontSize: 22, fontWeight: FontWeight.w800),
              ),
            ),
            if (classes.length > 1)
              SizedBox(
                height: 40,
                child: ListView.separated(
                  scrollDirection: Axis.horizontal,
                  padding: const EdgeInsets.symmetric(horizontal: 16),
                  itemCount: classes.length,
                  separatorBuilder: (_, __) => const SizedBox(width: 8),
                  itemBuilder: (_, i) {
                    final c = classes[i];
                    final on = _filter == c;
                    final label = c == 'all' ? 'Semua' : c;
                    return ChoiceChip(
                      label: Text(label),
                      selected: on,
                      onSelected: (_) => setState(() => _filter = c),
                      selectedColor: ObColors.brandSoft,
                      labelStyle: TextStyle(
                        color: on ? ObColors.brand : ObColors.textSecondary,
                        fontWeight: FontWeight.w600,
                        fontSize: 13,
                      ),
                      side: BorderSide(color: on ? ObColors.brand : ObColors.border),
                      backgroundColor: ObColors.white,
                      showCheckmark: false,
                    );
                  },
                ),
              ),
            Expanded(
              child: _loading
                  ? const ObLoading()
                  : _error != null && _instruments.isEmpty
                      ? ObErrorView(
                          message: _error is ApiException
                              ? (_error as ApiException).message
                              : 'Gagal memuat market',
                          onRetry: _load,
                        )
                      : RefreshIndicator(
                          color: ObColors.brand,
                          onRefresh: _load,
                          child: ListView.separated(
                            physics: const AlwaysScrollableScrollPhysics(),
                            itemCount: _filtered.length,
                            separatorBuilder: (_, __) =>
                                const Divider(height: 1, color: ObColors.border),
                            itemBuilder: (_, i) {
                              final inst = _filtered[i];
                              return QuoteRow(
                                symbol: inst.symbol,
                                name: inst.name,
                                quote: _quotes[inst.symbol],
                                onTap: () => context.push('/market/${inst.symbol}'),
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

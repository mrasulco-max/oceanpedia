import 'package:material_ui/material_ui.dart';
import 'package:go_router/go_router.dart';
import 'package:provider/provider.dart';

import '../../core/api_exception.dart';
import '../../core/session.dart';
import '../../core/theme.dart';
import '../../data/api_repository.dart';
import '../../data/models/extra.dart';
import '../../widgets/ob_widgets.dart';

class AlertsScreen extends StatefulWidget {
  const AlertsScreen({super.key});

  @override
  State<AlertsScreen> createState() => _AlertsScreenState();
}

class _AlertsScreenState extends State<AlertsScreen> {
  List<PriceAlert> _items = [];
  Object? _error;
  bool _loading = true;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) => _load());
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
      _loading = _items.isEmpty;
      _error = null;
    });
    try {
      final list = await context.read<ApiRepository>().alerts();
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

  Future<void> _add() async {
    final symbol = TextEditingController();
    final threshold = TextEditingController();
    String condition = 'price_above';
    final ok = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('Alert baru'),
        content: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            TextField(controller: symbol, decoration: const InputDecoration(labelText: 'Simbol')),
            const SizedBox(height: 8),
            DropdownButtonFormField<String>(
              initialValue: condition,
              items: const [
                DropdownMenuItem(value: 'price_above', child: Text('Harga di atas')),
                DropdownMenuItem(value: 'price_below', child: Text('Harga di bawah')),
              ],
              onChanged: (v) => condition = v ?? condition,
              decoration: const InputDecoration(labelText: 'Kondisi'),
            ),
            const SizedBox(height: 8),
            TextField(
              controller: threshold,
              keyboardType: const TextInputType.numberWithOptions(decimal: true),
              decoration: const InputDecoration(labelText: 'Ambang'),
            ),
          ],
        ),
        actions: [
          TextButton(onPressed: () => Navigator.pop(ctx, false), child: const Text('Batal')),
          ElevatedButton(onPressed: () => Navigator.pop(ctx, true), child: const Text('Simpan')),
        ],
      ),
    );
    if (ok != true || !mounted) return;
    try {
      final list = await context.read<ApiRepository>().createAlert(
            symbol: symbol.text.trim().toUpperCase(),
            condition: condition,
            threshold: double.tryParse(threshold.text.replaceAll(',', '.')),
          );
      setState(() => _items = list);
    } on ApiException catch (e) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(e.message)));
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      floatingActionButton: context.watch<SessionStore>().isLoggedIn
          ? FloatingActionButton(
              backgroundColor: ObColors.text,
              onPressed: _add,
              child: const Icon(Icons.add, color: Colors.white),
            )
          : null,
      body: SafeArea(
        child: Column(
          children: [
            const ObAppHeader(title: 'Price alert'),
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
                      : _error != null && _items.isEmpty
                          ? ObErrorView(
                              message: _error is ApiException
                                  ? (_error as ApiException).message
                                  : 'Gagal memuat alert',
                              onRetry: _load,
                            )
                          : RefreshIndicator(
                              onRefresh: _load,
                              child: _items.isEmpty
                                  ? ListView(
                                      children: const [
                                        SizedBox(height: 100),
                                        Center(child: Text('Belum ada alert', style: TextStyle(color: ObColors.textMuted))),
                                      ],
                                    )
                                  : ListView.separated(
                                      itemCount: _items.length,
                                      separatorBuilder: (_, __) => const Divider(height: 1),
                                      itemBuilder: (_, i) {
                                        final a = _items[i];
                                        return ListTile(
                                          title: Text(a.symbol, style: const TextStyle(fontFamily: 'RobotoMono', fontWeight: FontWeight.w700)),
                                          subtitle: Text('${a.condition}${a.threshold != null ? ' ${a.threshold}' : ''}'),
                                          trailing: IconButton(
                                            icon: const Icon(Icons.delete_outline, color: ObColors.error),
                                            onPressed: () async {
                                              await context.read<ApiRepository>().deleteAlert(a.id);
                                              setState(() => _items.removeAt(i));
                                            },
                                          ),
                                          onTap: () => context.push('/market/${a.symbol}'),
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

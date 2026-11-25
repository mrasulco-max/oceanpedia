import 'package:material_ui/material_ui.dart';
import 'package:go_router/go_router.dart';
import 'package:intl/intl.dart';
import 'package:provider/provider.dart';

import '../../core/api_exception.dart';
import '../../core/session.dart';
import '../../core/theme.dart';
import '../../data/api_repository.dart';
import '../../data/models/extra.dart';
import '../../widgets/ob_widgets.dart';

class JournalScreen extends StatefulWidget {
  const JournalScreen({super.key});

  @override
  State<JournalScreen> createState() => _JournalScreenState();
}

class _JournalScreenState extends State<JournalScreen> {
  JournalList? _data;
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
      _loading = _data == null;
      _error = null;
    });
    try {
      final data = await context.read<ApiRepository>().journal();
      if (!mounted) return;
      setState(() {
        _data = data;
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

  Future<void> _create() async {
    final symbol = TextEditingController();
    final entry = TextEditingController();
    final qty = TextEditingController(text: '1');
    String side = 'long';
    String market = 'saham';
    final ok = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('Catatan baru'),
        content: SingleChildScrollView(
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              TextField(controller: symbol, decoration: const InputDecoration(labelText: 'Simbol')),
              DropdownButtonFormField(
                initialValue: market,
                items: const [
                  DropdownMenuItem(value: 'saham', child: Text('Saham')),
                  DropdownMenuItem(value: 'forex', child: Text('Forex')),
                  DropdownMenuItem(value: 'crypto', child: Text('Crypto')),
                  DropdownMenuItem(value: 'komoditas', child: Text('Komoditas')),
                ],
                onChanged: (v) => market = v ?? market,
                decoration: const InputDecoration(labelText: 'Market'),
              ),
              DropdownButtonFormField(
                initialValue: side,
                items: const [
                  DropdownMenuItem(value: 'long', child: Text('Long')),
                  DropdownMenuItem(value: 'short', child: Text('Short')),
                ],
                onChanged: (v) => side = v ?? side,
                decoration: const InputDecoration(labelText: 'Side'),
              ),
              TextField(
                controller: entry,
                keyboardType: const TextInputType.numberWithOptions(decimal: true),
                decoration: const InputDecoration(labelText: 'Entry'),
              ),
              TextField(
                controller: qty,
                keyboardType: const TextInputType.numberWithOptions(decimal: true),
                decoration: const InputDecoration(labelText: 'Quantity / lot'),
              ),
            ],
          ),
        ),
        actions: [
          TextButton(onPressed: () => Navigator.pop(ctx, false), child: const Text('Batal')),
          ElevatedButton(onPressed: () => Navigator.pop(ctx, true), child: const Text('Simpan')),
        ],
      ),
    );
    if (ok != true || !mounted) return;
    try {
      await context.read<ApiRepository>().createJournal({
        'symbol': symbol.text.trim().toUpperCase(),
        'market': market,
        'side': side,
        'entry_price': double.tryParse(entry.text.replaceAll(',', '.')) ?? 0,
        'quantity': double.tryParse(qty.text.replaceAll(',', '.')) ?? 1,
        'opened_at': DateTime.now().toUtc().toIso8601String(),
      });
      _load();
    } on ApiException catch (e) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(e.message)));
    }
  }

  @override
  Widget build(BuildContext context) {
    final nf = NumberFormat('#,##0.##');
    final stats = _data?.stats;
    return Scaffold(
      floatingActionButton: context.watch<SessionStore>().isLoggedIn
          ? FloatingActionButton(
              backgroundColor: ObColors.text,
              onPressed: _create,
              child: const Icon(Icons.add, color: Colors.white),
            )
          : null,
      body: SafeArea(
        child: Column(
          children: [
            const ObAppHeader(title: 'Jurnal Trading'),
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
                      : _error != null && _data == null
                          ? ObErrorView(
                              message: _error is ApiException
                                  ? (_error as ApiException).message
                                  : 'Gagal memuat jurnal',
                              onRetry: _load,
                            )
                          : RefreshIndicator(
                              onRefresh: _load,
                              child: ListView(
                                physics: const AlwaysScrollableScrollPhysics(),
                                padding: const EdgeInsets.fromLTRB(16, 0, 16, 80),
                                children: [
                                  if (stats != null)
                                    Container(
                                      padding: const EdgeInsets.all(14),
                                      margin: const EdgeInsets.only(bottom: 12),
                                      decoration: BoxDecoration(
                                        color: ObColors.surface,
                                        borderRadius: BorderRadius.circular(16),
                                        border: Border.all(color: ObColors.border),
                                      ),
                                      child: Text(
                                        'Total ${stats['total'] ?? 0} · Win ${stats['wins'] ?? 0} · Loss ${stats['losses'] ?? 0}'
                                        '${stats['win_rate'] != null ? ' · WR ${(stats['win_rate'] as num).toStringAsFixed(0)}%' : ''}',
                                        style: const TextStyle(fontWeight: FontWeight.w600),
                                      ),
                                    ),
                                  if (_data!.data.isEmpty)
                                    const Padding(
                                      padding: EdgeInsets.only(top: 60),
                                      child: Center(child: Text('Belum ada catatan', style: TextStyle(color: ObColors.textMuted))),
                                    )
                                  else
                                    ..._data!.data.map((e) {
                                      final pnl = e.pnl;
                                      final up = pnl == null || pnl >= 0;
                                      return ListTile(
                                        contentPadding: EdgeInsets.zero,
                                        title: Text('${e.symbol} · ${e.side.toUpperCase()}', style: const TextStyle(fontWeight: FontWeight.w700)),
                                        subtitle: Text('${e.market} · entry ${nf.format(e.entryPrice)} × ${nf.format(e.quantity)}'),
                                        trailing: Row(
                                          mainAxisSize: MainAxisSize.min,
                                          children: [
                                            if (pnl != null)
                                              Text(
                                                nf.format(pnl),
                                                style: TextStyle(
                                                  color: up ? ObColors.up : ObColors.down,
                                                  fontFamily: 'RobotoMono',
                                                  fontWeight: FontWeight.w700,
                                                ),
                                              ),
                                            IconButton(
                                              icon: const Icon(Icons.delete_outline, color: ObColors.error),
                                              onPressed: () async {
                                                await context.read<ApiRepository>().deleteJournal(e.id);
                                                _load();
                                              },
                                            ),
                                          ],
                                        ),
                                      );
                                    }),
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

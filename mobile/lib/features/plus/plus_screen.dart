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

class PlusScreen extends StatefulWidget {
  const PlusScreen({super.key});

  @override
  State<PlusScreen> createState() => _PlusScreenState();
}

class _PlusScreenState extends State<PlusScreen> {
  List<PlanInfo> _plans = [];
  Object? _error;
  bool _loading = true;
  bool _busy = false;

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
      final plans = await context.read<ApiRepository>().plans();
      if (!mounted) return;
      setState(() {
        _plans = plans;
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

  Future<void> _checkout(PlanInfo plan) async {
    final session = context.read<SessionStore>();
    if (!session.isLoggedIn) {
      context.push('/masuk');
      return;
    }
    setState(() => _busy = true);
    try {
      final res = await context.read<ApiRepository>().checkout(planCode: plan.code);
      if (!mounted) return;
      if (res.payUrl != null && res.payUrl!.isNotEmpty) {
        context.push('/plus/bayar', extra: {
          'url': res.payUrl,
          'invoiceId': res.invoiceId,
        });
      } else if (res.invoiceId != null) {
        context.push('/plus/menunggu', extra: res.invoiceId);
      }
    } on ApiException catch (e) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(e.message)));
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final nf = NumberFormat.currency(locale: 'id_ID', symbol: 'Rp', decimalDigits: 0);
    final isPlus = context.watch<SessionStore>().isPlus;
    return Scaffold(
      body: SafeArea(
        child: Column(
          children: [
            const ObAppHeader(title: 'OceanPedia Plus'),
            Expanded(
              child: _loading
                  ? const ObLoading()
                  : _error != null && _plans.isEmpty
                      ? ObErrorView(
                          message: _error is ApiException
                              ? (_error as ApiException).message
                              : 'Gagal memuat paket',
                          onRetry: _load,
                        )
                      : ListView(
                          padding: const EdgeInsets.fromLTRB(16, 8, 16, 32),
                          children: [
                            if (isPlus)
                              Container(
                                padding: const EdgeInsets.all(16),
                                margin: const EdgeInsets.only(bottom: 16),
                                decoration: BoxDecoration(
                                  color: ObColors.brandSoft,
                                  borderRadius: BorderRadius.circular(16),
                                ),
                                child: const Text(
                                  'Kamu sudah berlangganan Plus.',
                                  style: TextStyle(color: ObColors.brand, fontWeight: FontWeight.w600),
                                ),
                              ),
                            ..._plans.map(
                              (p) => Container(
                                margin: const EdgeInsets.only(bottom: 12),
                                padding: const EdgeInsets.all(16),
                                decoration: BoxDecoration(
                                  border: Border.all(color: ObColors.border),
                                  borderRadius: BorderRadius.circular(18),
                                ),
                                child: Column(
                                  crossAxisAlignment: CrossAxisAlignment.start,
                                  children: [
                                    Text(p.name, style: const TextStyle(fontSize: 18, fontWeight: FontWeight.w800)),
                                    const SizedBox(height: 4),
                                    Text(
                                      '${nf.format(p.priceAmount / 100)} / ${p.billingPeriod}',
                                      style: const TextStyle(color: ObColors.brand, fontWeight: FontWeight.w700),
                                    ),
                                    const SizedBox(height: 8),
                                    ...p.features.take(5).map(
                                          (f) => Padding(
                                            padding: const EdgeInsets.only(bottom: 4),
                                            child: Row(
                                              children: [
                                                const Icon(Icons.check, size: 16, color: ObColors.up),
                                                const SizedBox(width: 6),
                                                Expanded(child: Text(f, style: const TextStyle(fontSize: 13))),
                                              ],
                                            ),
                                          ),
                                        ),
                                    const SizedBox(height: 12),
                                    ElevatedButton(
                                      onPressed: _busy || isPlus ? null : () => _checkout(p),
                                      child: Text(isPlus ? 'Aktif' : 'Berlangganan'),
                                    ),
                                  ],
                                ),
                              ),
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

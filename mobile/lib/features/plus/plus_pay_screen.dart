import 'dart:async';

import 'package:material_ui/material_ui.dart';
import 'package:go_router/go_router.dart';
import 'package:provider/provider.dart';
import 'package:webview_flutter/webview_flutter.dart';

import '../../core/theme.dart';
import '../../data/api_repository.dart';
import '../../widgets/ob_widgets.dart';

class PlusPayScreen extends StatefulWidget {
  const PlusPayScreen({super.key, required this.url, this.invoiceId});

  final String url;
  final String? invoiceId;

  @override
  State<PlusPayScreen> createState() => _PlusPayScreenState();
}

class _PlusPayScreenState extends State<PlusPayScreen> {
  late final WebViewController _web;

  @override
  void initState() {
    super.initState();
    _web = WebViewController()
      ..setJavaScriptMode(JavaScriptMode.unrestricted)
      ..setNavigationDelegate(
        NavigationDelegate(
          onNavigationRequest: (req) {
            final u = req.url;
            if (u.contains('menunggu-pembayaran') || u.contains('/plus/sukses')) {
              final inv = widget.invoiceId;
              if (inv != null) {
                context.go('/plus/menunggu', extra: inv);
              }
              return NavigationDecision.prevent;
            }
            return NavigationDecision.navigate;
          },
        ),
      )
      ..loadRequest(Uri.parse(widget.url));
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      body: SafeArea(
        child: Column(
          children: [
            ObAppHeader(
              title: 'Pembayaran',
              actions: [
                if (widget.invoiceId != null)
                  TextButton(
                    onPressed: () => context.push('/plus/menunggu', extra: widget.invoiceId),
                    child: const Text('Status'),
                  ),
              ],
            ),
            Expanded(child: WebViewWidget(controller: _web)),
          ],
        ),
      ),
    );
  }
}

class PlusWaitingScreen extends StatefulWidget {
  const PlusWaitingScreen({super.key, required this.invoiceId});

  final String invoiceId;

  @override
  State<PlusWaitingScreen> createState() => _PlusWaitingScreenState();
}

class _PlusWaitingScreenState extends State<PlusWaitingScreen> {
  String _status = 'pending';
  Timer? _timer;
  bool _loading = true;

  @override
  void initState() {
    super.initState();
    _tick();
    _timer = Timer.periodic(const Duration(seconds: 4), (_) => _tick());
  }

  @override
  void dispose() {
    _timer?.cancel();
    super.dispose();
  }

  Future<void> _tick() async {
    try {
      final repo = context.read<ApiRepository>();
      var inv = await repo.refreshInvoice(widget.invoiceId);
      inv = await repo.invoice(widget.invoiceId);
      if (!mounted) return;
      setState(() {
        _status = inv.status;
        _loading = false;
      });
      if (inv.isPaid) {
        _timer?.cancel();
        await repo.me();
      }
    } catch (_) {
      if (mounted) setState(() => _loading = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final paid = _status == 'paid' || _status == 'settlement' || _status == 'success';
    return Scaffold(
      body: SafeArea(
        child: Column(
          children: [
            const ObAppHeader(title: 'Menunggu pembayaran'),
            Expanded(
              child: Center(
                child: Padding(
                  padding: const EdgeInsets.all(24),
                  child: Column(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      if (_loading)
                        const CircularProgressIndicator(color: ObColors.brand)
                      else
                        Icon(
                          paid ? Icons.check_circle : Icons.hourglass_top,
                          size: 56,
                          color: paid ? ObColors.up : ObColors.brand,
                        ),
                      const SizedBox(height: 16),
                      Text(
                        paid ? 'Pembayaran berhasil' : 'Status: $_status',
                        style: const TextStyle(fontSize: 18, fontWeight: FontWeight.w700),
                        textAlign: TextAlign.center,
                      ),
                      const SizedBox(height: 16),
                      ElevatedButton(
                        onPressed: () => context.go(paid ? '/akun' : '/plus'),
                        child: Text(paid ? 'Ke Akun' : 'Kembali ke Plus'),
                      ),
                    ],
                  ),
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }
}

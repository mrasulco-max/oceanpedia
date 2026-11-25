import 'package:material_ui/material_ui.dart';
import 'package:go_router/go_router.dart';
import 'package:provider/provider.dart';

import '../../core/api_exception.dart';
import '../../core/theme.dart';
import '../../data/api_repository.dart';

class VerifyScreen extends StatefulWidget {
  const VerifyScreen({
    super.key,
    required this.email,
    this.challenge,
    this.maskedEmail,
  });

  final String email;
  final String? challenge;
  final String? maskedEmail;

  @override
  State<VerifyScreen> createState() => _VerifyScreenState();
}

class _VerifyScreenState extends State<VerifyScreen> {
  final _code = TextEditingController();
  bool _busy = false;
  String? _error;

  @override
  void dispose() {
    _code.dispose();
    super.dispose();
  }

  Future<void> _submit() async {
    setState(() {
      _busy = true;
      _error = null;
    });
    try {
      await context.read<ApiRepository>().verify(
            email: widget.email,
            code: _code.text.trim(),
            challenge: widget.challenge,
          );
      if (!mounted) return;
      context.go('/');
    } on ApiException catch (e) {
      setState(() => _error = e.errors['code'] ?? e.message);
    } catch (e) {
      setState(() => _error = e.toString());
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<void> _resend() async {
    try {
      await context.read<ApiRepository>().resendOtp(widget.email);
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Kode baru dikirim')),
      );
    } on ApiException catch (e) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(e.message)));
    }
  }

  @override
  Widget build(BuildContext context) {
    final target = widget.maskedEmail ?? widget.email;
    return Scaffold(
      body: SafeArea(
        child: ListView(
          padding: const EdgeInsets.fromLTRB(24, 24, 24, 40),
          children: [
            Align(
              alignment: Alignment.centerLeft,
              child: IconButton(
                onPressed: () => context.pop(),
                icon: const Icon(Icons.chevron_left, size: 28),
              ),
            ),
            const SizedBox(height: 12),
            const Text(
              'Verifikasi',
              style: TextStyle(fontSize: 28, fontWeight: FontWeight.w800),
            ),
            const SizedBox(height: 8),
            Text(
              'Masukkan kode yang dikirim ke $target',
              style: const TextStyle(color: ObColors.textSecondary),
            ),
            const SizedBox(height: 28),
            TextField(
              controller: _code,
              keyboardType: TextInputType.number,
              textInputAction: TextInputAction.done,
              decoration: const InputDecoration(labelText: 'Kode OTP'),
              onSubmitted: (_) => _submit(),
            ),
            if (_error != null) ...[
              const SizedBox(height: 12),
              Text(_error!, style: const TextStyle(color: ObColors.error)),
            ],
            const SizedBox(height: 24),
            ElevatedButton(
              onPressed: _busy ? null : _submit,
              child: _busy
                  ? const SizedBox(
                      height: 22,
                      width: 22,
                      child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white),
                    )
                  : const Text('Verifikasi'),
            ),
            TextButton(onPressed: _resend, child: const Text('Kirim ulang kode')),
          ],
        ),
      ),
    );
  }
}

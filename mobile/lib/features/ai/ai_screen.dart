import 'dart:io';

import 'package:file_picker/file_picker.dart';
import 'package:material_ui/material_ui.dart';
import 'package:go_router/go_router.dart';
import 'package:provider/provider.dart';

import '../../core/api_exception.dart';
import '../../core/session.dart';
import '../../core/theme.dart';
import '../../data/api_repository.dart';
import '../../widgets/ob_widgets.dart';

class AiScreen extends StatefulWidget {
  const AiScreen({super.key});

  @override
  State<AiScreen> createState() => _AiScreenState();
}

class _AiScreenState extends State<AiScreen> {
  final _input = TextEditingController();
  final _messages = <({bool me, String text})>[];
  bool _busy = false;

  @override
  void dispose() {
    _input.dispose();
    super.dispose();
  }

  Future<void> _send() async {
    final session = context.read<SessionStore>();
    if (!session.isLoggedIn) {
      context.push('/masuk');
      return;
    }
    if (!session.isPlus) {
      context.push('/plus');
      return;
    }
    final text = _input.text.trim();
    if (text.isEmpty || _busy) return;
    setState(() {
      _messages.add((me: true, text: text));
      _input.clear();
      _busy = true;
    });
    try {
      final history = _messages
          .map((m) => {'role': m.me ? 'user' : 'assistant', 'content': m.text})
          .toList();
      final res = await context.read<ApiRepository>().aiChat(history);
      if (!mounted) return;
      setState(() => _messages.add((me: false, text: res.answer)));
    } on ApiException catch (e) {
      if (!mounted) return;
      if (e.status == 403) {
        context.push('/plus');
      }
      setState(() => _messages.add((me: false, text: e.message)));
    } catch (e) {
      setState(() => _messages.add((me: false, text: '$e')));
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<void> _chart() async {
    final session = context.read<SessionStore>();
    if (!session.isPlus) {
      context.push('/plus');
      return;
    }
    final pick = await FilePicker.platform.pickFiles(type: FileType.image);
    if (pick == null || pick.files.single.path == null) return;
    setState(() => _busy = true);
    try {
      final repo = context.read<ApiRepository>();
      final res = await repo.aiChart(File(pick.files.single.path!));
      if (!mounted) return;
      setState(() => _messages.add((me: false, text: res.answer)));
    } on ApiException catch (e) {
      if (!mounted) return;
      final messenger = ScaffoldMessenger.of(context);
      messenger.showSnackBar(SnackBar(content: Text(e.message)));
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final plus = context.watch<SessionStore>().isPlus;
    return Scaffold(
      body: SafeArea(
        child: Column(
          children: [
            ObAppHeader(
              title: 'Aurora AI',
              actions: [
                IconButton(
                  onPressed: _busy ? null : _chart,
                  icon: const Icon(Icons.image_outlined),
                  tooltip: 'Analisis chart',
                ),
              ],
            ),
            if (!plus)
              MaterialBanner(
                content: const Text('Aurora AI khusus pelanggan Plus.'),
                actions: [
                  TextButton(onPressed: () => context.push('/plus'), child: const Text('Lihat Plus')),
                ],
              ),
            Expanded(
              child: _messages.isEmpty
                  ? const Center(
                      child: Text(
                        'Tanyakan analisis berita atau market.',
                        style: TextStyle(color: ObColors.textMuted),
                      ),
                    )
                  : ListView.builder(
                      padding: const EdgeInsets.all(16),
                      itemCount: _messages.length,
                      itemBuilder: (_, i) {
                        final m = _messages[i];
                        return Align(
                          alignment: m.me ? Alignment.centerRight : Alignment.centerLeft,
                          child: Container(
                            margin: const EdgeInsets.only(bottom: 10),
                            padding: const EdgeInsets.all(12),
                            constraints: BoxConstraints(maxWidth: MediaQuery.sizeOf(context).width * 0.82),
                            decoration: BoxDecoration(
                              color: m.me ? ObColors.brandSoft : ObColors.surface,
                              borderRadius: BorderRadius.circular(14),
                            ),
                            child: Text(m.text),
                          ),
                        );
                      },
                    ),
            ),
            Padding(
              padding: const EdgeInsets.fromLTRB(12, 0, 12, 12),
              child: Row(
                children: [
                  Expanded(
                    child: TextField(
                      controller: _input,
                      enabled: !_busy,
                      decoration: const InputDecoration(hintText: 'Tulis pertanyaan…'),
                      onSubmitted: (_) => _send(),
                    ),
                  ),
                  IconButton(
                    onPressed: _busy ? null : _send,
                    icon: _busy
                        ? const SizedBox(
                            width: 20,
                            height: 20,
                            child: CircularProgressIndicator(strokeWidth: 2, color: ObColors.brand),
                          )
                        : const Icon(Icons.send, color: ObColors.brand),
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

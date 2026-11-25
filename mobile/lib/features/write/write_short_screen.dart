import 'dart:io';

import 'package:image_picker/image_picker.dart';
import 'package:material_ui/material_ui.dart';
import 'package:go_router/go_router.dart';
import 'package:provider/provider.dart';

import '../../core/api_exception.dart';
import '../../core/session.dart';
import '../../core/theme.dart';
import '../../data/api_repository.dart';
import '../../widgets/ob_widgets.dart';

class WriteShortScreen extends StatefulWidget {
  const WriteShortScreen({super.key});

  @override
  State<WriteShortScreen> createState() => _WriteShortScreenState();
}

class _WriteShortScreenState extends State<WriteShortScreen> {
  final _title = TextEditingController();
  final _caption = TextEditingController();
  final _videoUrl = TextEditingController();
  final _symbol = TextEditingController();
  File? _cover;
  bool _busy = false;
  String? _error;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (!mounted) return;
      if (!context.read<SessionStore>().canWrite) context.go('/akun');
    });
  }

  @override
  void dispose() {
    _title.dispose();
    _caption.dispose();
    _videoUrl.dispose();
    _symbol.dispose();
    super.dispose();
  }

  Future<void> _submit() async {
    setState(() {
      _busy = true;
      _error = null;
    });
    try {
      final repo = context.read<ApiRepository>();
      String? coverUrl;
      if (_cover != null) {
        final id = await repo.uploadAdminMedia(_cover!);
        coverUrl = id.startsWith('http') ? id : null;
        // API may expect cover_url absolute; if id UUID, use media path.
        coverUrl ??= '${repo.api.dio.options.baseUrl}/v1/media/$id';
      }
      await repo.createAdminShort({
        'title': _title.text.trim(),
        'caption': _caption.text.trim(),
        'video_url': _videoUrl.text.trim(),
        if (coverUrl != null) 'cover_url': coverUrl,
        if (_symbol.text.trim().isNotEmpty) 'symbol': _symbol.text.trim().toUpperCase(),
        'status': 'published',
      });
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('Short dibuat')));
      context.pop();
    } on ApiException catch (e) {
      setState(() => _error = e.errors.values.isNotEmpty ? e.errors.values.first : e.message);
    } catch (e) {
      setState(() => _error = '$e');
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      body: SafeArea(
        child: Column(
          children: [
            const ObAppHeader(title: 'Unggah Short'),
            Expanded(
              child: ListView(
                padding: const EdgeInsets.fromLTRB(16, 8, 16, 32),
                children: [
                  TextField(controller: _title, decoration: const InputDecoration(labelText: 'Judul')),
                  const SizedBox(height: 12),
                  TextField(
                    controller: _caption,
                    minLines: 3,
                    maxLines: 5,
                    decoration: const InputDecoration(labelText: 'Caption'),
                  ),
                  const SizedBox(height: 12),
                  TextField(
                    controller: _videoUrl,
                    decoration: const InputDecoration(
                      labelText: 'URL video (https / YouTube / TikTok)',
                    ),
                  ),
                  const SizedBox(height: 12),
                  TextField(controller: _symbol, decoration: const InputDecoration(labelText: 'Simbol (opsional)')),
                  const SizedBox(height: 12),
                  OutlinedButton.icon(
                    onPressed: () async {
                      final x = await ImagePicker().pickImage(source: ImageSource.gallery, imageQuality: 85);
                      if (x != null) setState(() => _cover = File(x.path));
                    },
                    icon: const Icon(Icons.image_outlined),
                    label: Text(_cover == null ? 'Pilih sampul' : 'Ganti sampul'),
                  ),
                  if (_error != null) ...[
                    const SizedBox(height: 12),
                    Text(_error!, style: const TextStyle(color: ObColors.error)),
                  ],
                  const SizedBox(height: 16),
                  ElevatedButton(
                    onPressed: _busy ? null : _submit,
                    child: Text(_busy ? 'Mengirim…' : 'Publikasikan'),
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

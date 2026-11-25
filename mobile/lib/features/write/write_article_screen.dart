import 'dart:io';

import 'package:image_picker/image_picker.dart';
import 'package:material_ui/material_ui.dart';
import 'package:go_router/go_router.dart';
import 'package:provider/provider.dart';

import '../../core/api_exception.dart';
import '../../core/session.dart';
import '../../core/theme.dart';
import '../../data/api_repository.dart';
import '../../data/models/models.dart';
import '../../widgets/ob_widgets.dart';

class WriteArticleScreen extends StatefulWidget {
  const WriteArticleScreen({super.key});

  @override
  State<WriteArticleScreen> createState() => _WriteArticleScreenState();
}

class _WriteArticleScreenState extends State<WriteArticleScreen> {
  final _title = TextEditingController();
  final _body = TextEditingController();
  final _symbols = TextEditingController();
  List<Category> _cats = [];
  String? _category;
  File? _cover;
  String? _coverId;
  bool _busy = false;
  String? _error;

  @override
  void initState() {
    super.initState();
    _boot();
  }

  Future<void> _boot() async {
    if (!context.read<SessionStore>().canWrite) {
      WidgetsBinding.instance.addPostFrameCallback((_) {
        if (mounted) context.go('/akun');
      });
      return;
    }
    try {
      final cats = await context.read<ApiRepository>().categories();
      if (!mounted) return;
      setState(() {
        _cats = cats;
        if (cats.isNotEmpty) _category = cats.first.slug;
      });
    } catch (_) {}
  }

  @override
  void dispose() {
    _title.dispose();
    _body.dispose();
    _symbols.dispose();
    super.dispose();
  }

  Future<void> _pickCover() async {
    final x = await ImagePicker().pickImage(source: ImageSource.gallery, imageQuality: 85);
    if (x == null) return;
    setState(() => _cover = File(x.path));
  }

  Future<void> _submit(String action) async {
    setState(() {
      _busy = true;
      _error = null;
    });
    try {
      final repo = context.read<ApiRepository>();
      if (_cover != null && (_coverId == null || _coverId!.isEmpty)) {
        _coverId = await repo.uploadAdminMedia(_cover!);
      }
      final symbols = _symbols.text
          .split(RegExp(r'[\s,]+'))
          .map((e) => e.trim().toUpperCase())
          .where((e) => e.isNotEmpty)
          .toList();
      await repo.createAdminArticle({
        'title': _title.text.trim(),
        'body': _body.text.trim(),
        'category': _category,
        'action': action,
        if (_coverId != null && _coverId!.isNotEmpty) 'cover_id': _coverId,
        if (_coverId != null && _coverId!.startsWith('http')) 'cover_url': _coverId,
        if (symbols.isNotEmpty) 'symbols': symbols,
      });
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text(action == 'publish' ? 'Artikel diterbitkan' : 'Draft disimpan')),
      );
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
            const ObAppHeader(title: 'Tulis artikel'),
            Expanded(
              child: ListView(
                padding: const EdgeInsets.fromLTRB(16, 8, 16, 32),
                children: [
                  TextField(controller: _title, decoration: const InputDecoration(labelText: 'Judul')),
                  const SizedBox(height: 12),
                  if (_cats.isNotEmpty)
                    DropdownButtonFormField<String>(
                      initialValue: _category,
                      items: _cats
                          .map((c) => DropdownMenuItem(value: c.slug, child: Text(c.name)))
                          .toList(),
                      onChanged: (v) => setState(() => _category = v),
                      decoration: const InputDecoration(labelText: 'Kategori'),
                    ),
                  const SizedBox(height: 12),
                  TextField(
                    controller: _body,
                    minLines: 8,
                    maxLines: 16,
                    decoration: const InputDecoration(labelText: 'Isi (teks polos)'),
                  ),
                  const SizedBox(height: 12),
                  TextField(
                    controller: _symbols,
                    decoration: const InputDecoration(labelText: 'Simbol terkait (pisah koma)'),
                  ),
                  const SizedBox(height: 12),
                  OutlinedButton.icon(
                    onPressed: _pickCover,
                    icon: const Icon(Icons.image_outlined),
                    label: Text(_cover == null ? 'Pilih sampul' : 'Ganti sampul'),
                  ),
                  if (_error != null) ...[
                    const SizedBox(height: 12),
                    Text(_error!, style: const TextStyle(color: ObColors.error)),
                  ],
                  const SizedBox(height: 16),
                  ElevatedButton(
                    onPressed: _busy ? null : () => _submit('draft'),
                    child: const Text('Simpan draft'),
                  ),
                  const SizedBox(height: 8),
                  OutlinedButton(
                    onPressed: _busy ? null : () => _submit('publish'),
                    child: const Text('Terbitkan'),
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

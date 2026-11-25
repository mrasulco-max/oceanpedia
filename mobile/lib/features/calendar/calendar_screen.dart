import 'package:material_ui/material_ui.dart';
import 'package:intl/intl.dart';
import 'package:provider/provider.dart';

import '../../core/api_exception.dart';
import '../../core/theme.dart';
import '../../data/api_repository.dart';
import '../../data/models/models.dart';
import '../../widgets/ob_widgets.dart';

class CalendarScreen extends StatefulWidget {
  const CalendarScreen({super.key});

  @override
  State<CalendarScreen> createState() => _CalendarScreenState();
}

class _CalendarScreenState extends State<CalendarScreen> {
  List<EconomicEvent> _events = [];
  Object? _error;
  bool _loading = true;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    setState(() {
      _loading = _events.isEmpty;
      _error = null;
    });
    try {
      final list = await context.read<ApiRepository>().events();
      if (!mounted) return;
      setState(() {
        _events = list;
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

  Color _impactColor(String impact) {
    switch (impact.toLowerCase()) {
      case 'high':
        return ObColors.down;
      case 'medium':
        return Colors.orange.shade700;
      default:
        return ObColors.textMuted;
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      body: SafeArea(
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            const Padding(
              padding: EdgeInsets.fromLTRB(16, 12, 16, 8),
              child: Text(
                'Kalender',
                style: TextStyle(fontSize: 22, fontWeight: FontWeight.w800),
              ),
            ),
            Expanded(
              child: _loading
                  ? const ObLoading()
                  : _error != null && _events.isEmpty
                      ? ObErrorView(
                          message: _error is ApiException
                              ? (_error as ApiException).message
                              : 'Gagal memuat kalender',
                          onRetry: _load,
                        )
                      : RefreshIndicator(
                          color: ObColors.brand,
                          onRefresh: _load,
                          child: _events.isEmpty
                              ? ListView(
                                  physics: const AlwaysScrollableScrollPhysics(),
                                  children: const [
                                    SizedBox(height: 120),
                                    Center(
                                      child: Text(
                                        'Tidak ada event',
                                        style: TextStyle(color: ObColors.textMuted),
                                      ),
                                    ),
                                  ],
                                )
                              : ListView.separated(
                                  physics: const AlwaysScrollableScrollPhysics(),
                                  itemCount: _events.length,
                                  separatorBuilder: (_, __) =>
                                      const Divider(height: 1, color: ObColors.border),
                                  itemBuilder: (_, i) {
                                    final e = _events[i];
                                    final t = e.scheduledAt.toLocal();
                                    return ListTile(
                                      contentPadding: const EdgeInsets.symmetric(
                                        horizontal: 16,
                                        vertical: 6,
                                      ),
                                      leading: Column(
                                        mainAxisAlignment: MainAxisAlignment.center,
                                        children: [
                                          Text(
                                            DateFormat('HH:mm').format(t),
                                            style: const TextStyle(
                                              fontWeight: FontWeight.w700,
                                              fontFamily: 'RobotoMono',
                                              fontSize: 13,
                                            ),
                                          ),
                                          Text(
                                            DateFormat('d MMM').format(t),
                                            style: const TextStyle(
                                              fontSize: 11,
                                              color: ObColors.textMuted,
                                            ),
                                          ),
                                        ],
                                      ),
                                      title: Text(
                                        e.title,
                                        style: const TextStyle(fontWeight: FontWeight.w600),
                                      ),
                                      subtitle: Text(
                                        [
                                          e.country.toUpperCase(),
                                          e.impact,
                                          if (e.forecast != null) 'F: ${e.forecast}',
                                          if (e.previous != null) 'P: ${e.previous}',
                                        ].join(' · '),
                                        style: const TextStyle(fontSize: 12),
                                      ),
                                      trailing: Container(
                                        width: 10,
                                        height: 10,
                                        decoration: BoxDecoration(
                                          color: _impactColor(e.impact),
                                          shape: BoxShape.circle,
                                        ),
                                      ),
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

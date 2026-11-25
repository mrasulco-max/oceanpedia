import 'package:material_ui/material_ui.dart';
import 'package:go_router/go_router.dart';
import 'package:provider/provider.dart';

import 'core/api_client.dart';
import 'core/router.dart';
import 'core/session.dart';
import 'core/theme.dart';
import 'data/api_repository.dart';

class OceanPediaApp extends StatefulWidget {
  const OceanPediaApp({super.key, required this.session});

  final SessionStore session;

  @override
  State<OceanPediaApp> createState() => _OceanPediaAppState();
}

class _OceanPediaAppState extends State<OceanPediaApp> {
  late final ApiClient _api;
  late final ApiRepository _repo;
  late final GoRouter _router;

  @override
  void initState() {
    super.initState();
    _api = ApiClient(session: widget.session);
    _repo = ApiRepository(_api, widget.session);
    _router = createRouter();
  }

  @override
  Widget build(BuildContext context) {
    return MultiProvider(
      providers: [
        ChangeNotifierProvider.value(value: widget.session),
        Provider.value(value: _api),
        Provider.value(value: _repo),
      ],
      child: MaterialApp.router(
        title: 'OceanPedia',
        debugShowCheckedModeBanner: false,
        theme: buildObTheme(),
        routerConfig: _router,
      ),
    );
  }
}

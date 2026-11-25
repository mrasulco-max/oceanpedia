import 'package:go_router/go_router.dart';

import '../features/account/account_screen.dart';
import '../features/admin/dashboard_screen.dart';
import '../features/ai/ai_screen.dart';
import '../features/alerts/alerts_screen.dart';
import '../features/article/article_screen.dart';
import '../features/auth/login_screen.dart';
import '../features/auth/register_screen.dart';
import '../features/auth/verify_screen.dart';
import '../features/calendar/calendar_screen.dart';
import '../features/home/home_screen.dart';
import '../features/journal/journal_screen.dart';
import '../features/live/live_screen.dart';
import '../features/market/market_detail_screen.dart';
import '../features/market/market_screen.dart';
import '../features/notifications/notifications_screen.dart';
import '../features/plus/plus_pay_screen.dart';
import '../features/plus/plus_screen.dart';
import '../features/saved/saved_screen.dart';
import '../features/search/search_screen.dart';
import '../features/settings/settings_screen.dart';
import '../features/shell/app_shell.dart';
import '../features/shorts/shorts_screen.dart';
import '../features/watchlist/watchlist_screen.dart';
import '../features/write/write_article_screen.dart';
import '../features/write/write_short_screen.dart';

GoRouter createRouter() {
  return GoRouter(
    initialLocation: '/',
    routes: [
      StatefulShellRoute.indexedStack(
        builder: (context, state, navigationShell) =>
            AppShell(navigationShell: navigationShell),
        branches: [
          StatefulShellBranch(
            routes: [
              GoRoute(path: '/', builder: (context, state) => const HomeScreen()),
            ],
          ),
          StatefulShellBranch(
            routes: [
              GoRoute(path: '/market', builder: (context, state) => const MarketScreen()),
            ],
          ),
          StatefulShellBranch(
            routes: [
              GoRoute(path: '/cari', builder: (context, state) => const SearchScreen()),
            ],
          ),
          StatefulShellBranch(
            routes: [
              GoRoute(path: '/kalender', builder: (context, state) => const CalendarScreen()),
            ],
          ),
          StatefulShellBranch(
            routes: [
              GoRoute(path: '/akun', builder: (context, state) => const AccountScreen()),
            ],
          ),
        ],
      ),
      GoRoute(
        path: '/berita/:slug',
        builder: (context, state) => ArticleScreen(slug: state.pathParameters['slug']!),
      ),
      GoRoute(
        path: '/market/:symbol',
        builder: (context, state) =>
            MarketDetailScreen(symbol: state.pathParameters['symbol']!),
      ),
      GoRoute(path: '/masuk', builder: (context, state) => const LoginScreen()),
      GoRoute(path: '/daftar', builder: (context, state) => const RegisterScreen()),
      GoRoute(
        path: '/verifikasi',
        builder: (context, state) {
          final extra = state.extra;
          String email = '';
          String? challenge;
          String? masked;
          if (extra is Map) {
            email = extra['email']?.toString() ?? '';
            challenge = extra['challenge']?.toString();
            masked = extra['masked']?.toString();
          }
          return VerifyScreen(email: email, challenge: challenge, maskedEmail: masked);
        },
      ),
      GoRoute(path: '/watchlist', builder: (context, state) => const WatchlistScreen()),
      GoRoute(path: '/notifikasi', builder: (context, state) => const NotificationsScreen()),
      GoRoute(
        path: '/short',
        builder: (context, state) => ShortsScreen(initialId: state.uri.queryParameters['v']),
      ),
      GoRoute(path: '/live', builder: (context, state) => const LiveScreen()),
      GoRoute(path: '/tersimpan', builder: (context, state) => const SavedScreen()),
      GoRoute(path: '/alert', builder: (context, state) => const AlertsScreen()),
      GoRoute(path: '/pengaturan', builder: (context, state) => const SettingsScreen()),
      GoRoute(path: '/plus', builder: (context, state) => const PlusScreen()),
      GoRoute(
        path: '/plus/bayar',
        builder: (context, state) {
          final extra = state.extra;
          String url = '';
          String? inv;
          if (extra is Map) {
            url = extra['url']?.toString() ?? '';
            inv = extra['invoiceId']?.toString();
          }
          return PlusPayScreen(url: url, invoiceId: inv);
        },
      ),
      GoRoute(
        path: '/plus/menunggu',
        builder: (context, state) =>
            PlusWaitingScreen(invoiceId: (state.extra ?? '').toString()),
      ),
      GoRoute(path: '/ai', builder: (context, state) => const AiScreen()),
      GoRoute(path: '/jurnal', builder: (context, state) => const JournalScreen()),
      GoRoute(path: '/tulis/artikel', builder: (context, state) => const WriteArticleScreen()),
      GoRoute(path: '/tulis/short', builder: (context, state) => const WriteShortScreen()),
      GoRoute(path: '/redaksi', builder: (context, state) => const AdminDashboardScreen()),
    ],
  );
}

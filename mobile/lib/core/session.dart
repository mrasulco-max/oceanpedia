import 'dart:convert';

import 'package:flutter/foundation.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';

import '../data/models/models.dart';

/// Menyimpan token & profil pengguna di secure storage.
class SessionStore extends ChangeNotifier {
  SessionStore({FlutterSecureStorage? storage})
      : _storage = storage ?? const FlutterSecureStorage();

  static const _kAccess = 'ob_at';
  static const _kRefresh = 'ob_rt';
  static const _kDevice = 'ob_td';
  static const _kUser = 'ob_user_json';

  final FlutterSecureStorage _storage;

  String? accessToken;
  String? refreshToken;
  String? deviceToken;
  UserProfile? user;
  bool ready = false;

  bool get isLoggedIn =>
      accessToken != null && accessToken!.isNotEmpty && user != null;

  bool hasPerm(String p) => user?.hasPerm(p) == true;

  bool get canWrite => hasPerm('content.write');

  bool get isPlus => user?.isPlus == true || user?.isStaff == true;

  Future<void> load() async {
    accessToken = await _storage.read(key: _kAccess);
    refreshToken = await _storage.read(key: _kRefresh);
    deviceToken = await _storage.read(key: _kDevice);
    final raw = await _storage.read(key: _kUser);
    if (raw != null && raw.isNotEmpty) {
      try {
        if (raw.startsWith('{')) {
          user = UserProfile.fromJson(
            Map<String, dynamic>.from(jsonDecode(raw) as Map),
          );
        } else {
          // Legacy pipe format.
          final parts = raw.split('\u001f');
          if (parts.length >= 4) {
            user = UserProfile(
              id: parts[0],
              email: parts[1],
              fullName: parts[2],
              role: parts[3],
              plan: parts.length > 4 && parts[4].isNotEmpty ? parts[4] : null,
            );
          }
        }
      } catch (_) {
        user = null;
      }
    }
    ready = true;
    notifyListeners();
  }

  Future<void> _persistUser(UserProfile u) async {
    await _storage.write(
      key: _kUser,
      value: jsonEncode({
        'id': u.id,
        'email': u.email,
        'full_name': u.fullName,
        'role': u.role,
        'plan': u.plan,
        'role_name': u.roleName,
        'is_staff': u.isStaff,
        'avatar_id': u.avatarId,
        'permissions': u.permissions,
      }),
    );
  }

  Future<void> applyTokens(TokenResponse tr) async {
    accessToken = tr.accessToken;
    refreshToken = tr.refreshToken;
    user = tr.user;
    if (tr.deviceToken != null && tr.deviceToken!.isNotEmpty) {
      deviceToken = tr.deviceToken;
      await _storage.write(key: _kDevice, value: deviceToken);
    }
    await _storage.write(key: _kAccess, value: accessToken);
    await _storage.write(key: _kRefresh, value: refreshToken);
    await _persistUser(tr.user);
    notifyListeners();
  }

  Future<void> setUser(UserProfile u) async {
    user = u;
    await _persistUser(u);
    notifyListeners();
  }

  Future<void> clear({bool keepDevice = true}) async {
    accessToken = null;
    refreshToken = null;
    user = null;
    await _storage.delete(key: _kAccess);
    await _storage.delete(key: _kRefresh);
    await _storage.delete(key: _kUser);
    if (!keepDevice) {
      deviceToken = null;
      await _storage.delete(key: _kDevice);
    }
    notifyListeners();
  }
}

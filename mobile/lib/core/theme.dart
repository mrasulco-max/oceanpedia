import 'package:material_ui/material_ui.dart';

/// Token warna mengikuti mode app web OceanPedia.
abstract final class ObColors {
  static const brand = Color(0xFF2F74EB);
  static const brandSoft = Color(0xFFE8F0FE);
  static const brandChip = Color(0xFFE5ECFF);
  static const text = Color(0xFF0B0B0F);
  static const textSecondary = Color(0xFF5F6B7D);
  static const textMuted = Color(0xFF8A94A6);
  static const border = Color(0xFFE3EAF4);
  static const surface = Color(0xFFF6F8FC);
  static const canvas = Color(0xFFEEF2F8);
  static const up = Color(0xFF15803D);
  static const down = Color(0xFF991B1B);
  static const error = Color(0xFFB3261E);
  static const white = Color(0xFFFFFFFF);
}

ThemeData buildObTheme() {
  const family = 'Roboto';
  final base = ThemeData(
    useMaterial3: true,
    brightness: Brightness.light,
    fontFamily: family,
    colorScheme: ColorScheme.fromSeed(
      seedColor: ObColors.brand,
      primary: ObColors.brand,
      surface: ObColors.white,
    ),
    scaffoldBackgroundColor: ObColors.white,
    dividerColor: ObColors.border,
    appBarTheme: const AppBarTheme(
      backgroundColor: ObColors.white,
      foregroundColor: ObColors.text,
      elevation: 0,
      scrolledUnderElevation: 0,
      centerTitle: false,
    ),
  );

  return base.copyWith(
    textTheme: base.textTheme.apply(
      bodyColor: ObColors.text,
      displayColor: ObColors.text,
      fontFamily: family,
    ),
    primaryTextTheme: base.primaryTextTheme.apply(
      bodyColor: ObColors.text,
      displayColor: ObColors.text,
      fontFamily: family,
    ),
    inputDecorationTheme: InputDecorationTheme(
      filled: true,
      fillColor: ObColors.surface,
      contentPadding: const EdgeInsets.symmetric(horizontal: 16, vertical: 14),
      border: OutlineInputBorder(
        borderRadius: BorderRadius.circular(14),
        borderSide: const BorderSide(color: ObColors.border),
      ),
      enabledBorder: OutlineInputBorder(
        borderRadius: BorderRadius.circular(14),
        borderSide: const BorderSide(color: ObColors.border),
      ),
      focusedBorder: OutlineInputBorder(
        borderRadius: BorderRadius.circular(14),
        borderSide: const BorderSide(color: ObColors.brand, width: 1.5),
      ),
      hintStyle: const TextStyle(color: ObColors.textMuted, fontFamily: family),
    ),
    elevatedButtonTheme: ElevatedButtonThemeData(
      style: ElevatedButton.styleFrom(
        backgroundColor: ObColors.text,
        foregroundColor: ObColors.white,
        minimumSize: const Size.fromHeight(52),
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(14)),
        textStyle: const TextStyle(
          fontWeight: FontWeight.w600,
          fontSize: 16,
          fontFamily: family,
        ),
      ),
    ),
    outlinedButtonTheme: OutlinedButtonThemeData(
      style: OutlinedButton.styleFrom(
        foregroundColor: ObColors.text,
        minimumSize: const Size.fromHeight(52),
        side: const BorderSide(color: ObColors.border),
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(14)),
      ),
    ),
    snackBarTheme: SnackBarThemeData(
      behavior: SnackBarBehavior.floating,
      backgroundColor: ObColors.text,
      contentTextStyle: const TextStyle(color: ObColors.white, fontFamily: family),
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
    ),
  );
}

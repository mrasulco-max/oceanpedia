import 'package:flutter_test/flutter_test.dart';
import 'package:oceanpedia/core/theme.dart';

void main() {
  test('brand color matches web app token', () {
    expect(ObColors.brand.toARGB32(), 0xFF2F74EB);
  });
}

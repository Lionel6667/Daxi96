"""Tests OTP inscription partagé (Redis / locmem)."""
from django.core.cache import cache
from django.test import TestCase

from julmin_taxis.reg_otp_cache import (
    consume_registration_otp,
    mark_registration_verified,
    store_registration_otp,
    validate_registration_otp,
)


class RegOtpCacheTests(TestCase):
    def setUp(self):
        cache.clear()

    def test_client_otp_roundtrip(self):
        store_registration_otp('a@test.ht', '123456', phone_norm='+50911112222', namespace='')
        ok, msg = validate_registration_otp('a@test.ht', '123456', phone_norm='+50911112222', namespace='')
        self.assertTrue(ok, msg)

    def test_verified_flag_without_otp_cache(self):
        store_registration_otp('b@test.ht', '654321', namespace='')
        mark_registration_verified('b@test.ht', namespace='')
        cache.delete('reg_otp_b@test.ht')
        ok, msg = validate_registration_otp('b@test.ht', '654321', namespace='')
        self.assertTrue(ok, msg)

    def test_driver_namespace_keys(self):
        store_registration_otp('c@test.ht', '111111', phone_norm='+50933334444', namespace='driver')
        self.assertEqual(cache.get('reg_otp_driver_c@test.ht'), '111111')
        mark_registration_verified('c@test.ht', namespace='driver')
        consume_registration_otp('c@test.ht', namespace='driver')
        self.assertIsNone(cache.get('reg_otp_driver_c@test.ht'))
        self.assertIsNone(cache.get('reg_otp_driver_verified_c@test.ht'))

"""Tests vérification documents chauffeur (sans OCR réel)."""
from datetime import date, timedelta
from unittest.mock import patch

from django.test import SimpleTestCase

from drivers.document_verification import finalize_verification, REQUIRED_DOC_TYPES


class FinalizeVerificationTests(SimpleTestCase):
    def test_expired_document_rejected(self):
        past = (date.today() - timedelta(days=30)).isoformat()
        result = finalize_verification(
            {'expiry_date': past, 'identity_match': True, 'document_type': 'Permis'},
            'license', 'Jean', 'Dupont',
        )
        self.assertFalse(result['ok'])
        self.assertEqual(result['status'], 'expired')
        self.assertIn('expiré', result['message'].lower())

    def test_wrong_name_rejected_with_reason(self):
        result = finalize_verification(
            {
                'expiry_date': '2030-12-31',
                'identity_match': False,
                'rejection_reason': 'Le permis est au nom de Pierre Martin, pas Jean Dupont.',
            },
            'license', 'Jean', 'Dupont',
        )
        self.assertFalse(result['ok'])
        self.assertEqual(result['status'], 'invalid_name')
        self.assertIn('Pierre Martin', result['message'])

    def test_valid_document_accepted(self):
        future = (date.today() + timedelta(days=400)).isoformat()
        result = finalize_verification(
            {'expiry_date': future, 'identity_match': True, 'document_type': 'OAVCT'},
            'oavct', 'Marie', 'Joseph',
        )
        self.assertTrue(result['ok'])
        self.assertEqual(result['status'], 'valid')

    def test_near_expiry_accepted_with_warning(self):
        soon = (date.today() + timedelta(days=45)).isoformat()
        result = finalize_verification(
            {'expiry_date': soon, 'identity_match': True},
            'dgi', 'Paul', 'Louis',
        )
        self.assertTrue(result['ok'])
        self.assertEqual(result['status'], 'near_expiry')

    def test_missing_expiry_rejected(self):
        result = finalize_verification(
            {'expiry_date': None, 'identity_match': True},
            'license', 'Jean', 'Dupont',
        )
        self.assertFalse(result['ok'])
        self.assertEqual(result['status'], 'manual_verification')

    def test_fake_document_rejected(self):
        result = finalize_verification(
            {
                'is_authentic': False,
                'rejection_reason': "Ce n’est pas un permis original.",
                'identity_match': True,
                'expiry_date': '2030-01-01',
            },
            'license', 'Jean', 'Dupont',
        )
        self.assertFalse(result['ok'])
        self.assertEqual(result['status'], 'fake_document')
        self.assertIn('license', REQUIRED_DOC_TYPES)
        self.assertIn('oavct', REQUIRED_DOC_TYPES)
        self.assertIn('dgi', REQUIRED_DOC_TYPES)


class VerifyRegistrationFilesTests(SimpleTestCase):
    def test_non_strict_accepts_files_only(self):
        from django.core.files.uploadedfile import SimpleUploadedFile
        from drivers.document_verification import verify_driver_registration_files

        files = {
            'driving_license': SimpleUploadedFile('l.png', b'x', content_type='image/png'),
            'oavct_insurance': SimpleUploadedFile('o.png', b'x', content_type='image/png'),
            'dgi_card': SimpleUploadedFile('d.png', b'x', content_type='image/png'),
        }
        ok, errors, notes = verify_driver_registration_files(
            files, 'Jean', 'Pierre', strict=False,
        )
        self.assertTrue(ok)
        self.assertEqual(errors, [])
        self.assertIn('license', notes)

    def test_strict_missing_file_rejected(self):
        from drivers.document_verification import verify_driver_registration_files

        ok, errors, _ = verify_driver_registration_files(
            {}, 'Jean', 'Pierre', strict=True,
        )
        self.assertFalse(ok)
        self.assertTrue(any('manquant' in e.lower() for e in errors))

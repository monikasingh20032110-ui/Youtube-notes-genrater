"""
Flask App End-to-End Test
"""
import unittest
import json
from app import app, db

class TestFlaskEndpoints(unittest.TestCase):
    def setUp(self):
        self.client = app.test_client()
        self.client.testing = True

    def test_homepage(self):
        resp = self.client.get('/')
        self.assertEqual(resp.status_code, 200)
        self.assertIn(b'EduScribe', resp.data)
        self.assertIn(b'Generate Notes', resp.data)

    def test_extract_invalid_url(self):
        resp = self.client.post('/api/extract', json={'url': 'invalid-url'})
        self.assertEqual(resp.status_code, 400)
        data = json.loads(resp.data)
        self.assertFalse(data['success'])

    def test_get_history(self):
        resp = self.client.get('/api/history')
        self.assertEqual(resp.status_code, 200)
        data = json.loads(resp.data)
        self.assertTrue(data['success'])
        self.assertIsInstance(data['notes'], list)

    def test_search_notes(self):
        resp = self.client.get('/api/search?q=neural')
        self.assertEqual(resp.status_code, 200)
        data = json.loads(resp.data)
        self.assertTrue(data['success'])
        self.assertIsInstance(data['notes'], list)

if __name__ == '__main__':
    unittest.main()

import test from 'node:test';
import assert from 'node:assert/strict';
import {validateStickerUrl, isPublicIp} from '../importer.mjs';

test('URL CDN TikTok signée acceptée avec query intacte', () => {
  const url = 'https://p16-sign.tiktokcdn-us.com/tos-useast5/abc.awebp?x=1&y=2';
  assert.equal(validateStickerUrl(url).href, url);
});
test('URL d’un domaine extérieur ou URL TikTok de profil rejetée', () => {
  for (const url of [
    'https://evil.example/x.webp',
    'https://tiktokcdn-us.com.evil.example/fake.webp',
    'https://www.tiktok.com/@pseudo/video/123',
    'http://p16.tiktokcdn-us.com/x.webp',
    'https://127.0.0.1/private',
    'https://localhost:31777/api/status',
    'https://user:pass@p16.tiktokcdn.com/f.webp',
    'https://p16.tiktokcdn.com:444/f.webp',
    'file:///etc/passwd'
  ]) assert.throws(() => validateStickerUrl(url), Error, url);
});
test('DNS adresse privée, loopback ou réservée rejetée', () => {
  for (const ip of ['127.0.0.1', '10.1.2.3', '192.168.1.1','172.16.42.1','169.254.3.4','100.64.1.1','::1','fc00::1','2001:db8::1']) {
    assert.equal(isPublicIp(ip), false, ip);
  }
  assert.equal(isPublicIp('8.8.8.8'), true);
  assert.equal(isPublicIp('2606:4700:4700::1111'), true);
});

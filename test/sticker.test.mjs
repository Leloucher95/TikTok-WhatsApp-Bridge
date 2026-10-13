import {test} from 'node:test';
import assert from 'node:assert/strict';
import sharp from 'sharp';
import {toWhatsAppSticker} from '../sticker.mjs';

async function meta(buffer) {return sharp(buffer, {animated:true}).metadata();}

test('PNG statique devient véritable WebP 512x512 <=100Ko', async () => {
  const image = await sharp({create:{width:95,height:36,channels:4,background:'#aa22aaff'}}).png().toBuffer();
  const result = await toWhatsAppSticker(image);
  const m = await meta(result.buffer);
  assert.equal(result.animated, false);
  assert.equal(m.format, 'webp');
  assert.equal(m.width, 512);
  assert.equal(m.height, 512);
  assert.ok(result.bytes <= 100*1024);
});

test('WebP animé conserve plusieurs images et reste 512x512 par frame', async () => {
  const frame = 64;
  const raw = Buffer.alloc(frame*frame*4*3);
  for(let f = 0; f < 3; f++) {
    for(let y = 0; y < frame; y++) {
      for(let x = 0; x < frame; x++) {
        const i = ((f*frame*frame) + y*frame+x)*4;
        raw[i] = f === 0 ? 255 : 0;
        raw[i+1] = f === 1 ? 255 : 0;
        raw[i+2] = f === 2 ? 255 : 0;
        raw[i+3] = 255;
      }
    }
  }
  const anim = await sharp(raw,{raw:{width:frame,height:frame*3,channels:4,pageHeight:frame}})
    .webp({quality:70,loop:0,delay:[120,120,120]})
    .toBuffer();
  const inputMeta = await meta(anim);
  assert.ok(inputMeta.pages >= 2, 'La fixture doit être animée');
  const result = await toWhatsAppSticker(anim);
  const m = await meta(result.buffer);
  assert.equal(result.animated, true);
  assert.equal(m.width, 512);
  assert.equal(m.pageHeight, 512);
  assert.ok(m.pages >= 2);
  assert.ok(result.bytes <= 500*1024);
});

import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';

const code = readFileSync(new URL('../dashboard.js', import.meta.url), 'utf8');

function setup({storedChat = 'alice@c.us', storedDirect = 'yes', hash = '', opener = null} = {}) {
  class Element {
    constructor(id = '') {
      this.id = id; this.value = ''; this.textContent = ''; this.checked = false;
      this.style = {}; this.options = []; this.hidden = false; this.disabled = false;
      this.listeners = new Map(); this.src = ''; this.children = [];
    }
    addEventListener(type, listener) {this.listeners.set(type, listener);}
    append(...children) {this.children.push(...children); if (this.id === 'chat') this.options.push(...children);}
    replaceChildren(...children) {this.children = [...children]; if (this.id === 'chat') this.options = [...children];}
    click(){}
    fire(type, event = {}) {return this.listeners.get(type)?.(event);}
  }
  const nodes = new Map();
  const document = {
    createElement: type => new Element(type),
    getElementById: id => {
      if (!nodes.has(id)) nodes.set(id, new Element(id));
      return nodes.get(id);
    }
  };
  const local = new Map();
  if (storedChat) local.set('ttwa.v06.last-chat', storedChat);
  if (storedDirect) local.set('ttwa.v06.direct', storedDirect);
  const localStorage = {getItem:k => local.get(k) ?? null, setItem:(k,v)=>local.set(k,v)};
  let revision = 0;
  const requests = [];
  const messages = [];
  const listeners = {};
  const window = {
    opener,
    crypto: {randomUUID: () => 'strong-test-nonce'},
    addEventListener:(type, fn) => {listeners[type] = fn;}
  };
  const location = {hash, pathname:'/', search:''};
  const history = {replaceState:() => {location.hash = ''}};
  const fetch = async (url, options = {}) => {
    requests.push({url, options});
    const json = url === '/api/status' ? {ok:true, ready:true, message:'Connecté', sticker: revision ? {revision, animated:true, bytes:10000, outputFrames:49, durationMs:3100, skippedFrames:0} : null}
      : url === '/api/chats' ? {ok:true, chats:[{id:'alice@c.us',name:'Alice',group:false},{id:'bob@c.us',name:'Bob',group:false}]}
      : url === '/api/import-url' ? {ok:true, sticker:{revision:++revision, animated:true, bytes:10000}}
      : url === '/api/send' ? (messages.push(JSON.parse(options.body)), {ok:true, confirmed:false, message:'Envoi sans confirmation technique'})
      : {ok:false, error:'unexpected request'};
    return {ok:true, json:async()=>json};
  };
  const env = {
    document, localStorage, window, location, history, fetch,
    URLSearchParams, Set, Date,
    confirm:()=>true,
    setTimeout:()=>0, clearTimeout:()=>{}, setInterval:()=>0
  };
  vm.runInNewContext(code, env);
  const settle = async () => {for(let i = 0; i < 20; i++) await new Promise(resolve=>setImmediate(resolve));};
  return {window, local, requests, messages, nodes, listeners, settle, revision:()=>revision,
    get:(id)=>document.getElementById(id)};
}

test('retrouve le dernier contact et le mode direct après rafraîchissement', async () => {
  const app = setup();
  await app.settle();
  assert.equal(app.get('chat').value, 'alice@c.us');
  assert.equal(app.get('direct-mode').checked, true);
  assert.match(app.get('direct-hint').textContent, /Alice/);
  assert.equal(app.messages.length, 0);
});

test('un simple fragment URL même avec mode direct actif ne doit pas envoyer', async () => {
  const app = setup({hash:'#sticker=https%3A%2F%2Fp16.tiktokcdn.com%2Fanim.awebp'});
  await app.settle();
  assert.equal(app.get('sticker-url').value, 'https://p16.tiktokcdn.com/anim.awebp');
  assert.equal(app.messages.length, 0);
  assert.equal(app.revision(), 0);
});

test('un postMessage légitime TikTok déclenche import et envoi au contact mémorisé', async () => {
  const opener = {postMessage:(message, origin)=>{assert.equal(message.nonce, 'strong-test-nonce');assert.equal(origin, '*');}};
  const app = setup({opener});
  await app.settle();
  app.listeners.message({origin:'https://www.tiktok.com', source:opener, data:{type:'ttwa:handoff', nonce:'strong-test-nonce', url:'https://p16.tiktokcdn.com/anim.awebp'}});
  await app.settle();
  assert.equal(app.revision(), 1);
  assert.equal(app.messages.length, 1);
  assert.equal(app.messages[0].chatId, 'alice@c.us');
  assert.equal(app.messages[0].revision, 1);
  assert.equal(app.messages[0].direct, true);
  assert.equal(app.window.opener, null);
});

test('messages d’autres sites, faux nonce et second appel ignorés', async () => {
  const opener = {postMessage:()=>{}};
  const app = setup({opener});
  await app.settle();
  const base = {source:opener, data:{type:'ttwa:handoff', nonce:'strong-test-nonce',url:'https://p16.tiktokcdn.com/anim.awebp'}};
  app.listeners.message({...base, origin:'https://evil.example'});
  app.listeners.message({...base, origin:'https://www.tiktok.com',data:{...base.data,nonce:'wrong'}});
  await app.settle();
  assert.equal(app.revision(), 0);
  app.listeners.message({...base, origin:'https://m.tiktok.com'});
  await app.settle();
  app.listeners.message({...base, origin:'https://m.tiktok.com'});
  await app.settle();
  assert.equal(app.messages.length, 1);
});

test('mode manuel mémorise le contact, mais aucun envoi avant confirmation', async () => {
  const app = setup({storedDirect:'no',storedChat:'alice@c.us'});
  await app.settle();
  app.get('chat').value = 'bob@c.us';
  app.get('chat').fire('change');
  assert.equal(app.local.get('ttwa.v06.last-chat'), 'bob@c.us');
  await app.get('import-form').fire('submit',{preventDefault(){}});
  assert.equal(app.messages.length, 0);
});

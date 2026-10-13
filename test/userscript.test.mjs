import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';

const source = readFileSync(new URL('../tiktok-to-whatsapp.user.js', import.meta.url), 'utf8');
function runUserScript(promptValue = null) {
  const nodes = new Map();
  const documentEvents = new Map();
  const opened = [];
  const timeouts = [];
  const windowEvents = new Map();
  const forwarded = [];
  const popups = [];
  class Element {
    constructor(tag) {this.tag = tag; this.style = {}; this.events = {}; this.children = []; this.textContent = ''; this.srcset = '';}
    set id(v) {this._id = v; nodes.set(v, this);}
    get id() {return this._id;}
    append(...children) {this.children.push(...children);}
    appendChild(child) {this.children.push(child);}
    replaceChildren(...children) {this.children = [...children];}
    addEventListener(type, fn) {this.events[type] = fn;}
    getBoundingClientRect() {return {left:20, top:30, bottom:90, width:64, height:64};}
    closest(query) {return query === 'img' && this.tag === 'img' ? this : null;}
    querySelector() {return null;}
    getAttribute(name) {return name === 'src' ? this.src : null;}
  }
  const env = {
    document: {
      head: new Element('head'), body:new Element('body'),
      createElement: tag => new Element(tag),
      addEventListener: (type, callback) => documentEvents.set(type, callback)
    },
    Element,
    location: {href:'https://www.tiktok.com/messages'},
    window: {
      open: (...args) => {
        opened.push(args);
        const popup = {postMessage: (...parts) => forwarded.push({popup, parts})};
        popups.push(popup);
        return popup;
      },
      addEventListener: (type, callback) => windowEvents.set(type, callback)
    },
    innerWidth:1000, innerHeight:768,
    URL, prompt:() => promptValue,
    console: {info(){}},
    setTimeout: (fn, ms) => {timeouts.push({fn, ms}); return timeouts.length;},
    clearTimeout: () => {}
  };
  vm.runInNewContext(source, env);
  const image = new Element('img');
  image.currentSrc = 'https://p16.example.com/thumb.webp';
  image.src = image.currentSrc;
  image.srcset = 'https://p16.tiktokcdn.com/anim.awebp?x=1&y=2 2x';
  return {nodes, opened, image, timeouts, forwarded, popups,
    incoming(origin, source, data) {windowEvents.get('message')({origin, source, data});},
    pointer() {documentEvents.get('pointerover')({target:image});},
    click() {nodes.get('ttwa-floating').events.click({preventDefault(){},stopPropagation(){}});},
    toolbar() {nodes.get('ttwa-toolbar').events.click();}
  };
}

test('le script privilégie le WebP animé et passe l’URL dans un fragment, sans CORS', () => {
  const app = runUserScript();
  app.pointer(); app.click();
  assert.equal(app.opened.length, 1);
  const destination = new URL(app.opened[0][0]);
  assert.equal(destination.origin, 'http://127.0.0.1:31777');
  assert.equal(destination.search, '');
  assert.equal(new URLSearchParams(destination.hash.slice(1)).get('sticker'), 'https://p16.tiktokcdn.com/anim.awebp?x=1&y=2');
  assert.match(app.nodes.get('ttwa-toast').children[0].textContent, /Lien transmis/);
});

test('la barre permet de saisir et préremplir une URL', () => {
  const app = runUserScript('https://p16.tiktokcdn-us.com/abc.webp?expire=123');
  app.toolbar();
  const page = new URL(app.opened[0][0]);
  assert.equal(new URLSearchParams(page.hash.slice(1)).get('sticker'), 'https://p16.tiktokcdn-us.com/abc.webp?expire=123');
});

test('les URLs blob ne sont pas transmises au serveur HTTP local', () => {
  const app = runUserScript('blob:https://www.tiktok.com/uuid');
  app.toolbar();
  assert.equal(app.opened.length, 0);
  assert.match(app.nodes.get('ttwa-toast').children[0].textContent, /blob:.*data:/);
});


test('bouton fixe sur le sticker meme si pointerover est repete', () => {
  const app = runUserScript();
  app.pointer();
  const button = app.nodes.get('ttwa-floating');
  const first = {left:button.style.left,top:button.style.top};
  // Simulation d'un decalage de layout pendant que le curseur tente de cliquer.
  app.image.getBoundingClientRect = () => ({left:500,top:400,width:64,height:64,bottom:464});
  app.pointer();
  assert.deepEqual({left:button.style.left,top:button.style.top}, first);
  assert.equal(button.style.display, 'block');
});

test('notification de lien envoye disparait automatiquement apres 2.5 secondes', () => {
  const app = runUserScript();
  app.pointer(); app.click();
  const toast = app.nodes.get('ttwa-toast');
  assert.equal(toast.style.display, 'block');
  const delay = app.timeouts.at(-1);
  assert.equal(delay.ms, 2500);
  delay.fn();
  assert.equal(toast.style.display, 'none');
});


test('handoff direct uniquement depuis notre propre onglet Bridge avec un nonce', () => {
  const app = runUserScript();
  app.pointer(); app.click();
  const popup = app.popups[0];
  const msg = {type:'ttwa:ready', nonce:'nonce-secret-unique'};
  app.incoming('https://malicious.example', popup, msg);
  app.incoming('http://127.0.0.1:31777', {postMessage(){}}, msg);
  assert.equal(app.forwarded.length, 0, 'origine inconnue et popup inconnue rejetées');
  app.incoming('http://127.0.0.1:31777', popup, msg);
  assert.equal(app.forwarded.length, 1);
  assert.equal(app.forwarded[0].parts[1], 'http://127.0.0.1:31777');
  assert.equal(app.forwarded[0].parts[0].type, 'ttwa:handoff');
  assert.equal(app.forwarded[0].parts[0].nonce, msg.nonce);
  assert.equal(app.forwarded[0].parts[0].url, 'https://p16.tiktokcdn.com/anim.awebp?x=1&y=2');
  app.incoming('http://127.0.0.1:31777', popup, msg);
  assert.equal(app.forwarded.length, 1, 'la même transmission ne doit pas être rejouée');
});

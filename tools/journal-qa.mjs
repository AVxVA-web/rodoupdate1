#!/usr/bin/env node
import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';

const source = fs.readFileSync(new URL('../js/journal.js', import.meta.url), 'utf8');

class FakeClassList {
  constructor() { this.set = new Set(); }
  toggle(name, force) { const on = force === undefined ? !this.set.has(name) : force; if (on) this.set.add(name); else this.set.delete(name); return on; }
  contains(name) { return this.set.has(name); }
}

class FakeElement {
  constructor(id='') {
    this.id=id; this.value=''; this.textContent=''; this.innerHTML=''; this.dataset={};
    this.classList=new FakeClassList(); this.listeners={}; this.children=[]; this.style={};
  }
  addEventListener(type, handler) { (this.listeners[type] ||= []).push(handler); }
  dispatch(type, payload={}) { for (const h of this.listeners[type] || []) h(payload); }
  setAttribute() {}
  focus() {}
  reset() { this.value=''; }
  closest(selector) {
    if (selector === '[data-journal-open]' && this.dataset.journalOpen) return this;
    return null;
  }
}

const ids = [
  'journal-list','journal-empty','journal-no-results','journal-search','journal-date-filter',
  'journal-date-from','journal-date-to','journal-custom-range','journal-results-count',
  'journal-clear-filters','journal-open-composer','journal-empty-action','journal-composer',
  'journal-close-composer','journal-composer-title','journal-composer-date','journal-form',
  'journal-title','journal-content','journal-word-count','journal-reader','journal-close-reader',
  'journal-reader-date','journal-reader-title','journal-reader-meta','journal-reader-content',
  'journal-edit-entry','journal-delete-entry','nav-journal'
];
const elements = Object.fromEntries(ids.map(id => [id, new FakeElement(id)]));
elements['journal-date-filter'].value='all';
elements['journal-custom-range'].classList.set.add('hidden');

const document = {
  body: { classList: new FakeClassList() },
  getElementById(id) { return elements[id] || null; },
  querySelectorAll(selector) { return selector === '[data-journal-close]' ? [] : []; },
  addEventListener(type, handler) { this[`on_${type}`]=handler; }
};

let nextId=1000;
const context = {
  console,
  document,
  window: {
    addEventListener(type, handler) { if (type === 'load') this.onLoad = handler; },
    confirm() { return true; }
  },
  state: { journals: [] },
  getLocalDateStr(date = new Date()) {
    const offset=date.getTimezoneOffset()*60000;
    return new Date(date.getTime()-offset).toISOString().split('T')[0];
  },
  createEntityId() { return ++nextId; },
  saveState: function() { context.saved = (context.saved || 0) + 1; },
  showToast: function(message) { context.toastMessage=message; },
  lucide: { createIcons() {} },
  requestAnimationFrame(fn) { fn(); },
  Date, Number, String, Math, Set, Map, Intl
};
context.window.document=document;
context.window.state=context.state;
context.globalThis=context;
vm.createContext(context);
vm.runInContext(source, context, { filename: 'journal.js' });
context.window.onLoad();
assert.equal(typeof context.window.RODOJournal.render, 'function');

const form=elements['journal-form'];
elements['journal-title'].value='يوم الكيمياء';
elements['journal-content'].value='النهارده ذاكرت كيمياء وراجعت الجزء الصعب.';
form.dispatch('submit', {preventDefault(){}});
assert.equal(context.state.journals.length,1);
assert.equal(context.state.journals[0].title,'يوم الكيمياء');
assert.equal(context.state.journals[0].content,'النهارده ذاكرت كيمياء وراجعت الجزء الصعب.');
assert.equal(context.saved,1);
assert.equal(elements['journal-results-count'].textContent,'يومية واحدة');
assert.equal(elements['journal-reader-title'].textContent,'يوم الكيمياء');

// Search should match normalized Arabic characters and both title/body.
elements['journal-search'].value='كيميا';
elements['journal-search'].dispatch('input');
assert.match(elements['journal-list'].innerHTML, /يوم الكيمياء/);

// Date filter should hide an old entry.
context.state.journals.push({ id: 1001, title:'قديم', content:'محتوى قديم', dateKey:'2020-01-01', createdAt:1, updatedAt:1 });
elements['journal-date-filter'].value='today';
elements['journal-search'].value='';
elements['journal-date-filter'].dispatch('change');
assert.doesNotMatch(elements['journal-list'].innerHTML, /قديم/);

// Edit should preserve the entry ID and date.
const first = context.state.journals[0];
context.window.RODOJournal.openReader(first);
elements['journal-edit-entry'].dispatch('click');
elements['journal-title'].value='يوم الكيمياء المعدل';
elements['journal-content'].value='كتبت تعديل بسيط.';
form.dispatch('submit', {preventDefault(){}});
assert.equal(context.state.journals[0].id, first.id);
assert.equal(context.state.journals[0].dateKey, first.dateKey);
assert.equal(context.state.journals[0].title,'يوم الكيمياء المعدل');
assert.equal(context.saved,2);

// Delete should remove only the active entry.
context.window.RODOJournal.openReader(context.state.journals[0]);
elements['journal-delete-entry'].dispatch('click');
assert.equal(context.state.journals.length,1);
assert.equal(context.state.journals[0].title,'قديم');
assert.equal(context.saved,3);

console.log('PASS  journal domain: create, normalize-aware search, date filter, edit, delete');

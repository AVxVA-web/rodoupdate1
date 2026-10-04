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
    this.attributes={};
  }
  addEventListener(type, handler) { (this.listeners[type] ||= []).push(handler); }
  dispatch(type, payload={}) { for (const h of this.listeners[type] || []) h(payload); }
  setAttribute(name, value) { this.attributes[name]=value; }
  focus() { this.focused=true; }
  reset() { /* test form reset is intentionally inert */ }
  closest(selector) {
    if (selector === '[data-journal-open]' && this.dataset.journalOpen) return this;
    if (selector === '[data-journal-pin]' && this.dataset.journalPin) return this;
    return null;
  }
}

const ids = [
  'journal-list','journal-empty','journal-no-results','journal-search','journal-date-filter',
  'journal-date-from','journal-date-to','journal-custom-range','journal-results-count',
  'journal-clear-filters','journal-open-composer','journal-empty-action','journal-composer',
  'journal-close-composer','journal-composer-title','journal-composer-date','journal-form',
  'journal-title','journal-content','journal-word-count','journal-draft-banner','journal-draft-state',
  'journal-draft-meta','journal-restore-draft','journal-discard-draft','journal-reader','journal-close-reader',
  'journal-reader-date','journal-reader-title','journal-reader-meta','journal-reader-content',
  'journal-pin-entry','journal-pin-label','journal-edit-entry','journal-delete-entry','nav-journal'
];
const elements = Object.fromEntries(ids.map(id => [id, new FakeElement(id)]));
elements['journal-date-filter'].value='all';
elements['journal-custom-range'].classList.set.add('hidden');
elements['journal-composer'].classList.set.add('hidden');
elements['journal-reader'].classList.set.add('hidden');

const autoStorage = new Map();
const localStorage = {
  getItem(key) { return autoStorage.has(key) ? autoStorage.get(key) : null; },
  setItem(key, value) { autoStorage.set(key, String(value)); },
  removeItem(key) { autoStorage.delete(key); },
  clear() { autoStorage.clear(); }
};

autoStorage.set('hsQuestPremium_v4', JSON.stringify({version:6,journals:[]}));

const document = {
  body: { classList: new FakeClassList() },
  getElementById(id) { return elements[id] || null; },
  querySelectorAll() { return []; },
  addEventListener(type, handler) { this[`on_${type}`]=handler; }
};

let nextId=1000;
const context = {
  console,
  document,
  localStorage,
  window: {
    addEventListener(type, handler) { if (type === 'load') this.onLoad = handler; },
    clearTimeout,
    setTimeout,
    confirm() { return true; }
  },
  state: { journals: [] },
  getLocalDateStr(date = new Date()) {
    const offset=date.getTimezoneOffset()*60000;
    return new Date(date.getTime()-offset).toISOString().split('T')[0];
  },
  createEntityId() { return ++nextId; },
  saveState() {
    autoStorage.set('hsQuestPremium_v4', JSON.stringify(context.state));
    context.saved = (context.saved || 0) + 1;
  },
  showToast(message) { context.toastMessage=message; },
  escapeHTML(value) { return String(value ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;'); },
  lucide: { createIcons() {} },
  requestAnimationFrame(fn) { fn(); },
  Date, Number, String, Math, Set, Map, Intl
};
context.globalThis=context;
context.window.document=document;
context.window.state=context.state;
vm.createContext(context);
vm.runInContext(source, context, { filename: 'journal.js' });
context.window.onLoad();
assert.equal(typeof context.window.RODOJournal.render, 'function');

const form=elements['journal-form'];

// Create entries across two months. Draft should be stored while composing, then cleared after durable save.
elements['journal-title'].value='يوم الكيمياء';
elements['journal-content'].value='النهارده ذاكرت كيمياء وراجعت الجزء الصعب.';
form.dispatch('submit',{preventDefault(){}});
assert.equal(context.state.journals.length,1);
assert.equal(context.state.journals[0].isPinned,false);
assert.equal(localStorage.getItem('hsQuestPremium_journal_draft_v2'),null);

context.state.journals.push(
  {id:2001,title:'قديم',content:'محتوى قديم عن امتحان ومراجعة.',dateKey:'2020-01-01',createdAt:1,updatedAt:1,isPinned:false},
  {id:2002,title:'أهم يوم',content:'مراجعة الكيمياء قبل الامتحان.',dateKey:'2026-09-30',createdAt:2,updatedAt:2,isPinned:true},
  {id:2003,title:'يوم تاني',content:'كتبت شوية ملاحظات.',dateKey:'2026-10-02',createdAt:3,updatedAt:3,isPinned:false}
);
context.saveState();
context.window.RODOJournal.render();

// Search: normalized Arabic matching, title priority, and highlight markup.
elements['journal-search'].value='كيميا';
elements['journal-date-filter'].value='all';
elements['journal-search'].dispatch('input');
assert.match(elements['journal-list'].innerHTML,/يوم الكيمياء/);
assert.match(elements['journal-list'].innerHTML,/<mark>/);
assert.ok(elements['journal-list'].innerHTML.indexOf('يوم الكيمياء') < elements['journal-list'].innerHTML.indexOf('قديم') || !elements['journal-list'].innerHTML.includes('قديم'));

// Pin a non-pinned entry and verify a dedicated pinned section exists.
const first = context.state.journals[0];
elements['journal-list'].dispatch('click',{preventDefault(){},stopPropagation(){},target:{closest(){return {dataset:{journalPin:String(first.id)}}}}});
assert.equal(context.state.journals.find(j=>j.id===first.id).isPinned,true);
assert.match(elements['journal-list'].innerHTML,/rodo-journal-pinned/);

// Date filter still works with the timeline.
elements['journal-search'].value='';
elements['journal-date-filter'].value='today';
elements['journal-date-filter'].dispatch('change');
assert.doesNotMatch(elements['journal-list'].innerHTML,/قديم/);
assert.doesNotMatch(elements['journal-list'].innerHTML,/محتوى قديم/);

// Timeline markup is present when showing all dates.
elements['journal-date-filter'].value='all';
elements['journal-date-filter'].dispatch('change');
assert.match(elements['journal-list'].innerHTML,/rodo-journal-timeline/);
assert.match(elements['journal-list'].innerHTML,/أكتوبر ٢٠٢٦/);
assert.match(elements['journal-list'].innerHTML,/سبتمبر ٢٠٢٦/);

// Draft autosave: opening the composer and typing creates a durable draft separate from the main state.
context.window.RODOJournal.openComposer();
elements['journal-title'].value='مسودة';
elements['journal-content'].value='لسه بكتب ومش خلصت.';
elements['journal-content'].dispatch('input');
await new Promise(resolve=>setTimeout(resolve, 760));
const draft = JSON.parse(localStorage.getItem('hsQuestPremium_journal_draft_v2'));
assert.equal(draft.title,'مسودة');
assert.equal(draft.content,'لسه بكتب ومش خلصت.');
assert.match(elements['journal-draft-state'].textContent,/مسودة محفوظة|مسودة/);

// Discard restores a clean new-entry form and removes the draft.
elements['journal-discard-draft'].dispatch('click');
assert.equal(localStorage.getItem('hsQuestPremium_journal_draft_v2'),null);
assert.equal(elements['journal-content'].value,'');

// Edit preserves identity and date.
context.window.RODOJournal.openReader(first);
elements['journal-edit-entry'].dispatch('click');
elements['journal-title'].value='يوم الكيمياء المعدل';
elements['journal-content'].value='تعديل بسيط.';
form.dispatch('submit',{preventDefault(){}});
assert.equal(context.state.journals.find(j=>j.id===first.id).id,first.id);
assert.equal(context.state.journals.find(j=>j.id===first.id).dateKey,first.dateKey);
assert.equal(context.state.journals.find(j=>j.id===first.id).title,'يوم الكيمياء المعدل');

// Persistence failure must never discard the user's text: the attempted entry stays in draft storage and is not committed to state.
autoStorage.delete('hsQuestPremium_journal_draft_v2');
context.state.journals = context.state.journals.filter(j => j.id !== 9999);
context.saveState = function() { throw new Error('simulated storage failure'); };
context.window.RODOJournal.openComposer();
elements['journal-title'].value='مسودة فشل الحفظ';
elements['journal-content'].value='النص الذي لا يجب أن يضيع.';
form.dispatch('submit',{preventDefault(){}});
assert.equal(context.state.journals.some(j => j.title === 'مسودة فشل الحفظ'),false);
const failureDraft = JSON.parse(localStorage.getItem('hsQuestPremium_journal_draft_v2'));
assert.equal(failureDraft.title,'مسودة فشل الحفظ');
assert.equal(failureDraft.content,'النص الذي لا يجب أن يضيع.');

console.log('PASS  journal V2: drafts, timeline, pinning, smart search/highlight, filters, edit persistence, failure-safe saves');

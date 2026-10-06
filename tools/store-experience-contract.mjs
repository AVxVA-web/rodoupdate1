#!/usr/bin/env node
/** Deterministic contract simulation for Store V3 presentation states. */
import fs from 'node:fs';
import vm from 'node:vm';

class ClassList { constructor(){ this.set = new Set(['hidden']); } add(...v){v.forEach(x=>this.set.add(x));} remove(...v){v.forEach(x=>this.set.delete(x));} contains(v){return this.set.has(v);} toggle(v,on){on?this.set.add(v):this.set.delete(v);} }
class FakeElement {
  constructor(){this.classList=new ClassList();this.dataset={};this.style={};this.attrs={};this.children={};this.disabled=false;this.innerText='';this.textContent='';this.innerHTML='';this.onclick=null;}
  querySelector(sel){return sel.startsWith('#') ? (this.children[sel.slice(1)] || null) : null;}
  setAttribute(k,v){this.attrs[k]=String(v);} getAttribute(k){return this.attrs[k] ?? null;} addEventListener(){}
}

const ids=['store-product-detail-modal','store-detail-art','store-detail-status','store-detail-kicker','store-detail-title','store-detail-desc','store-detail-truth','store-detail-price','store-detail-balance','store-detail-action','store-detail-secondary','store-detail-confirm','store-detail-confirm-copy','store-detail-confirm-title','store-detail-confirm-balance','store-detail-balance-after'];
const modal=new FakeElement(); for(const id of ids.slice(1)) modal.children[id]=new FakeElement();
const chestModal=new FakeElement(); for(const id of ['chest-reveal-title','chest-reveal-desc','chest-reveal-reward-text','chest-reveal-icon','chest-reveal-reward-box']) chestModal.children[id]=new FakeElement();
const document={readyState:'complete',body:new FakeElement(),getElementById(id){return id==='store-product-detail-modal'?modal:id==='view-store'?new FakeElement():id==='chest-reveal-modal'?chestModal:null;},querySelectorAll(){return[];},addEventListener(){}};
const window={lucide:{createIcons:()=>{}}};
const state={coins:600,store:{ownedItems:[],consumables:[],studyTools:{owned:[]}}};
const STORE_CATALOG=[
  {id:'theme_crimson',title:'طاقة القرمزي',desc:'مظهر أحمر.',cost:500,category:'themes',icon:'palette',rarity:'epic',type:'theme'},
  {id:'mystery_small',title:'صندوق الغموض',desc:'صندوق.',cost:200,category:'mystery',icon:'box',rarity:'rare',type:'mystery'}
];
const study=[{id:'study_backlog',title:'مفكّك التراكم',subtitle:'أداة',cost:180,icon:'layers-2',desc:'يفك التراكم.',detail:'أداة عملية.'}];
window.RODO_STUDY_STORE_PRODUCTS=study;
const isPermanentStoreItem=item=>['theme','title','avatar','effect'].includes(item.type);
const getStoreTruthNote=()=> 'لا يغيّر ساعات الدراسة أو درجاتك.';
function buyStoreItem(id){const i=STORE_CATALOG.find(x=>x.id===id);if(state.coins<i.cost)return;state.coins-=i.cost;if(isPermanentStoreItem(i))state.store.ownedItems.push(id);else state.store.consumables.push({instanceId:'1',itemId:id});}
function buyStudyStoreProduct(id){const i=study.find(x=>x.id===id);if(state.coins<i.cost)return;state.coins-=i.cost;state.store.studyTools.owned.push(id);}
const getDailyOfferPrice=i=>Math.floor(i.cost*.8); const showToast=()=>{}; const setStoreCategory=()=>{}; window.showChestRevealModal=()=>{};
Object.assign(globalThis,{window,document,state,STORE_CATALOG,isPermanentStoreItem,getStoreTruthNote,buyStoreItem,buyStudyStoreProduct,getDailyOfferPrice,showToast,setStoreCategory,lucide:window.lucide,Element:FakeElement});
vm.runInThisContext(fs.readFileSync(new URL('../js/store-experience.js', import.meta.url),'utf8'));

window.openStoreProductDetail('theme_crimson');
if(modal.children['store-detail-title'].textContent !== 'طاقة القرمزي') throw new Error('core detail state failed');
modal.children['store-detail-action'].onclick(); modal.children['store-detail-action'].onclick();
if(!state.store.ownedItems.includes('theme_crimson')) throw new Error('core confirmation/purchase failed');

state.coins=600; window.openStoreProductDetail('study_backlog');
if(modal.children['store-detail-title'].textContent !== 'مفكّك التراكم') throw new Error('study detail state failed');
modal.children['store-detail-action'].onclick(); modal.children['store-detail-action'].onclick();
if(!state.store.studyTools.owned.includes('study_backlog')) throw new Error('study confirmation/purchase failed');

state.coins=10; window.openStoreProductDetail('mystery_small');
if(!modal.children['store-detail-action'].disabled || !modal.children['store-detail-action'].textContent.includes('ينقصك')) throw new Error('insufficient-balance state failed');

console.log('PASS deterministic Store V3 simulation: detail / confirmation / core purchase / study-tool purchase / insufficient balance');

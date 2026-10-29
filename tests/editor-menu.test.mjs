import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import vm from 'node:vm';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
const {editorMenu,dispatchEditorCommand}=require('../desktop/editor-menu.cjs');
import {english} from '../public/messages-en.mjs';
import {installAppMenu} from '../public/app-menu.mjs';
const flatten=items=>items.flatMap(item=>[item,...flatten(item.submenu||[])]);

test('native file actions and timeline undo dispatch once, with translated preferences and readiness gating',()=>{
  const calls=[];
  const options={send:c=>calls.push(c),openExports(){},openData(){},quit(){}};
  const ready=flatten(editorMenu({...options,ready:true,language:'en',theme:'dark',tr:s=>english[s]||s}));
  for(const [label,command,key] of [
    ['New project','new-project','CmdOrCtrl+N'], ['Open project …','open-project','CmdOrCtrl+O'],
    ['Save project','save-project','CmdOrCtrl+S'], ['Undo','undo','CmdOrCtrl+Z'],
    ['Redo','redo','CmdOrCtrl+Shift+Z'], ['Tutorial & Help','help','F1'],
  ]){
    const item=ready.find(x=>x.label===label); assert.ok(item,label); assert.equal(item.enabled,true);
    assert.equal(item.accelerator,key); assert.equal(item.role,undefined); item.click();
    assert.equal(calls.at(-1),command);
  }
  assert.equal(calls.length,6);
  assert.equal(ready.find(x=>x.label==='English').checked,true);
  assert.equal(ready.find(x=>x.label==='Dark').checked,true);
  ready.find(x=>x.label==='Light').click(); assert.equal(calls.at(-1),'theme:light');
  const loading=flatten(editorMenu(options));
  assert.equal(loading.find(x=>x.label==='Projekt sichern').enabled,false);
  const keys=ready.map(x=>x.accelerator).filter(Boolean);assert.equal(keys.length,new Set(keys).size);
});

test('preload menu bridge never passes privileged events and removes subscriptions',async()=>{
  const apis={},listeners=new Map(),sent=[];
  const electron={contextBridge:{exposeInMainWorld:(name,api)=>apis[name]=api},ipcRenderer:{
    on:(channel,listener)=>listeners.set(channel,listener),
    removeListener:(channel,listener)=>{assert.equal(listeners.get(channel),listener);listeners.delete(channel);},
    send:channel=>sent.push(channel),invoke:()=>{},
  }};
  vm.runInNewContext(await fs.readFile(new URL('../desktop/preload.cjs',import.meta.url),'utf8'),{require:name=>{assert.equal(name,'electron');return electron;}});
  const calls=[];
  const off=apis.flightStudioMenu.onCommand((...args)=>calls.push(args));
  listeners.get('flightstudio:menu:command')({sender:'privileged'},'save-project');
  listeners.get('flightstudio:menu:command')({sender:'privileged'},{bad:true});
  assert.deepEqual(calls,[['save-project']]);
  apis.flightStudioMenu.ready();assert.deepEqual(sent,['flightstudio:menu:ready']);
  off();assert.equal(listeners.size,0);
});

test('desktop commands honor busy/modal guards, ignore unknown actions and do not duplicate native shortcuts',()=>{
  const originalDocument=globalThis.document,originalWindow=globalThis.window;
  const nodes=new Map(),events=[],clicks=[];
  let handler,ready=false,modal=false,allowed=true;
  const nav={hidden:false,querySelectorAll:()=>[],addEventListener(){},contains:()=>false};
  nodes.set('app-menubar',nav);
  for(const id of ['new-project','open-project','save-project','help','undo','language','theme']) nodes.set(id,{disabled:false,value:'',click(){clicks.push(id);},dispatchEvent(event){events.push([id,event.type,this.value]);}});
  const listeners=new Map();
  globalThis.document={getElementById:id=>nodes.get(id),querySelector:()=>modal?{}:null,documentElement:{classList:{toggle(){}}},addEventListener:(type,fn)=>listeners.set(type,fn)};
  globalThis.window={addEventListener(){},flightStudioMenu:{onCommand:fn=>handler=fn,ready:()=>ready=true}};
  try{
    installAppMenu({canRun:()=>allowed});assert.equal(ready,true);assert.equal(nav.hidden,true);
    handler('new-project');handler('save-project');handler('open-project');assert.deepEqual(clicks,['new-project','save-project','open-project']);
    handler('language:en');handler('theme:dark');assert.deepEqual(events,[['language','change','en'],['theme','change','dark']]);
    handler('__proto__');handler('theme:unknown');handler('language:<script>');assert.equal(events.length,2);
    modal=true;handler('new-project');modal=false;allowed=false;handler('new-project');allowed=true;
    nodes.get('undo').disabled=true;handler('undo');assert.equal(clicks.length,3);
    listeners.get('keydown')({key:'s',ctrlKey:true,preventDefault(){throw new Error('Native shortcut handled twice');}});
  }finally{globalThis.document=originalDocument;globalThis.window=originalWindow;}
});

test('native file menu forwards user activation without interpolating filenames or bypassing renderer guards',async()=>{
  const calls=[];
  const contents={send:(...args)=>calls.push(args),executeJavaScript:async(code,gesture)=>{
    assert.equal(gesture,true);
    vm.runInNewContext(code,{CustomEvent:class {constructor(type,options){this.type=type;this.detail=options.detail;}},window:{dispatchEvent:event=>calls.push([event.type,event.detail])}});
  }};
  await dispatchEditorCommand(contents,'open-project');
  await dispatchEditorCommand(contents,'import-media');
  await dispatchEditorCommand(contents,'save-project');
  assert.deepEqual(calls,[['flightstudio:file-menu','open-project'],['flightstudio:file-menu','import-media'],['flightstudio:menu:command','save-project']]);
});

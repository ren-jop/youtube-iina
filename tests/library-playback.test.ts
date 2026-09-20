import { afterEach, beforeEach, expect, test } from 'bun:test';
import { runInNewContext } from 'node:vm';
import { DATA_KEY, defaultOptions, exportBackup, exportSubscriptionsCsv, loadLibraryData, mergeImport, parseImport, recordPlayedVideo, saveLibraryData } from '../src/ui/storage/libraryData';
import { FAVORITES_STORAGE_KEY } from '../src/ui/constants';
import { filterByTopic } from '../src/ui/parsers/related';
import { readLockupMetadata } from '../src/ui/parsers/lockupMetadata';
import { diagnosticReport } from '../src/ui/bridge/diagnostics';
import info from '../xyz.brbc.youtube.iinaplugin/Info.json';
import { handlePlayItem } from '../src/plugin/playback';
import { installDataTransfer } from '../src/plugin/dataTransfer';

const channelId='UC'+'a'.repeat(22);
const favorite={channelId,title:'Science, "with" examples',thumbnailUrl:'',addedAt:'2026-09-19T00:00:00.000Z'};
const memory=new Map<string,string>();
let originalStorage: Storage;
beforeEach(()=>{
    originalStorage=globalThis.localStorage;
    memory.clear();
    globalThis.localStorage={getItem:(k:string)=>memory.get(k)??null,setItem:(k:string,v:string)=>memory.set(k,v),removeItem:(k:string)=>memory.delete(k)} as any;
});
afterEach(()=>{globalThis.localStorage=originalStorage; delete globalThis.iina;});

test('version report follows the installed manifest',()=>expect(diagnosticReport()).toContain(`IINA ${info.version}`));
test('topic fallback rejects spicy food and generic title overlap',()=>{
    const items=['How to quit digital addictions','10 levels of spicy food','Why you should watch this video','Addiction and self control'].map(title=>({title}));
    expect(filterByTopic(items,'How to quit your digital addiction').map(x=>x.title)).toEqual([items[0].title,items[3].title]);
    expect(filterByTopic(items,'How and why')).toEqual([]);
});
test('single metadata row recovers author without pretending views are an author',()=>{
    const metadata=(content:string)=>({metadata:{contentMetadataViewModel:{metadataRows:[{metadataParts:[{text:{content}}]}]}}});
    expect(readLockupMetadata(metadata('Science Channel')).channel).toBe('Science Channel');
    expect(readLockupMetadata(metadata('22K views')).channel).toBe('');
});
test('backup round trips channels, options and played history, excluding credentials',()=>{
    localStorage.setItem(FAVORITES_STORAGE_KEY,JSON.stringify([favorite]));
    localStorage.setItem('oauth','SUPER_SECRET');
    saveLibraryData({options:{...defaultOptions,playbackQuality:'720'},history:[]});
    recordPlayedVideo({videoId:'abcdefghijk',title:'Video',channelTitle:'Science'});
    const json=exportBackup();
    expect(json).not.toContain('SUPER_SECRET');
    const imported=parseImport(json);
    expect(imported.favorites[0].channelId).toBe(channelId);
    expect(imported.options?.playbackQuality).toBe('720');
    expect(imported.history[0].videoId).toBe('abcdefghijk');
    expect(parseImport(exportSubscriptionsCsv()).favorites[0].title).toBe(favorite.title);
});
test('history option disables new recording and duplicate visits retain one entry',()=>{
    const item={videoId:'abcdefghijk',title:'Video',channelTitle:'Science'};
    recordPlayedVideo(item); recordPlayedVideo(item);
    expect(loadLibraryData().history).toHaveLength(1);
    const data=loadLibraryData(); data.options.rememberHistory=false; saveLibraryData(data);
    recordPlayedVideo({...item,videoId:'12345678901'});
    expect(loadLibraryData().history).toHaveLength(1);
});
test('merge keeps local channel edits and does not replace settings unless selected',()=>{
    localStorage.setItem(FAVORITES_STORAGE_KEY,JSON.stringify([favorite]));
    const incoming={favorites:[{...favorite,title:'Imported'}],history:[],options:{...defaultOptions,compactCards:true}};
    mergeImport(incoming,false);
    expect(JSON.parse(localStorage.getItem(FAVORITES_STORAGE_KEY)!)[0].title).toBe(favorite.title);
    expect(loadLibraryData().options.compactCards).toBe(false);
    mergeImport(incoming,true);
    expect(loadLibraryData().options.compactCards).toBe(true);
});
test('rejects bad formats, dangerous channel IDs, and future schemas before writing',()=>{
    for(const text of ['{}','Channel Id,Channel Title\n../../etc/test,Name',JSON.stringify({format:'youtube-iina',schemaVersion:99,favorites:[],history:[]})]) expect(()=>parseImport(text)).toThrow();
    expect(memory.size).toBe(0);
});
test('failed import rolls back its first storage write',()=>{
    const data={options:defaultOptions,history:[]}; saveLibraryData(data);
    const original=localStorage.getItem(DATA_KEY);
    const set=localStorage.setItem; let failed=false;
    localStorage.setItem=(key,value)=>{if(key===FAVORITES_STORAGE_KEY&&!failed){failed=true;throw new Error('Quota');} set(key,value);};
    expect(()=>mergeImport({favorites:[favorite],history:[],options:{...defaultOptions,compactCards:true}},true)).toThrow();
    expect(localStorage.getItem(DATA_KEY)).toBe(original);
    expect(localStorage.getItem(FAVORITES_STORAGE_KEY)).toBeNull();
});
test('native transfer safely encodes template characters and cancel does not write',()=>{
    let handler: Function=()=>{}; let reply=''; let writes=0;
    globalThis.iina={sidebar:{onMessage(_n:string,h:Function){handler=h;},postMessage(_n:string,v:string){reply=v;}},utils:{chooseFile:()=>'/tmp/backup.json'},file:{read:()=>'`${danger}`',write(){writes++;}}} as any;
    installDataTransfer(()=>false); handler({action:'import'});
    expect(JSON.parse(decodeURIComponent(reply)).text).toBe('`${danger}`');
    expect(reply).not.toContain('`');
    globalThis.iina.utils.chooseFile=()=>''; handler({action:'export',text:'data'});
    expect(JSON.parse(decodeURIComponent(reply)).cancelled).toBe(true); expect(writes).toBe(0);
});
test('native playback never clears or starts a rejected playlist insertion',()=>{
    globalThis.iina={playlist:{count:()=>1,add:()=>false,play(){throw new Error('Should not play');}},mpv:{command(){throw new Error('Should not clear');}}} as any;
    expect(handlePlayItem({videoId:'abcdefghijk',url:''})).toBe(false);
});
test('rapid selections coalesce and closing cancels a pending switch',async()=>{
    const built=await Bun.build({entrypoints:['src/plugin/main.ts'],target:'browser',format:'iife'});
    const handlers:Record<string,Function>={},events:Record<string,Function[]>={};
    const timers=new Map<number,Function>();let next=0;const selected:string[]=[];const commands:string[]=[];
    runInNewContext(await built.outputs[0].text(),{setTimeout:(fn:Function)=>{timers.set(++next,fn);return next;},clearTimeout:(id:number)=>timers.delete(id),iina:{
        console:{log(){},error(){}},event:{on(name:string,fn:Function){(events[name] ||= []).push(fn);}},
        sidebar:{loadFile(){},onMessage(name:string,fn:Function){handlers[name]=fn;},postMessage(){}},
        global:{onMessage(){},postMessage(){}},preferences:{get:()=>false},core:{status:{url:''}},
        playlist:{count:()=>1,add(url:string){selected.push(url);return true;},play(){}},mpv:{command(name:string,args:string[]){commands.push([name,...args].join(" "));}},menu:{},utils:{},http:{},overlay:{}
    }});
    for(const fn of events['iina.window-loaded']) fn();
    handlers.togglePlayback({});
    expect(commands).toEqual(["cycle pause"]);
    handlers.playItem({videoId:'abcdefghijk'});handlers.playItem({videoId:'12345678901'});
    expect(timers.size).toBe(1);
    for(const fn of timers.values()) fn();timers.clear();
    expect(selected).toEqual(['https://www.youtube.com/watch?v=12345678901']);
    handlers.playItem({videoId:'abcdefghijk'});
    for(const fn of events['iina.window-will-close']) fn();
    expect(timers.size).toBe(0);
    const previousCommands=commands.length; handlers.togglePlayback({});
    expect(commands.length).toBe(previousCommands);
});

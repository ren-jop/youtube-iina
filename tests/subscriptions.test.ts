import { test, expect } from 'bun:test';
import { publicationTime, newestFirst, filterSubscriptions } from '../src/ui/controller/subscriptionTools';
import { createRefreshQueue } from '../src/ui/utils/refreshQueue';
import type { FeedVideoItem } from '../src/ui/types';
const item=(title:string,published:string,channelTitle='Studio Notes')=>({title,published,channelTitle} as FeedVideoItem);
test('subscriptions sort English, Japanese and calendar dates newest first with stable ties',()=>{
 const now=Date.parse('2026-09-26T12:00:00Z');
 const items=[item('unknown',''),item('old','3 months ago'),item('recent','2時間前'),item('same','2 hours ago'),item('day','2026-09-25'),item('week','1週間前')];
 expect(newestFirst(items,now).map(x=>x.title)).toEqual(['recent','same','day','week','old','unknown']);
 expect(publicationTime('12K views',now)).toBe(0);
 expect(publicationTime('２日前',now)).toBe(now-172800000);
 expect(items[0].title).toBe('unknown');
});
test('subscription search matches title and channel together without changing feed data',()=>{
 const items=[item('Digital attention','today'),item('Cooking','yesterday','Kitchen')];
 expect(filterSubscriptions(items,'STUDIO attention')).toEqual([items[0]]);
 expect(filterSubscriptions(items,'missing')).toEqual([]);
 expect(filterSubscriptions(items,'  ')).toEqual(items);
});
test('refresh combines a burst into one trailing fresh pass without overlap',async()=>{
 const releases:Array<()=>void>=[];let calls=0;
 const refresh=createRefreshQueue(()=>{calls++;return new Promise<void>(r=>releases.push(r));});
 const first=refresh();expect(refresh()).toBe(first);refresh(true);refresh(true);
 expect(calls).toBe(1);releases.shift()!();await Promise.resolve();
 expect(calls).toBe(2);releases.shift()!();await first;expect(calls).toBe(2);
 const next=refresh();expect(calls).toBe(3);releases.shift()!();await next;
});
test('refresh recovers after rejection',async()=>{
 let calls=0;const refresh=createRefreshQueue(async()=>{if(++calls===1)throw Error('offline');});
 await expect(refresh()).rejects.toThrow('offline');await refresh();expect(calls).toBe(2);
});

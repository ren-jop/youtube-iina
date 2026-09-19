import { sendHttpRequest } from "../bridge/httpBridge";
import { getOptions } from "../storage/libraryData";

const names = new Map<string, string>();
const requests = new Map<string, Promise<string>>();
const queue: Array<() => void> = [];
let active = 0;
function pump(): void { while(active < 2 && queue.length) { active++; queue.shift()!(); } }
export function resolveChannelName(videoId: string): Promise<string> {
    if(!/^[\w-]{11}$/.test(videoId) || !getOptions().resolveChannels) return Promise.resolve("");
    if(names.has(videoId)) return Promise.resolve(names.get(videoId)!);
    const pending=requests.get(videoId); if(pending) return pending;
    const promise=new Promise<string>(resolve=>{
        queue.push(()=>{
            void (async()=>{
                let name="";
                try {
                    if(getOptions().resolveChannels) {
                        const response=await sendHttpRequest({method:"GET",url:`https://www.youtube.com/oembed?url=${encodeURIComponent(`https://www.youtube.com/watch?v=${videoId}`)}&format=json`},6000);
                        if(response.ok && response.text) {
                            const author=JSON.parse(response.text)?.author_name;
                            if(typeof author==='string') name=author.trim().slice(0,200);
                        }
                    }
                } catch { /* Keep the card usable if attribution is unavailable. */ }
                finally { names.set(videoId,name); if(names.size>500) names.delete(names.keys().next().value!); requests.delete(videoId); active--; resolve(name); pump(); }
            })();
        });
    });
    requests.set(videoId,promise); pump(); return promise;
}

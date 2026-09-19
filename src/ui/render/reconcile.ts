// Keep unchanged cards (including decoded images and keyboard focus) in the DOM.
const caches = new WeakMap<HTMLElement, Map<string, { signature: string; node: HTMLElement }>>();
export function reconcileList<T>(list: HTMLElement, items: T[], key: (item:T)=>string, signature:(item:T)=>string, build:(item:T)=>HTMLElement): void {
    const previous = caches.get(list) || new Map();
    const next = new Map<string, {signature:string;node:HTMLElement}>();
    items.forEach((item,index)=>{
        const id=key(item), stamp=signature(item), old=previous.get(id);
        const entry=old?.signature===stamp ? old : {signature:stamp,node:build(item)};
        if(list.children[index]!==entry.node) list.insertBefore(entry.node,list.children[index] || null);
        next.set(id,entry);
    });
    const retained = new Set([...next.values()].map(entry => entry.node));
    for(const child of Array.from(list.children)) if(!retained.has(child as HTMLElement)) child.remove();
    caches.set(list,next);
}

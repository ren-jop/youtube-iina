// Attribution is supplementary: do not spend requests on offscreen video cards.
const callbacks = new WeakMap<Element, () => void>();
let observer: IntersectionObserver | undefined;
export function whenVisible(element: HTMLElement, action: () => void): void {
    if(typeof IntersectionObserver === 'undefined') { action(); return; }
    observer ||= new IntersectionObserver(entries=>{
        for(const entry of entries) {
            if(!entry.target.isConnected) { observer?.unobserve(entry.target); callbacks.delete(entry.target); continue; }
            if(entry.isIntersecting) { observer?.unobserve(entry.target); callbacks.get(entry.target)?.(); callbacks.delete(entry.target); }
        }
    },{rootMargin:'100px'});
    callbacks.set(element,action);observer.observe(element);
}

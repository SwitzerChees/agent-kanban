// Runs before prototype scripts, inside an opaque-origin sandbox. Never receives
// account credentials or the public share token. Messages cannot mutate server state.
export function showroomBridge(filePath: string, snapshotId: string) {
  return `<script>(() => {
    const viewPath = ${JSON.stringify(filePath).replace(/</g, '\\u003c')};
    const snapshotId = ${JSON.stringify(snapshotId)};
    let mode = 'interact', current = null, start = null, box = null;
    const send = (type, extra = {}) => parent.postMessage({ source: 'ak-showroom', type, viewPath, snapshotId, ...extra }, '*');
    const viewport = () => ({ width: innerWidth, height: innerHeight, scrollX: Math.max(0, scrollX), scrollY: Math.max(0, scrollY) });
    function selector(el) {
      const parts = [];
      for (let node = el; node && node.nodeType === 1 && parts.length < 12; node = node.parentElement) {
        if (node.id) { parts.unshift('#' + CSS.escape(node.id)); break; }
        let part = node.tagName.toLowerCase();
        if (node.parentElement) {
          const siblings = [...node.parentElement.children].filter(s => s.tagName === node.tagName);
          if (siblings.length > 1) part += ':nth-of-type(' + (siblings.indexOf(node) + 1) + ')';
        }
        parts.unshift(part);
      }
      return parts.join(' > ').slice(0, 2000);
    }
    function paint(rect) {
      if (!box) {
        box = document.createElement('div');
        box.setAttribute('data-ak-showroom-overlay', '');
        box.style.cssText = 'position:fixed;pointer-events:none;z-index:2147483647;border:2px solid #0d9488;background:rgba(13,148,136,.10);box-sizing:border-box';
        document.documentElement.append(box);
      }
      Object.assign(box.style, { display:'block', left:rect.x+'px', top:rect.y+'px', width:rect.width+'px', height:rect.height+'px' });
    }
    function hide() { if (box) box.style.display = 'none'; }
    function rectOf(el) { const r = el.getBoundingClientRect(); return { x:r.x, y:r.y, width:r.width, height:r.height }; }
    function capture(el) {
      const r = rectOf(el);
      return { kind:'element', selector:selector(el), tag:el.tagName.toLowerCase(),
        text:(el.getAttribute('aria-label') || el.innerText || el.textContent || '').trim().slice(0,500),
        rect:{ x:Math.max(0,r.x+scrollX), y:Math.max(0,r.y+scrollY), width:r.width, height:r.height }, viewport:viewport() };
    }
    window.addEventListener('message', event => {
      if (event.source !== parent || !event.data || event.data.source !== 'ak-showroom-host') return;
      if (event.data.type === 'mode' && ['interact','element','region'].includes(event.data.mode)) {
        mode = event.data.mode; current = null; start = null; hide();
        document.documentElement.style.cursor = mode === 'interact' ? '' : 'crosshair';
      }
      if (event.data.type === 'parent' && current?.parentElement) { current = current.parentElement; paint(rectOf(current)); send('selected', { anchor:capture(current) }); }
      if (event.data.type === 'highlight' && event.data.anchor) {
        const a = event.data.anchor; let el = null;
        try { if (a.selector) el = document.querySelector(a.selector); } catch {}
        if (el) { el.scrollIntoView({block:'center'}); paint(rectOf(el)); }
        else if (a.rect) { window.scrollTo(0, Math.max(0, a.rect.y-100)); paint({ ...a.rect, x:a.rect.x-scrollX, y:a.rect.y-scrollY }); }
      }
      if (event.data.type === 'ping') send('ready');
    });
    document.addEventListener('pointermove', event => {
      if (mode === 'element' && !current && event.target instanceof Element && event.target !== box) paint(rectOf(event.target));
      if (mode === 'region' && start) paint({ x:Math.min(start.x,event.clientX), y:Math.min(start.y,event.clientY), width:Math.abs(event.clientX-start.x), height:Math.abs(event.clientY-start.y) });
    }, true);
    document.addEventListener('pointerdown', event => {
      if (mode === 'interact') return;
      event.preventDefault(); event.stopImmediatePropagation();
      if (mode === 'region') start = { x:event.clientX, y:event.clientY };
    }, true);
    document.addEventListener('pointerup', event => {
      if (mode !== 'region' || !start) return;
      event.preventDefault(); event.stopImmediatePropagation();
      const rect = { x:Math.min(start.x,event.clientX)+scrollX, y:Math.min(start.y,event.clientY)+scrollY, width:Math.abs(event.clientX-start.x), height:Math.abs(event.clientY-start.y) };
      start = null;
      if (rect.width > 3 && rect.height > 3) send('selected', { anchor:{ kind:'region', rect, viewport:viewport() } });
    }, true);
    document.addEventListener('click', event => {
      if (mode === 'interact') return;
      event.preventDefault(); event.stopImmediatePropagation();
      if (mode === 'element' && event.target instanceof Element) {
        current = event.target; paint(rectOf(current)); send('selected', { anchor:capture(current) });
      }
    }, true);
    document.addEventListener('keydown', event => { if (event.key === 'Escape') { mode='interact'; hide(); send('escape'); } }, true);
    window.addEventListener('DOMContentLoaded', () => send('ready'));
    send('ready');
  })();<\/script>`;
}

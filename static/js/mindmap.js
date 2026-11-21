/**
 * Interactive concept map: tidy left-to-right tree, wheel/pinch zoom, drag to pan,
 * collapsible branches and a hover card with short + full definition.
 *
 * Usage: MindMap.init({ onSeek(seconds) }); MindMap.render(treeData);
 * Tree node: { label, short, definition, ts, children: [] }
 */
(function () {
    const SVG_NS = 'http://www.w3.org/2000/svg';
    const NODE_H = 32;
    const ROW_GAP = 10;
    let COL_GAP = 72;
    let MAX_LABEL_W = 230;
    const MIN_K = 0.2;
    const MAX_K = 3;

    const cfg = { onSeek: null };
    const view = { k: 1, x: 0, y: 0 };
    let root = null;
    let nextId = 1;
    let els = {};
    let hideTimer = null;
    let pointers = new Map();
    let dragMoved = false;
    let pinchStart = null;

    function $(id) { return document.getElementById(id); }
    function esc(s) {
        return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    }
    function svgEl(name, attrs) {
        const e = document.createElementNS(SVG_NS, name);
        Object.keys(attrs || {}).forEach((k) => e.setAttribute(k, attrs[k]));
        return e;
    }
    function tsToSeconds(ts) {
        const p = String(ts).split(':').map(Number);
        return p.length === 3 ? p[0] * 3600 + p[1] * 60 + p[2] : p[0] * 60 + p[1];
    }

    /* ---------------- data ---------------- */
    function prepare(node, depth, parent) {
        node._id = nextId++;
        node._depth = depth;
        node._parent = parent;
        node._collapsed = depth >= 3 && (node.children || []).length > 0;
        (node.children || []).forEach((c) => prepare(c, depth + 1, node));
        return node;
    }

    function textWidth(label, depth) {
        const per = depth === 0 ? 8.2 : 7.1;
        return Math.max(depth === 0 ? Math.min(150, MAX_LABEL_W) : 96, Math.min(MAX_LABEL_W, Math.round(label.length * per + 34)));
    }

    /* ---------------- layout ---------------- */
    function layout() {
        const colMax = [];
        (function measure(n) {
            n._w = textWidth(n.label, n._depth);
            colMax[n._depth] = Math.max(colMax[n._depth] || 0, n._w);
            if (!n._collapsed) (n.children || []).forEach(measure);
        })(root);

        const colX = [];
        let acc = 0;
        colMax.forEach((w, d) => { colX[d] = acc; acc += w + COL_GAP; });

        let cursor = 0;
        (function place(n) {
            n._x = colX[n._depth];
            const kids = n._collapsed ? [] : (n.children || []);
            if (!kids.length) {
                n._y = cursor;
                cursor += NODE_H + ROW_GAP;
            } else {
                kids.forEach(place);
                n._y = (kids[0]._y + kids[kids.length - 1]._y) / 2;
            }
        })(root);
        return { width: acc - COL_GAP, height: cursor - ROW_GAP };
    }

    /* ---------------- render ---------------- */
    function draw() {
        const size = layout();
        const g = els.g;
        g.innerHTML = '';
        const edges = svgEl('g', { class: 'mm-edges' });
        const nodes = svgEl('g', { class: 'mm-nodes' });
        g.appendChild(edges);
        g.appendChild(nodes);

        (function walk(n) {
            const kids = n._collapsed ? [] : (n.children || []);
            kids.forEach((c) => {
                const x1 = n._x + n._w, y1 = n._y + NODE_H / 2;
                const x2 = c._x, y2 = c._y + NODE_H / 2;
                const mx = (x1 + x2) / 2;
                edges.appendChild(svgEl('path', { class: 'mm-edge', d: `M${x1} ${y1} C${mx} ${y1} ${mx} ${y2} ${x2} ${y2}` }));
                walk(c);
            });
            nodes.appendChild(buildNode(n));
        })(root);

        els.size = size;
    }

    function buildNode(n) {
        const grp = svgEl('g', { class: `mm-node d${Math.min(n._depth, 3)}`, transform: `translate(${n._x} ${n._y})`, tabindex: '0', role: 'button', 'aria-label': n.label });
        grp.dataset.id = n._id;
        grp.appendChild(svgEl('rect', { class: 'mm-rect', width: n._w, height: NODE_H, rx: 5 }));

        const maxChars = Math.floor((n._w - 24) / (n._depth === 0 ? 8.2 : 7.1));
        const label = n.label.length > maxChars ? n.label.slice(0, Math.max(1, maxChars - 1)) + '…' : n.label;
        const t = svgEl('text', { class: 'mm-text', x: 12, y: NODE_H / 2 + 4.5 });
        t.textContent = label;
        grp.appendChild(t);

        const kids = n.children || [];
        if (kids.length) {
            const tog = svgEl('g', { class: 'mm-toggle', transform: `translate(${n._w} ${NODE_H / 2})` });
            tog.appendChild(svgEl('circle', { r: 9 }));
            const tt = svgEl('text', { y: 3.6, 'text-anchor': 'middle' });
            tt.textContent = n._collapsed ? String(kids.length) : '−';
            tog.appendChild(tt);
            tog.addEventListener('click', (e) => { e.stopPropagation(); n._collapsed = !n._collapsed; hideCard(true); draw(); });
            tog.addEventListener('pointerdown', (e) => e.stopPropagation());
            grp.appendChild(tog);
        }

        grp.addEventListener('mouseenter', () => showCard(n, grp));
        grp.addEventListener('mouseleave', () => scheduleHide());
        grp.addEventListener('focus', () => showCard(n, grp));
        grp.addEventListener('click', (e) => { if (!dragMoved) showCard(n, grp); });
        return grp;
    }

    /* ---------------- hover card ---------------- */
    function showCard(n, grp) {
        clearTimeout(hideTimer);
        const card = els.card;
        const jump = n.ts
            ? `<button type="button" class="ts mm-jump" data-ts="${esc(n.ts)}"><svg><use href="#i-play"/></svg>${esc(n.ts)}</button>`
            : '';
        card.innerHTML = `
            <div class="mm-card-top">
                <span class="mm-card-title">${esc(n.label)}</span>${jump}
            </div>
            ${n.short ? `<p class="mm-card-short">${esc(n.short)}</p>` : ''}
            ${n.definition ? `<p class="mm-card-def">${esc(n.definition)}</p>` : ''}
            ${(n.children || []).length ? `<p class="mm-card-meta">${n.children.length} sub-topic${n.children.length === 1 ? '' : 's'}</p>` : ''}`;
        card.classList.remove('hidden');

        const jumpBtn = card.querySelector('.mm-jump');
        if (jumpBtn && cfg.onSeek) jumpBtn.addEventListener('click', () => cfg.onSeek(tsToSeconds(n.ts)));

        // Position next to the node, inside the viewport box
        const wrap = els.wrap.getBoundingClientRect();
        const r = grp.getBoundingClientRect();
        const cw = card.offsetWidth, ch = card.offsetHeight;
        let left = r.right - wrap.left + 12;
        if (left + cw > wrap.width - 8) left = r.left - wrap.left - cw - 12;
        if (left < 8) left = Math.max(8, Math.min(wrap.width - cw - 8, r.left - wrap.left));
        let top = r.top - wrap.top + r.height / 2 - ch / 2;
        top = Math.max(8, Math.min(wrap.height - ch - 8, top));
        if (left < r.right - wrap.left + 12 && left + cw > r.left - wrap.left && top < r.bottom - wrap.top && top + ch > r.top - wrap.top) {
            top = r.bottom - wrap.top + 10; // overlapping the node: drop below it
            if (top + ch > wrap.height - 8) top = Math.max(8, r.top - wrap.top - ch - 10);
        }
        card.style.left = left + 'px';
        card.style.top = top + 'px';
    }

    function scheduleHide() {
        clearTimeout(hideTimer);
        hideTimer = setTimeout(() => hideCard(), 140);
    }
    function hideCard(now) {
        clearTimeout(hideTimer);
        if (els.card) els.card.classList.add('hidden');
    }

    /* ---------------- zoom / pan ---------------- */
    function apply() {
        els.g.setAttribute('transform', `translate(${view.x} ${view.y}) scale(${view.k})`);
        if (els.label) els.label.textContent = Math.round(view.k * 100) + '%';
    }

    function zoomAt(factor, cx, cy) {
        const k2 = Math.max(MIN_K, Math.min(MAX_K, view.k * factor));
        const f = k2 / view.k;
        view.x = cx - (cx - view.x) * f;
        view.y = cy - (cy - view.y) * f;
        view.k = k2;
        hideCard();
        apply();
    }

    function viewportCenter() {
        const r = els.viewport.getBoundingClientRect();
        return { x: r.width / 2, y: r.height / 2 };
    }

    function fit() {
        if (!els.size) return;
        const vp = els.viewport.getBoundingClientRect();
        if (!vp.width) return;
        const pad = 36;
        const k = Math.max(MIN_K, Math.min(1.4, Math.min((vp.width - pad * 2) / els.size.width, (vp.height - pad * 2) / els.size.height)));
        view.k = k;
        view.x = (vp.width - els.size.width * k) / 2;
        view.y = (vp.height - els.size.height * k) / 2;
        hideCard();
        apply();
    }

    function bindInteractions() {
        const vp = els.viewport;

        vp.addEventListener('wheel', (e) => {
            e.preventDefault();
            const r = vp.getBoundingClientRect();
            const delta = e.deltaMode === 1 ? e.deltaY * 16 : e.deltaY;
            zoomAt(Math.exp(-delta * 0.0016), e.clientX - r.left, e.clientY - r.top);
        }, { passive: false });

        vp.addEventListener('pointerdown', (e) => {
            if (e.button !== undefined && e.button > 0) return;
            pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
            dragMoved = false;
            if (pointers.size === 2) {
                const [a, b] = [...pointers.values()];
                pinchStart = { dist: Math.hypot(a.x - b.x, a.y - b.y), k: view.k };
            }
            vp.setPointerCapture(e.pointerId);
            vp.classList.add('grabbing');
        });

        vp.addEventListener('pointermove', (e) => {
            const prev = pointers.get(e.pointerId);
            if (!prev) return;
            const cur = { x: e.clientX, y: e.clientY };
            if (pointers.size === 2 && pinchStart) {
                pointers.set(e.pointerId, cur);
                const [a, b] = [...pointers.values()];
                const dist = Math.hypot(a.x - b.x, a.y - b.y);
                const r = vp.getBoundingClientRect();
                const target = pinchStart.k * (dist / pinchStart.dist);
                zoomAt(target / view.k, (a.x + b.x) / 2 - r.left, (a.y + b.y) / 2 - r.top);
                dragMoved = true;
                return;
            }
            const dx = cur.x - prev.x, dy = cur.y - prev.y;
            if (Math.abs(dx) + Math.abs(dy) > 0) {
                if (!dragMoved && Math.abs(cur.x - prev.x) + Math.abs(cur.y - prev.y) < 1) return;
                dragMoved = dragMoved || Math.hypot(dx, dy) > 1.5;
                if (dragMoved) { hideCard(); view.x += dx; view.y += dy; apply(); }
            }
            pointers.set(e.pointerId, cur);
        });

        const end = (e) => {
            pointers.delete(e.pointerId);
            if (pointers.size < 2) pinchStart = null;
            if (!pointers.size) vp.classList.remove('grabbing');
            setTimeout(() => { dragMoved = false; }, 0);
        };
        vp.addEventListener('pointerup', end);
        vp.addEventListener('pointercancel', end);

        vp.addEventListener('dblclick', (e) => { if (!e.target.closest('.mm-node')) fit(); });
        vp.addEventListener('keydown', (e) => {
            const c = viewportCenter();
            if (e.key === '+' || e.key === '=') { e.preventDefault(); zoomAt(1.2, c.x, c.y); }
            else if (e.key === '-' || e.key === '_') { e.preventDefault(); zoomAt(1 / 1.2, c.x, c.y); }
            else if (e.key === '0') { e.preventDefault(); fit(); }
            else if (e.key === 'ArrowLeft') { view.x += 40; apply(); }
            else if (e.key === 'ArrowRight') { view.x -= 40; apply(); }
            else if (e.key === 'ArrowUp') { view.y += 40; apply(); }
            else if (e.key === 'ArrowDown') { view.y -= 40; apply(); }
        });

        els.card.addEventListener('mouseenter', () => clearTimeout(hideTimer));
        els.card.addEventListener('mouseleave', scheduleHide);

        $('mm-zoom-in').addEventListener('click', () => { const c = viewportCenter(); zoomAt(1.25, c.x, c.y); });
        $('mm-zoom-out').addEventListener('click', () => { const c = viewportCenter(); zoomAt(1 / 1.25, c.x, c.y); });
        $('mm-fit').addEventListener('click', fit);
        $('mm-expand').addEventListener('click', () => toggleAll());

        window.addEventListener('resize', () => { if (root && !els.wrap.closest('.hidden')) fit(); });
    }

    let allOpen = false;
    function toggleAll() {
        if (!root) return;
        allOpen = !allOpen;
        (function walk(n) {
            n._collapsed = !allOpen && (n.children || []).length > 0 && n._depth >= 3;
            (n.children || []).forEach(walk);
        })(root);
        $('mm-expand').querySelector('span').textContent = allOpen ? 'Collapse' : 'Expand all';
        hideCard();
        draw();
        fit();
    }

    /* ---------------- public ---------------- */
    function init(options) {
        Object.assign(cfg, options || {});
        els = {
            wrap: $('mm-wrap'),
            viewport: $('mm-viewport'),
            svg: $('mm-svg'),
            g: $('mm-g'),
            card: $('mm-card'),
            label: $('mm-zoom-label')
        };
        bindInteractions();
    }

    function render(tree) {
        nextId = 1;
        allOpen = false;
        $('mm-expand').querySelector('span').textContent = 'Expand all';
        root = prepare(JSON.parse(JSON.stringify(tree)), 0, null);
        // On narrow screens use tighter columns and start with topics only
        const narrow = els.viewport.getBoundingClientRect().width < 600;
        COL_GAP = narrow ? 36 : 72;
        MAX_LABEL_W = narrow ? 150 : 230;
        if (narrow) {
            (root.children || []).forEach((t) => { if ((t.children || []).length) t._collapsed = true; });
        } else {
            autoExpand(root);
        }
        draw();
        // Fit once layout has dimensions (the tab may have just become visible)
        requestAnimationFrame(() => requestAnimationFrame(fit));
    }

    /** Start readable: collapse every topic, then re-open them in order while the map stays small. */
    const MAX_ROWS = 14;
    function autoExpand(r) {
        const topics = r.children || [];
        topics.forEach((t) => { if ((t.children || []).length) t._collapsed = true; });
        let rows = topics.length;
        for (const t of topics) {
            const kids = t.children || [];
            if (!kids.length) continue;
            if (rows - 1 + kids.length <= MAX_ROWS) { t._collapsed = false; rows += kids.length - 1; }
        }
    }

    function clear() { root = null; if (els.g) els.g.innerHTML = ''; hideCard(); }

    window.MindMap = { init, render, fit, clear };
})();

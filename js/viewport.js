import { applySize, sizeSnapshot } from './dimensions.js';

// Diagram coordinates are independent of the visible canvas dimensions.
export const COORDINATE_LIMIT = 1e9;
export const MIN_ZOOM = 1e-8;
export const MAX_ZOOM = 3;
export const VIEW_STORAGE_KEY = 'er-diagram-view-v1';

export function validCoordinate(value) {
    return Number.isFinite(value) && Math.abs(value) <= COORDINATE_LIMIT;
}

export function constrainPosition(position) {
    return Object.fromEntries(['x', 'y'].map(key => [key,
        Math.max(-COORDINATE_LIMIT, Math.min(COORDINATE_LIMIT, position[key]))]));
}

export function visibleBounds({ x, y, scale, width, height }) {
    return { x: -x / scale, y: -y / scale, width: width / scale, height: height / scale };
}

export function gridSpacing(scale, base = 20) {
    return base * 2 ** Math.max(0, Math.ceil(Math.log2(14 / (base * scale))));
}

export function imageDimensions(bounds, requestedRatio = 2) {
    const ratio = Math.min(requestedRatio, 8192 / bounds.width, 8192 / bounds.height,
        Math.sqrt(16_000_000 / (bounds.width * bounds.height)));
    return { ratio, width: Math.max(1, Math.floor(bounds.width * ratio)),
        height: Math.max(1, Math.floor(bounds.height * ratio)), reduced: ratio < requestedRatio * 0.999 };
}

export function diagramSignature(serialized) {
    let hash = 2166136261;
    for (let i = 0; i < serialized.length; i++) hash = Math.imul(hash ^ serialized.charCodeAt(i), 16777619);
    return `${serialized.length}:${hash >>> 0}`;
}

export function validView(view, signature) {
    return view?.signature === signature && Number.isFinite(view.scale) &&
        view.scale >= MIN_ZOOM && view.scale <= MAX_ZOOM &&
        Number.isFinite(view.x) && Number.isFinite(view.y) &&
        Math.abs(view.x / view.scale) <= COORDINATE_LIMIT * 2 &&
        Math.abs(view.y / view.scale) <= COORDINATE_LIMIT * 2;
}

export class CanvasNavigation {
    constructor(renderer) {
        this.renderer = renderer;
        this.stage = renderer.stage;
        this.container = renderer.container;
        this.pointers = new Map();
        this.gesture = null;
        this.ready = false;
        this.pointer = null;
        this.frame = 0;
        this.lastFrame = 0;
        const options = { capture: true, passive: false };
        for (const name of ['pointerdown', 'pointermove', 'pointerup', 'pointercancel']) {
            this.container.addEventListener(name, event => this.handlePointer(event), options);
        }
        // One pointer pipeline owns mouse and touch; suppress compatibility events.
        for (const name of ['mousedown', 'mousemove', 'mouseup', 'touchstart', 'touchmove', 'touchend']) {
            this.container.addEventListener(name, event => {
                // A modal can appear on pointerup. Cancel the touch default so its
                // synthetic mouse click cannot focus a newly exposed form field.
                event.preventDefault();
                event.stopImmediatePropagation();
            }, options);
        }
        this.container.addEventListener('pointerleave', () => {
            if (!this.pointers.size) { this.pointer = null; this.stopEdge(); }
        });
        this.container.addEventListener('wheel', event => {
            event.preventDefault();
            event.stopImmediatePropagation();
            if (this.gesture || document.querySelector('.modal-overlay.active')) return;
            const pointer = this.local(event);
            const world = this.world(pointer);
            this.renderer.setZoom(this.renderer.scale * Math.exp(-Math.max(-100, Math.min(100, event.deltaY)) * 0.002), world, pointer);
        }, options);
        document.addEventListener('keydown', event => {
            if (event.code === 'Space' && !document.querySelector('.modal-overlay.active') &&
                !['INPUT', 'TEXTAREA', 'SELECT', 'BUTTON'].includes(event.target?.tagName)) {
                event.preventDefault();
            }
        });
        window.addEventListener('blur', () => this.cancel());
        window.addEventListener('pagehide', () => this.persist());
        document.addEventListener('visibilitychange', () => {
            if (document.hidden) { this.cancel(); this.persist(); }
        });
        renderer.state.subscribe(reason => { if (reason === 'save') this.schedulePersist(); });
    }

    local(event) {
        const box = this.container.getBoundingClientRect();
        return { x: event.clientX - box.left, y: event.clientY - box.top };
    }
    world(point) { return { x: (point.x - this.stage.x()) / this.renderer.scale, y: (point.y - this.stage.y()) / this.renderer.scale }; }
    getGroup(hit) { return hit?.findAncestor('Group', true); }
    updateCursor() {
        const tool = window.app?.currentTool || 'select';
        this.container.style.cursor = this.renderer.isPanning ? 'grabbing' :
            tool === 'pan' ? 'grab' :
            this.gesture?.kind === 'resize' ? this.resizeCursor(this.gesture.handle) :
            this.gesture?.kind === 'lasso' ? 'crosshair' : tool === 'select' ? 'default' : 'crosshair';
    }
    resizeCursor(handle) { return ({ n: 'ns', s: 'ns', e: 'ew', w: 'ew', ne: 'nesw', sw: 'nesw', nw: 'nwse', se: 'nwse' })[handle] + '-resize'; }

    handlePointer(event) {
        if (event.button > 1 && event.type === 'pointerdown') return;
        if (event.button === 1 && window.app?.currentTool !== 'pan') {
            event.preventDefault();
            event.stopImmediatePropagation();
            return;
        }
        if (document.querySelector('.modal-overlay.active')) return;
        event.preventDefault();
        event.stopImmediatePropagation();
        const point = this.local(event);
        this.pointer = point;
        this.stage.setPointersPositions(event);
        if (event.type === 'pointerdown') {
            this.container.focus({ preventScroll: true });
            this.container.setPointerCapture(event.pointerId);
            this.pointers.set(event.pointerId, point);
            if (this.pointers.size === 2) {
                this.finishNode(true);
                const pinch = this.pinchPoints();
                this.gesture = { kind: 'pinch', moved: true, ...pinch, anchor: pinch.center };
                this.renderer.isPanning = window.app?.currentTool === 'pan';
                this.stopEdge();
                return;
            }
            if (this.pointers.size > 2) return;
            const hit = this.stage.getIntersection(point);
            const group = this.getGroup(hit);
            const tool = window.app?.currentTool || 'select';
            const kind = tool === 'pan' ? 'pan' :
                tool === 'select' && hit?.getAttr('resizeHandle') ? 'resize' :
                tool === 'select' && ['entity', 'association', 'text'].includes(group?.getAttr('itemType')) ? 'node' : 'tap';
            this.gesture = { kind, start: point, last: point, hit, group, moved: false };
            if (kind === 'node' || kind === 'resize') {
                const type = group.getAttr('itemType');
                const id = group.getAttr('itemId');
                const node = type === 'entity' ? this.renderer.state.getEntity(id) : type === 'text' ? this.renderer.state.getText(id) : this.renderer.state.getAssociation(id);
                const world = this.world(point);
                Object.assign(this.gesture, { node, type, original: { x: node.x, y: node.y }, offset: { x: world.x - node.x, y: world.y - node.y } });
                if (kind === 'resize') Object.assign(this.gesture, { original: sizeSnapshot(node),
                    originalRect: this.renderer.nodeRectangle(node, type), handle: hit.getAttr('resizeHandle'), startWorld: world });
                // Multi-drag: track all selected nodes if dragging a selected item
                if (kind === 'node') {
                    const selected = this.renderer.state.selectedItems;
                    const isSelected = selected.some(s => s.id === id && s.type === type);
                    if (isSelected && selected.length > 1) {
                        this.gesture.multiDrag = selected
                            .filter(s => ['entity', 'association', 'text'].includes(s.type) && !(s.id === id && s.type === type))
                            .map(s => {
                                const n = s.type === 'entity' ? this.renderer.state.getEntity(s.id) :
                                    s.type === 'text' ? this.renderer.state.getText(s.id) : this.renderer.state.getAssociation(s.id);
                                return n ? { id: s.id, type: s.type, node: n, original: { x: n.x, y: n.y },
                                    group: this.renderer.getShapeGroup(s.id, s.type) } : null;
                            }).filter(Boolean);
                    }
                }
            }
            return;
        }
        if (event.type === 'pointermove') {
            if (this.pointers.has(event.pointerId)) this.pointers.set(event.pointerId, point);
            const gesture = this.gesture;
            if (!gesture) {
                const hit = this.stage.getIntersection(point);
                this.updateCursor();
                if (window.app?.currentTool === 'select' && this.getGroup(hit)?.getAttr('itemType') === 'connection') this.container.style.cursor = 'pointer';
                if (window.app?.currentTool === 'select' && hit?.getAttr('resizeHandle')) this.container.style.cursor = this.resizeCursor(hit.getAttr('resizeHandle'));
                if (window.app?.tempConnection) this.startEdge();
                return;
            }
            if (gesture.kind === 'pinch') {
                if (this.pointers.size < 2) return;
                const next = this.pinchPoints();
                const canPan = window.app?.currentTool === 'pan';
                this.renderer.setZoom(this.renderer.scale * next.distance / Math.max(1, gesture.distance),
                    this.world(canPan ? gesture.center : gesture.anchor), canPan ? next.center : gesture.anchor);
                Object.assign(gesture, next);
                return;
            }
            if (Math.hypot(point.x - gesture.start.x, point.y - gesture.start.y) > 5) gesture.moved = true;
            if (!gesture.moved) return;
            if (gesture.kind === 'pan') {
                this.renderer.isPanning = true;
                this.renderer.setView(this.stage.x() + point.x - gesture.last.x, this.stage.y() + point.y - gesture.last.y, this.renderer.scale);
            } else if (gesture.kind === 'node') {
                this.moveNode(point);
                this.startEdge();
            } else if (gesture.kind === 'resize') {
                this.renderer.resizeNode(gesture, this.world(point));
            } else if (gesture.kind === 'tap' && (window.app?.currentTool || 'select') === 'select') {
                // Lasso selection
                gesture.kind = 'lasso';
                gesture.startWorld = this.world(gesture.start);
                this.renderer.updateLasso(gesture.startWorld, this.world(point));
            }
            if (gesture.kind === 'lasso') {
                this.renderer.updateLasso(gesture.startWorld, this.world(point));
            }
            gesture.last = point;
            this.updateCursor();
            return;
        }
        const gesture = this.gesture;
        this.pointers.delete(event.pointerId);
        if (this.container.hasPointerCapture(event.pointerId)) this.container.releasePointerCapture(event.pointerId);
        if (gesture?.kind === 'pinch' && this.pointers.size) return;
        this.finishNode(event.type === 'pointercancel');
        this.gesture = null;
        this.renderer.isPanning = false;
        this.stopEdge();
        if (gesture && gesture.kind !== 'resize' && gesture.kind !== 'lasso' && !gesture.moved && event.type === 'pointerup') this.renderer.handleCanvasClick(gesture.hit, event);
        this.updateCursor();
        this.schedulePersist();
    }

    pinchPoints() {
        const [a, b] = [...this.pointers.values()];
        return { center: { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }, distance: Math.max(1, Math.hypot(a.x - b.x, a.y - b.y)) };
    }
    moveNode(point) {
        const g = this.gesture;
        const world = this.world(point);
        const position = constrainPosition(this.renderer.snapPosition({ x: world.x - g.offset.x, y: world.y - g.offset.y }));
        const dx = position.x - g.node.x;
        const dy = position.y - g.node.y;
        Object.assign(g.node, position);
        g.group.position(position);
        // Move co-selected nodes
        if (g.multiDrag) {
            for (const peer of g.multiDrag) {
                const peerPos = constrainPosition({ x: peer.node.x + dx, y: peer.node.y + dy });
                Object.assign(peer.node, peerPos);
                if (peer.group) peer.group.position(peerPos);
            }
        }
        this.renderer.renderConnections();
        this.renderer.nodeLayer.batchDraw();
        this.renderer.updateResizeHandles();
    }
    finishNode(cancelled) {
        const g = this.gesture;
        if (g?.kind === 'lasso') {
            this.renderer.finishLasso(g.startWorld, this.world(this.pointer || g.last), cancelled);
            return;
        }
        if (g?.kind === 'resize') {
            if (cancelled) { applySize(g.node, g.original); this.renderer.render(); }
            else if (g.moved) this.renderer.commitNodeResize(g.node, g.type, g.original);
            return;
        }
        if (g?.kind !== 'node') return;
        if (cancelled) {
            Object.assign(g.node, g.original);
            g.group.position(g.original);
            if (g.multiDrag) {
                for (const peer of g.multiDrag) {
                    Object.assign(peer.node, peer.original);
                    if (peer.group) peer.group.position(peer.original);
                }
            }
            this.renderer.render();
        } else if (g.moved) {
            if (g.multiDrag?.length) {
                this.renderer.commitMultiNodeMove(g);
            } else {
                this.renderer.commitNodeMove(g.node, g.type, g.original);
            }
        }
    }
    cancel() {
        this.finishNode(true);
        for (const id of this.pointers.keys()) if (this.container.hasPointerCapture(id)) this.container.releasePointerCapture(id);
        this.pointers.clear();
        this.gesture = null;
        this.pointer = null;
        this.renderer.isPanning = false;
        this.stopEdge();
        this.updateCursor();
        this.renderer.updateResizeHandles();
    }
    startEdge() {
        if (!this.frame) { this.lastFrame = performance.now(); this.frame = requestAnimationFrame(time => this.edgeFrame(time)); }
    }
    stopEdge() { cancelAnimationFrame(this.frame); this.frame = 0; }
    edgeFrame(time) {
        this.frame = 0;
        if (!this.pointer || document.querySelector('.modal-overlay.active') ||
            !(this.gesture?.kind === 'node' && this.gesture.moved) && !window.app?.tempConnection) return;
        const dt = Math.min(0.04, (time - this.lastFrame) / 1000);
        this.lastFrame = time;
        const speed = (p, size) => p < 40 ? Math.min(1, (40 - p) / 40) * 600 : p > size - 40 ? -Math.min(1, (p - size + 40) / 40) * 600 : 0;
        const dx = speed(this.pointer.x, this.stage.width()) * dt;
        const dy = speed(this.pointer.y, this.stage.height()) * dt;
        if (dx || dy) {
            this.renderer.setView(this.stage.x() + dx, this.stage.y() + dy, this.renderer.scale);
            if (this.gesture?.kind === 'node') this.moveNode(this.pointer);
        }
        this.frame = requestAnimationFrame(next => this.edgeFrame(next));
    }
    initialize(forceFit = false) {
        let view;
        try { view = JSON.parse(localStorage.getItem(VIEW_STORAGE_KEY)); } catch { /* Ignore unavailable or corrupt view records. */ }
        this.ready = true;
        if (!forceFit && validView(view, diagramSignature(this.renderer.state.serialize()))) {
            this.renderer.setView(view.x, view.y, view.scale);
        } else this.renderer.fitToContent();
    }
    schedulePersist() {
        if (!this.ready) return;
        clearTimeout(this.saveTimer);
        this.saveTimer = setTimeout(() => this.persist(), 150);
    }
    persist() {
        if (!this.ready) return;
        clearTimeout(this.saveTimer);
        try {
            localStorage.setItem(VIEW_STORAGE_KEY, JSON.stringify({ x: this.stage.x(), y: this.stage.y(),
                scale: this.renderer.scale, signature: diagramSignature(this.renderer.state.serialize()) }));
        } catch { /* View persistence must never prevent diagram editing. */ }
    }
}

// ===========================
// CANVAS RENDERER
// ===========================

import Konva from 'konva';
import { CONFIG } from './config.js';
import { formatAttribute, formatAttributeSimple, calculateAngle, getPerpendicularOffset, snapToGrid } from './utils.js';
import { MoveNodeCommand, MoveMultipleNodesCommand, ResizeNodeCommand } from './commands.js';
import { sizeSnapshot, resizedRectangle, clearLabelPosition } from './dimensions.js';
import { CanvasNavigation, MIN_ZOOM, MAX_ZOOM, visibleBounds, gridSpacing, imageDimensions, constrainPosition } from './viewport.js';

export class CanvasRenderer {
    constructor(containerId, state) {
        this.state = state;
        this.container = document.getElementById(containerId);

        if (!this.container) {
            throw new Error(`Container "${containerId}" not found!`);
        }

        // Get dimensions (fallback to viewport if container has no size yet)
        const width = this.container.offsetWidth || window.innerWidth;
        const height = this.container.offsetHeight || window.innerHeight - 60;

        // Konva stage and layers
        this.stage = new Konva.Stage({
            container: containerId,
            width: width,
            height: height,
            draggable: false
        });

        this.gridLayer = new Konva.Layer({ listening: false });
        this.connectionLayer = new Konva.Layer();
        this.nodeLayer = new Konva.Layer();
        this.controlsLayer = new Konva.Layer();

        this.stage.add(this.gridLayer);
        this.stage.add(this.connectionLayer);
        this.stage.add(this.nodeLayer);
        this.stage.add(this.controlsLayer);

        // Settings
        this.showGrid = true;
        this.snapToGrid = false;
        this.scale = 1;

        // Shape maps
        this.entityShapes = new Map();
        this.associationShapes = new Map();
        this.connectionShapes = new Map();
        this.textShapes = new Map();

        // Drag tracking
        this.isPanning = false;

        this.setupGrid();
        this.navigation = new CanvasNavigation(this);
        this.render();

        this.resizeObserver = new ResizeObserver(() => this.handleResize());
        this.resizeObserver.observe(this.container);
    }

    setupGrid() {
        this.drawGrid();
    }

    drawGrid() {
        this.gridLayer.destroyChildren();
        if (this.showGrid) this.gridLayer.add(this.makeGrid(this.getVisibleBounds(), this.scale));
        this.gridLayer.batchDraw();
    }

    makeGrid(bounds, scale) {
        const step = gridSpacing(scale, CONFIG.GRID_SIZE);
        return new Konva.Shape({ listening: false, sceneFunc(context) {
            context.beginPath();
            const left = Math.floor(bounds.x / step) * step;
            const top = Math.floor(bounds.y / step) * step;
            for (let x = left; x <= bounds.x + bounds.width + step; x += step) {
                context.moveTo(x, bounds.y); context.lineTo(x, bounds.y + bounds.height);
            }
            for (let y = top; y <= bounds.y + bounds.height + step; y += step) {
                context.moveTo(bounds.x, y); context.lineTo(bounds.x + bounds.width, y);
            }
            context.setAttr('strokeStyle', CONFIG.COLORS.grid);
            context.setAttr('lineWidth', 1 / scale);
            context.stroke();
        } });
    }

    getVisibleBounds() {
        return visibleBounds({ ...this.stage.position(), scale: this.scale, width: this.stage.width(), height: this.stage.height() });
    }

    setView(x, y, scale) {
        scale = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, scale));
        const center = constrainPosition({ x: (this.stage.width() / 2 - x) / scale, y: (this.stage.height() / 2 - y) / scale });
        this.scale = scale;
        this.stage.scale({ x: scale, y: scale });
        this.stage.position({ x: this.stage.width() / 2 - center.x * scale, y: this.stage.height() / 2 - center.y * scale });
        this.drawGrid();
        this.connectionShapes.forEach(({ group }) => group.find('Line').forEach(line => line.hitStrokeWidth(Math.max(16, 20 / scale))));
        this.updateResizeHandles();
        const label = document.getElementById('zoom-level');
        if (label) label.textContent = `${new Intl.NumberFormat('fr-FR', { maximumSignificantDigits: 3 }).format(scale * 100)} %`;
        this.stage.batchDraw();
        this.navigation?.schedulePersist();
    }

    toggleGrid() {
        this.showGrid = !this.showGrid;
        this.drawGrid();
    }

    toggleSnap() {
        this.snapToGrid = !this.snapToGrid;
    }

    snapPosition(pos) {
        return snapToGrid(pos, CONFIG.GRID_SIZE, this.snapToGrid);
    }

    setZoom(scale, center, pointer) {
        scale = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, scale));
        this.setView(pointer.x - center.x * scale, pointer.y - center.y * scale, scale);
    }

    zoomIn() {
        const newScale = Math.min(MAX_ZOOM, this.scale * 1.2);
        const center = {
            x: this.stage.width() / 2,
            y: this.stage.height() / 2
        };
        this.setZoom(newScale,
            {
                x: (center.x - this.stage.x()) / this.scale,
                y: (center.y - this.stage.y()) / this.scale
            },
            center
        );
    }

    zoomOut() {
        const newScale = Math.max(MIN_ZOOM, this.scale / 1.2);
        const center = {
            x: this.stage.width() / 2,
            y: this.stage.height() / 2
        };
        this.setZoom(newScale,
            {
                x: (center.x - this.stage.x()) / this.scale,
                y: (center.y - this.stage.y()) / this.scale
            },
            center
        );
    }

    resetZoom() {
        const center = { x: this.stage.width() / 2, y: this.stage.height() / 2 };
        this.setZoom(1, {
            x: (center.x - this.stage.x()) / this.scale,
            y: (center.y - this.stage.y()) / this.scale
        }, center);
    }

    contentBounds(padding = 35) {
        const rects = [...this.nodeLayer.getChildren(), ...this.connectionLayer.getChildren()]
            .map(shape => shape.getClientRect({ relativeTo: this.stage, skipShadow: true }));
        if (!rects.length) return null;
        const x = Math.min(...rects.map(r => r.x)) - padding;
        const y = Math.min(...rects.map(r => r.y)) - padding;
        return { x, y, width: Math.max(...rects.map(r => r.x + r.width)) + padding - x,
            height: Math.max(...rects.map(r => r.y + r.height)) + padding - y };
    }

    fitToContent() {
        const bounds = this.contentBounds(55);
        if (!bounds) { this.setView(this.stage.width() / 2, this.stage.height() / 2, 1); return; }
        const scale = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, this.stage.width() / bounds.width, this.stage.height() / bounds.height));
        this.setView(this.stage.width() / 2 - (bounds.x + bounds.width / 2) * scale,
            this.stage.height() / 2 - (bounds.y + bounds.height / 2) * scale, scale);
    }

    imageOptions({ scope = 'all', pixelRatio = 2, grid = this.showGrid } = {}) {
        const bounds = scope === 'view' ? this.getVisibleBounds() : this.contentBounds() || this.getVisibleBounds();
        const dimensions = imageDimensions(bounds, scope === 'view' ? pixelRatio * this.scale : pixelRatio);
        return { bounds, ...dimensions, grid, scope };
    }

    exportPNG(options = {}) {
        if (typeof options === 'number') options = { pixelRatio: options };
        const { bounds, ratio, width, height, grid } = this.imageOptions(options);
        const stage = new Konva.Stage({ container: document.createElement('div'), width, height });
        try {
            stage.scale({ x: ratio, y: ratio });
            stage.position({ x: -bounds.x * ratio, y: -bounds.y * ratio });
            const background = new Konva.Layer();
            background.add(new Konva.Rect({ ...bounds, fill: '#ffffff' }));
            if (grid) background.add(this.makeGrid(bounds, ratio));
            stage.add(background);
            for (const source of [this.connectionLayer, this.nodeLayer]) {
                const layer = source.clone({ listening: false });
                layer.find('Group').forEach(group => {
                    const type = group.getAttr('itemType');
                    if (type === 'connection') group.find('Line').forEach(line => line.stroke(CONFIG.COLORS.connection).strokeWidth(2));
                    if (type === 'entity') group.findOne('Rect')?.stroke(CONFIG.COLORS.entityStroke).strokeWidth(2);
                    if (type === 'association') group.findOne('Ellipse')?.stroke(CONFIG.COLORS.associationStroke).strokeWidth(2);
                    group.find('.text-selection').forEach(rect => rect.destroy());
                });
                stage.add(layer);
            }
            stage.draw();
            return stage.toDataURL({ pixelRatio: 1, mimeType: 'image/png' });
        } finally { stage.destroy(); }
    }

    handleResize() {
        const width = this.container.offsetWidth, height = this.container.offsetHeight;
        if (!width || !height || width === this.stage.width() && height === this.stage.height()) return;
        const dx = (width - this.stage.width()) / 2, dy = (height - this.stage.height()) / 2;
        this.stage.size({ width, height });
        this.setView(this.stage.x() + dx, this.stage.y() + dy, this.scale);
    }

    handleCanvasClick(hit, event) {
        const app = window.app;
        if (!app || app.currentTool === 'pan' || document.querySelector('.modal-overlay.active')) return;
        if (app.currentTool === 'connection') { app.handleConnectionTool({ target: hit || this.stage, evt: event }); return; }
        const group = this.navigation.getGroup(hit);
        const type = group?.getAttr('itemType');
        const id = group?.getAttr('itemId');
        if (!type) { app.handleStageClick({ target: this.stage, evt: event }); return; }
        if (app.currentTool !== 'select') return;
        this.state.select({ type, id }, event.shiftKey);
        this.updateSelection();
        if (event.shiftKey) return;
        if (type === 'connection') {
            app.modalManager.openConnectionModal(id, hit?.getAttr('editField') || 'minimum');
            this.lastTap = null;
        } else {
            const now = performance.now();
            if (this.lastTap?.id === id && now - this.lastTap.time < 350) {
                app.editSelected(); this.lastTap = null;
            } else this.lastTap = { id, time: now };
        }
    }

    commitNodeMove(node, type, original) {
        if (node.x !== original.x || node.y !== original.y) {
            this.state.executeCommand(new MoveNodeCommand(this.state, node.id, type, original, { x: node.x, y: node.y }));
        }
    }

    commitMultiNodeMove(gesture) {
        const moves = [
            { id: gesture.node.id, type: gesture.type, oldPos: gesture.original, newPos: { x: gesture.node.x, y: gesture.node.y } },
            ...gesture.multiDrag.map(peer => ({
                id: peer.id, type: peer.type, oldPos: peer.original, newPos: { x: peer.node.x, y: peer.node.y }
            }))
        ].filter(m => m.oldPos.x !== m.newPos.x || m.oldPos.y !== m.newPos.y);
        if (moves.length) this.state.executeCommand(new MoveMultipleNodesCommand(this.state, moves));
    }

    getShapeGroup(id, type) {
        if (type === 'entity') return this.entityShapes.get(id)?.group;
        if (type === 'association') return this.associationShapes.get(id)?.group;
        if (type === 'text') return this.textShapes.get(id)?.group;
        return null;
    }

    updateLasso(startWorld, endWorld) {
        this.lassoRect?.destroy();
        const x = Math.min(startWorld.x, endWorld.x);
        const y = Math.min(startWorld.y, endWorld.y);
        const width = Math.abs(endWorld.x - startWorld.x);
        const height = Math.abs(endWorld.y - startWorld.y);
        this.lassoRect = new Konva.Rect({
            x, y, width, height,
            stroke: '#2563eb', strokeWidth: 1 / this.scale,
            dash: [6 / this.scale, 4 / this.scale],
            fill: 'rgba(37, 99, 235, 0.08)', listening: false
        });
        this.controlsLayer.add(this.lassoRect);
        this.controlsLayer.batchDraw();
    }

    finishLasso(startWorld, endWorld, cancelled) {
        this.lassoRect?.destroy();
        this.lassoRect = null;
        this.controlsLayer.batchDraw();
        if (cancelled) return;
        const x1 = Math.min(startWorld.x, endWorld.x);
        const y1 = Math.min(startWorld.y, endWorld.y);
        const x2 = Math.max(startWorld.x, endWorld.x);
        const y2 = Math.max(startWorld.y, endWorld.y);
        if (x2 - x1 < 5 && y2 - y1 < 5) return; // too small, treat as click
        const items = [];
        for (const entity of this.state.entities) {
            const rect = this.nodeRectangle(entity, 'entity');
            if (this.rectsOverlap(x1, y1, x2, y2, rect)) items.push({ type: 'entity', id: entity.id });
        }
        for (const assoc of this.state.associations) {
            const rect = this.nodeRectangle(assoc, 'association');
            if (this.rectsOverlap(x1, y1, x2, y2, rect)) items.push({ type: 'association', id: assoc.id });
        }
        for (const text of this.state.texts) {
            const rect = this.nodeRectangle(text, 'text');
            if (this.rectsOverlap(x1, y1, x2, y2, rect)) items.push({ type: 'text', id: text.id });
        }
        if (items.length) {
            this.state.selectedItems = items;
            this.state.notify('selection');
            this.updateSelection();
        }
    }

    rectsOverlap(x1, y1, x2, y2, rect) {
        return rect.x < x2 && rect.x + rect.width > x1 && rect.y < y2 && rect.y + rect.height > y1;
    }

    commitNodeResize(node, type, original) {
        const next = sizeSnapshot(node);
        if (Object.keys(next).some(key => next[key] !== original[key])) {
            this.state.executeCommand(new ResizeNodeCommand(this.state, node.id, type, original, next));
        }
    }

    measureText(config) {
        const text = new Konva.Text({ fontFamily: 'Arial', ...config });
        const size = { width: text.width(), height: text.height() };
        text.destroy();
        return size;
    }

    entityMetrics(entity, requestedWidth = entity.width ?? CONFIG.ENTITY_WIDTH) {
        const minWidth = Math.max(160, ...entity.attributes.map(attr =>
            formatAttribute(attr).reduce((sum, part) => sum + this.measureText({ text: part.text,
                fontSize: part.style === 'constraint' ? 10 : 12,
                fontStyle: part.style === 'pk' ? 'bold' : 'normal' }).width + 1, 2 * CONFIG.ENTITY_PADDING)));
        const width = Math.max(minWidth, requestedWidth);
        const headerHeight = Math.max(40, 24 + this.measureText({ text: entity.name, fontSize: 16,
            fontStyle: 'bold', width: width - 2 * CONFIG.ENTITY_PADDING }).height);
        const minHeight = Math.max(CONFIG.ENTITY_MIN_HEIGHT, headerHeight + 24 + entity.attributes.length * CONFIG.ATTRIBUTE_HEIGHT);
        return { width, height: Math.max(entity.height ?? CONFIG.ENTITY_MIN_HEIGHT + entity.attributes.length * CONFIG.ATTRIBUTE_HEIGHT, minHeight),
            minWidth, minHeight, headerHeight };
    }

    associationMetrics(assoc, requestedWidth = assoc.width ?? CONFIG.ASSOCIATION_MIN_WIDTH) {
        const minWidth = Math.max(120, ...assoc.attributes.map(attr =>
            this.measureText({ text: formatAttributeSimple(attr), fontSize: 11 }).width / 0.7 + 24));
        const width = Math.max(minWidth, requestedWidth);
        const titleHeight = this.measureText({ text: assoc.name, fontSize: 14, fontStyle: 'bold', width: width * 0.7 }).height;
        const contentHeight = titleHeight + (assoc.attributes.length ? 12 + assoc.attributes.length * CONFIG.ASSOCIATION_ATTRIBUTE_HEIGHT : 0);
        const minHeight = Math.max(60, contentHeight / 0.7 + 16);
        return { width, height: Math.max(assoc.height ?? CONFIG.ASSOCIATION_MIN_HEIGHT, minHeight),
            minWidth, minHeight, titleHeight, contentHeight };
    }

    textConfig(annotation) {
        return { text: annotation.text, fontFamily: 'Arial', fontSize: annotation.fontSize,
            fontStyle: [annotation.bold && 'bold', annotation.italic && 'italic'].filter(Boolean).join(' ') || 'normal',
            textDecoration: annotation.underline ? 'underline' : '', fill: '#1e293b', lineHeight: 1.35,
            padding: 6, name: 'annotation-text' };
    }

    textMetrics(annotation, requestedWidth = annotation.width) {
        const config = this.textConfig(annotation);
        const minWidth = Math.max(60, annotation.fontSize * 1.5 + 12);
        const width = Math.max(minWidth, requestedWidth ?? Math.min(480, this.measureText(config).width));
        const minHeight = this.measureText({ ...config, width }).height;
        return { width, height: Math.max(annotation.height ?? 0, minHeight), minWidth, minHeight };
    }

    nodeMetrics(node, type, width) {
        return type === 'entity' ? this.entityMetrics(node, width) : type === 'association' ?
            this.associationMetrics(node, width) : this.textMetrics(node, width);
    }

    nodeRectangle(node, type) {
        const { width, height } = this.nodeMetrics(node, type);
        return { x: node.x - (type === 'association' ? width / 2 : 0),
            y: node.y - (type === 'association' ? height / 2 : 0), width, height };
    }

    resizeNode(gesture, point) {
        const delta = { x: point.x - gesture.startWorld.x, y: point.y - gesture.startWorld.y };
        const tentative = resizedRectangle(gesture.originalRect, gesture.handle, delta, { width: 1, height: 1 });
        const metrics = this.nodeMetrics(gesture.node, gesture.type, tentative.width);
        const rect = resizedRectangle(gesture.originalRect, gesture.handle, delta, { width: metrics.minWidth, height: metrics.minHeight });
        const position = constrainPosition({ x: rect.x + (gesture.type === 'association' ? rect.width / 2 : 0),
            y: rect.y + (gesture.type === 'association' ? rect.height / 2 : 0) });
        Object.assign(gesture.node, position, { width: rect.width, height: rect.height });
        this.refreshNode(gesture.node, gesture.type);
    }

    refreshNode(node, type) {
        if (type === 'entity') this.updateEntityShape(node);
        else if (type === 'association') this.updateAssociationShape(node);
        else { this.textShapes.get(node.id)?.group.destroy(); this.createTextShape(node); }
        if (type !== 'text') this.renderConnections();
        this.updateSelection();
    }

    updateResizeHandles() {
        this.controlsLayer.destroyChildren();
        const item = this.state.selectedItems.length === 1 ? this.state.selectedItems[0] : null;
        if (!item || !['entity', 'association', 'text'].includes(item.type) ||
            (window.app?.currentTool || 'select') !== 'select') {
            this.controlsLayer.batchDraw(); return;
        }
        const node = item.type === 'entity' ? this.state.getEntity(item.id) : item.type === 'association' ?
            this.state.getAssociation(item.id) : this.state.getText(item.id);
        if (!node) return;
        const rect = this.nodeRectangle(node, item.type);
        const group = new Konva.Group({ itemId: item.id, itemType: item.type, x: rect.x, y: rect.y });
        group.add(new Konva.Rect({ width: rect.width, height: rect.height, stroke: '#2563eb',
            strokeWidth: 1 / this.scale, dash: [4 / this.scale, 3 / this.scale], listening: false }));
        for (const [name, x, y] of [['nw', 0, 0], ['n', 0.5, 0], ['ne', 1, 0], ['e', 1, 0.5],
            ['se', 1, 1], ['s', 0.5, 1], ['sw', 0, 1], ['w', 0, 0.5]]) {
            group.add(new Konva.Rect({ x: x * rect.width - 5 / this.scale, y: y * rect.height - 5 / this.scale,
                width: 10 / this.scale, height: 10 / this.scale, cornerRadius: 2 / this.scale,
                fill: '#ffffff', stroke: '#2563eb', strokeWidth: 1.5 / this.scale, hitStrokeWidth: 14 / this.scale,
                resizeHandle: name, name: 'resize-handle' }));
        }
        this.controlsLayer.add(group);
        this.controlsLayer.batchDraw();
    }

    render() {
        this.renderNodes();
        this.renderTexts();
        this.renderConnections();
        this.updateSelection();
    }

    renderTexts() {
        this.textShapes.forEach(({ group }) => group.destroy());
        this.textShapes.clear();
        for (const annotation of this.state.texts) {
            this.createTextShape(annotation);
        }
    }

    createTextShape(annotation) {
        const { width, height } = this.textMetrics(annotation);
        const group = new Konva.Group({ id: annotation.id, itemId: annotation.id, itemType: 'text', x: annotation.x, y: annotation.y });
        const text = new Konva.Text({ ...this.textConfig(annotation), width });
        const hitArea = new Konva.Rect({ width, height, fill: 'rgba(0,0,0,0)' });
        const border = new Konva.Rect({ width, height, stroke: CONFIG.COLORS.connectionSelected,
            strokeWidth: 1, dash: [4, 3], visible: false, listening: false, name: 'text-selection' });
        group.add(hitArea, text, border);
        this.nodeLayer.add(group);
        this.textShapes.set(annotation.id, { group, text, annotation, width, height });
    }

    renderNodes() {
        // Remove deleted nodes
        this.entityShapes.forEach((shape, id) => {
            if (!this.state.getEntity(id)) {
                shape.group.destroy();
                this.entityShapes.delete(id);
            }
        });

        this.associationShapes.forEach((shape, id) => {
            if (!this.state.getAssociation(id)) {
                shape.group.destroy();
                this.associationShapes.delete(id);
            }
        });

        // Render all nodes
        this.state.entities.forEach(entity => {
            if (this.entityShapes.has(entity.id)) {
                this.updateEntityShape(entity);
            } else {
                this.createEntityShape(entity);
            }
        });

        this.state.associations.forEach(assoc => {
            if (this.associationShapes.has(assoc.id)) {
                this.updateAssociationShape(assoc);
            } else {
                this.createAssociationShape(assoc);
            }
        });

        this.nodeLayer.batchDraw();
    }

    createEntityShape(entity) {
        const group = new Konva.Group({
            x: entity.x,
            y: entity.y,
            draggable: true,
            dragDistance: 10, // Empêche le drag d'interférer avec les clics
            id: entity.id,
            name: 'entity',
            itemType: 'entity',
            itemId: entity.id
        });

        const { width, height, headerHeight } = this.entityMetrics(entity);

        const rect = new Konva.Rect({
            width,
            height: height,
            fill: CONFIG.COLORS.entity,
            stroke: CONFIG.COLORS.entityStroke,
            strokeWidth: 2,
            cornerRadius: 8,
            shadowColor: 'black',
            shadowBlur: 10,
            shadowOpacity: 0.1,
            shadowOffset: { x: 0, y: 2 }
        });

        const headerRect = new Konva.Rect({
            width,
            height: headerHeight,
            fill: CONFIG.COLORS.entityHeader,
            cornerRadius: [8, 8, 0, 0]
        });

        const nameText = new Konva.Text({
            text: entity.name,
            x: CONFIG.ENTITY_PADDING,
            y: 12,
            width: width - 2 * CONFIG.ENTITY_PADDING,
            fontSize: 16,
            fontStyle: 'bold',
            fill: CONFIG.COLORS.entityHeaderText,
            align: 'center'
        });

        group.add(rect, headerRect, nameText);

        let yOffset = headerHeight + 10;
        entity.attributes.forEach((attr) => {
            const parts = formatAttribute(attr);
            let xOffset = CONFIG.ENTITY_PADDING;

            parts.forEach((part) => {
                let textConfig = {
                    text: part.text,
                    x: xOffset,
                    y: yOffset,
                    fontSize: 12,
                    fill: '#1e293b'
                };

                // Style pour clé primaire : gras et souligné
                if (part.style === 'pk') {
                    textConfig.fontStyle = 'bold';
                    textConfig.textDecoration = 'underline';
                }
                // Style pour le type : couleur plus claire
                else if (part.style === 'type') {
                    textConfig.fill = '#64748b';
                }
                // Style pour les contraintes (NOT NULL)
                else if (part.style === 'constraint') {
                    textConfig.fill = '#64748b';
                    textConfig.fontSize = 10;
                }

                const textNode = new Konva.Text(textConfig);
                group.add(textNode);
                xOffset += textNode.width() + 1;
            });

            yOffset += CONFIG.ATTRIBUTE_HEIGHT;
        });

        this.attachEntityEvents(group, entity);

        this.nodeLayer.add(group);
        this.entityShapes.set(entity.id, { group, rect, nameText, entity, width, height });
    }

    attachEntityEvents(group) { group.draggable(false); }

    updateEntityShape(entity) {
        const shape = this.entityShapes.get(entity.id);
        if (!shape) return;

        shape.group.position({ x: entity.x, y: entity.y });
        shape.nameText.text(entity.name);

        shape.group.destroy();
        this.entityShapes.delete(entity.id);
        this.createEntityShape(entity);
    }

    createAssociationShape(assoc) {
        const group = new Konva.Group({
            x: assoc.x,
            y: assoc.y,
            draggable: true,
            dragDistance: 10, // Empêche le drag d'interférer avec les clics
            id: assoc.id,
            name: 'association',
            itemType: 'association',
            itemId: assoc.id
        });

        const { width, height: totalHeight, titleHeight, contentHeight } = this.associationMetrics(assoc);

        const rect = new Konva.Ellipse({
            radiusX: width / 2,
            radiusY: totalHeight / 2,
            fill: CONFIG.COLORS.association,
            stroke: CONFIG.COLORS.associationStroke,
            strokeWidth: 2,
            shadowColor: 'black',
            shadowBlur: 10,
            shadowOpacity: 0.1,
            shadowOffset: { x: 0, y: 2 }
        });

        // Association name
        const nameText = new Konva.Text({
            text: assoc.name,
            x: -width * 0.35,
            y: -contentHeight / 2,
            width: width * 0.7,
            fontSize: 14,
            fontStyle: 'bold',
            fill: CONFIG.COLORS.associationText,
            align: 'center'
        });

        group.add(rect, nameText);

        // Attributes
        if (assoc.attributes.length > 0) {
            let yOffset = -contentHeight / 2 + titleHeight + 12;

            assoc.attributes.forEach((attr) => {
                const attrText = new Konva.Text({
                    text: formatAttributeSimple(attr),
                    x: -width * 0.35,
                    y: yOffset,
                    width: width * 0.7,
                    fontSize: 11,
                    fill: CONFIG.COLORS.associationText
                });
                group.add(attrText);
                yOffset += CONFIG.ASSOCIATION_ATTRIBUTE_HEIGHT;
            });
        }

        this.attachAssociationEvents(group, assoc, width, totalHeight);

        this.nodeLayer.add(group);
        this.associationShapes.set(assoc.id, { group, rect, nameText, assoc, width, height: totalHeight });
    }

    attachAssociationEvents(group) { group.draggable(false); }

    updateAssociationShape(assoc) {
        const shape = this.associationShapes.get(assoc.id);
        if (!shape) return;

        shape.group.position({ x: assoc.x, y: assoc.y });
        shape.nameText.text(assoc.name);

        shape.group.destroy();
        this.associationShapes.delete(assoc.id);
        this.createAssociationShape(assoc);
    }

    renderConnections() {
        this.connectionLayer.destroyChildren();
        this.connectionShapes.clear();

        this.state.connections.forEach(conn => {
            this.createConnectionShape(conn);
        });

        this.connectionLayer.batchDraw();
    }

    createConnectionShape(conn) {
        const assoc = this.state.getAssociation(conn.associationId);
        const entity = this.state.getEntity(conn.entityId);

        if (!assoc || !entity) return;

        // Check if this is a self-association (auto-association)
        const connections = this.state.getConnectionsForAssociation(conn.associationId);
        const entityConnections = connections.filter(c => c.entityId === entity.id);
        const isSelfAssociation = entityConnections.length > 1;
        const connectionIndex = entityConnections.findIndex(c => c.id === conn.id);

        // Get association shape info
        const assocShape = this.associationShapes.get(assoc.id);
        const assocWidth = assocShape ? assocShape.width : CONFIG.ASSOCIATION_MIN_WIDTH;
        const assocHeight = assocShape ? assocShape.height : CONFIG.ASSOCIATION_MIN_HEIGHT;

        const group = new Konva.Group({ id: conn.id, itemId: conn.id, itemType: 'connection' });

        if (isSelfAssociation) {
            // Draw curved lines for self-associations
            this.drawSelfAssociationConnection(group, assoc, entity, conn, connectionIndex, assocWidth, assocHeight);
        } else {
            // Normal straight line connection
            this.drawNormalConnection(group, assoc, entity, conn, assocWidth, assocHeight);
        }

        this.connectionLayer.add(group);
        this.connectionShapes.set(conn.id, { group, conn });
    }

    drawNormalConnection(group, assoc, entity, conn, assocWidth, assocHeight) {
        // Calculate connection points
        const assocPoint = this.getAssociationEdgePoint(assoc, entity, assocWidth, assocHeight);
        const entityPoint = this.getEntityEdgePoint(entity, assoc);

        // Calculate angle and perpendicular offset for labels
        const angle = calculateAngle(assocPoint, entityPoint);
        // Create line
        const line = new Konva.Line({
            points: [assocPoint.x, assocPoint.y, entityPoint.x, entityPoint.y],
            stroke: CONFIG.COLORS.connection,
            strokeWidth: 2,
            lineCap: 'round',
            hitStrokeWidth: Math.max(16, 20 / this.scale)
        });

        // Measure the complete label instead of clipping custom bounds to 40px.
        const cardText = this.createCardinalityText(conn.cardinality);
        const cardOffset = CONFIG.CARDINALITY_OFFSET;
        const clearance = Math.max(CONFIG.LABEL_OFFSET,
            Math.abs(Math.sin(angle)) * cardText.width() / 2 + Math.abs(Math.cos(angle)) * cardText.height() / 2 + 6);
        const cardPerpendicular = getPerpendicularOffset(angle, clearance);
        const cardPos = {
            x: entityPoint.x - Math.cos(angle) * cardOffset + cardPerpendicular.x,
            y: entityPoint.y - Math.sin(angle) * cardOffset + cardPerpendicular.y
        };
        const { width: entityWidth, height: entityHeight } = this.entityMetrics(entity);
        if (Math.abs(entityPoint.x - entity.x) < 0.01) {
            cardPos.x = Math.min(cardPos.x, entity.x - cardText.width() / 2 - 8);
        } else if (Math.abs(entityPoint.x - entity.x - entityWidth) < 0.01) {
            cardPos.x = Math.max(cardPos.x, entity.x + entityWidth + cardText.width() / 2 + 8);
        } else if (Math.abs(entityPoint.y - entity.y) < 0.01) {
            cardPos.y = Math.min(cardPos.y, entity.y - cardText.height() / 2 - 8);
        } else {
            cardPos.y = Math.max(cardPos.y, entity.y + entityHeight + cardText.height() / 2 + 8);
        }
        cardText.position(cardPos);

        group.add(line, cardText);

        // Connection label at midpoint (without border)
        if (conn.label && conn.label.trim()) {
            const midX = (assocPoint.x + entityPoint.x) / 2;
            const midY = (assocPoint.y + entityPoint.y) / 2;

            const labelText = new Konva.Text({
                text: conn.label,
                name: 'role-label',
                editField: 'role',
                width: 80,
                fontSize: 14,
                fill: '#2563eb',
                fontStyle: 'italic',
                align: 'center'
            });

            labelText.position(clearLabelPosition({ x: midX, y: midY },
                getPerpendicularOffset(angle, -1), { width: labelText.width(), height: labelText.height() }, [
                    { x: entity.x, y: entity.y, width: entityWidth, height: entityHeight },
                    { x: assoc.x - assocWidth / 2, y: assoc.y - assocHeight / 2, width: assocWidth, height: assocHeight },
                    { x: cardPos.x - cardText.width() / 2, y: cardPos.y - cardText.height() / 2, width: cardText.width(), height: cardText.height() }
                ]));

            group.add(labelText);
        }

    }

    drawSelfAssociationConnection(group, assoc, entity, conn, connectionIndex, assocWidth, assocHeight) {
        // For self-associations, draw curved lines offset from each other
        const entityCenter = this.getEntityCenter(entity);
        const assocCenter = { x: assoc.x, y: assoc.y };

        // Calculate angle from entity to association
        const baseAngle = calculateAngle(entityCenter, assocCenter);

        // Offset each connection curve differently
        const curveOffset = connectionIndex === 0 ? -60 : 60;
        const curveAngle = baseAngle + (curveOffset * Math.PI / 180);

        // Control points for bezier curve
        const distance = 80;
        const controlPoint1 = {
            x: assocCenter.x + Math.cos(curveAngle) * distance,
            y: assocCenter.y + Math.sin(curveAngle) * distance
        };

        const controlPoint2 = {
            x: entityCenter.x + Math.cos(curveAngle + Math.PI / 4) * distance,
            y: entityCenter.y + Math.sin(curveAngle + Math.PI / 4) * distance
        };

        // Adjust start and end points to be on edges
        const assocPoint = this.getAssociationEdgePoint(assoc, controlPoint1, assocWidth, assocHeight);
        const entityPoint = this.getEntityEdgePoint(entity, controlPoint2);

        // Create bezier curve
        const curve = new Konva.Line({
            points: [
                assocPoint.x, assocPoint.y,
                controlPoint1.x, controlPoint1.y,
                controlPoint2.x, controlPoint2.y,
                entityPoint.x, entityPoint.y
            ],
            stroke: CONFIG.COLORS.connection,
            strokeWidth: 2,
            lineCap: 'round',
            tension: 0.3,
            bezier: true,
            hitStrokeWidth: Math.max(16, 20 / this.scale)
        });

        // Calculate midpoint of bezier curve (t=0.5)
        const t = 0.5;
        const midX = Math.pow(1-t, 3) * assocPoint.x +
                     3 * Math.pow(1-t, 2) * t * controlPoint1.x +
                     3 * (1-t) * Math.pow(t, 2) * controlPoint2.x +
                     Math.pow(t, 3) * entityPoint.x;
        const midY = Math.pow(1-t, 3) * assocPoint.y +
                     3 * Math.pow(1-t, 2) * t * controlPoint1.y +
                     3 * (1-t) * Math.pow(t, 2) * controlPoint2.y +
                     Math.pow(t, 3) * entityPoint.y;

        // Calculate perpendicular offset at midpoint
        // Approximate tangent at midpoint
        const t1 = 0.48, t2 = 0.52;
        const x1 = Math.pow(1-t1, 3) * assocPoint.x + 3 * Math.pow(1-t1, 2) * t1 * controlPoint1.x +
                   3 * (1-t1) * Math.pow(t1, 2) * controlPoint2.x + Math.pow(t1, 3) * entityPoint.x;
        const y1 = Math.pow(1-t1, 3) * assocPoint.y + 3 * Math.pow(1-t1, 2) * t1 * controlPoint1.y +
                   3 * (1-t1) * Math.pow(t1, 2) * controlPoint2.y + Math.pow(t1, 3) * entityPoint.y;
        const x2 = Math.pow(1-t2, 3) * assocPoint.x + 3 * Math.pow(1-t2, 2) * t2 * controlPoint1.x +
                   3 * (1-t2) * Math.pow(t2, 2) * controlPoint2.x + Math.pow(t2, 3) * entityPoint.x;
        const y2 = Math.pow(1-t2, 3) * assocPoint.y + 3 * Math.pow(1-t2, 2) * t2 * controlPoint1.y +
                   3 * (1-t2) * Math.pow(t2, 2) * controlPoint2.y + Math.pow(t2, 3) * entityPoint.y;

        const tangentAngle = Math.atan2(y2 - y1, x2 - x1);

        // Use same distances as normal connections for consistency
        const cardText = this.createCardinalityText(conn.cardinality);
        const cardinalityDistance = CONFIG.LABEL_OFFSET + Math.abs(Math.sin(tangentAngle)) * cardText.width() / 2 +
            Math.abs(Math.cos(tangentAngle)) * cardText.height() / 2;
        const sideMultiplier = connectionIndex === 0 ? 1 : -1;

        // Cardinality on one side
        const cardPerpX = -Math.sin(tangentAngle) * cardinalityDistance * sideMultiplier;
        const cardPerpY = Math.cos(tangentAngle) * cardinalityDistance * sideMultiplier;

        // Cardinality at midpoint, offset to one side
        cardText.position({ x: midX + cardPerpX, y: midY + cardPerpY });

        group.add(curve, cardText);

        // Label at midpoint, on the OPPOSITE side from cardinality
        if (conn.label && conn.label.trim()) {
            const labelText = new Konva.Text({
                text: conn.label,
                name: 'role-label',
                editField: 'role',
                width: 80,
                fontSize: 14,
                fill: '#2563eb',
                fontStyle: 'italic',
                align: 'center'
            });

            labelText.position(clearLabelPosition({ x: midX, y: midY },
                getPerpendicularOffset(tangentAngle, -sideMultiplier), { width: labelText.width(), height: labelText.height() }, [
                    this.nodeRectangle(entity, 'entity'),
                    { x: assoc.x - assocWidth / 2, y: assoc.y - assocHeight / 2, width: assocWidth, height: assocHeight },
                    { x: cardText.x() - cardText.width() / 2, y: cardText.y() - cardText.height() / 2, width: cardText.width(), height: cardText.height() }
                ]));

            group.add(labelText);
        }

    }

    createCardinalityText(value) {
        const text = new Konva.Text({
            name: 'cardinality-label',
            text: value,
            fontSize: 15,
            fontStyle: 'bold',
            fill: '#1e293b',
            wrap: 'none',
            padding: 2,
            editField: 'minimum'
        });
        text.offset({ x: text.width() / 2, y: text.height() / 2 });
        return text;
    }

    getAssociationEdgePoint(assoc, targetEntityOrPoint, width, height) {
        // Handle both entity objects and simple {x, y} points
        let targetX, targetY;

        if (targetEntityOrPoint.attributes !== undefined) {
            // It's an entity
            const entityCenter = this.getEntityCenter(targetEntityOrPoint);
            targetX = entityCenter.x;
            targetY = entityCenter.y;
        } else {
            // It's a simple point {x, y}
            targetX = targetEntityOrPoint.x;
            targetY = targetEntityOrPoint.y;
        }

        const dx = targetX - assoc.x;
        const dy = targetY - assoc.y;
        const a = width / 2;
        const b = height / 2;
        const divisor = Math.sqrt((dx * dx) / (a * a) + (dy * dy) / (b * b)) || 1;
        const x = assoc.x + dx / divisor;
        const y = assoc.y + dy / divisor;

        return { x, y };
    }

    getEntityEdgePoint(entity, targetAssoc) {
        const { width, height } = this.entityMetrics(entity);
        const centerX = entity.x + width / 2;
        const centerY = entity.y + height / 2;

        const dx = targetAssoc.x - centerX;
        const dy = targetAssoc.y - centerY;

        if (dx === 0 && dy === 0) return { x: entity.x + width, y: centerY };

        let x, y;

        if (Math.abs(dx / width) > Math.abs(dy / height)) {
            x = dx > 0 ? entity.x + width : entity.x;
            y = centerY + (dy / dx) * (x - centerX);
        } else {
            y = dy > 0 ? entity.y + height : entity.y;
            x = centerX + (dx / dy) * (y - centerY);
        }

        return { x, y };
    }

    getEntityCenter(entity) {
        const { width, height } = this.entityMetrics(entity);
        return {
            x: entity.x + width / 2,
            y: entity.y + height / 2
        };
    }

    updateSelection() {
        this.textShapes.forEach(({ group }) => group.findOne('.text-selection').visible(false));
        // Reset all strokes
        this.entityShapes.forEach(shape => {
            const rect = shape.group.findOne('Rect');
            if (rect) {
                rect.stroke(CONFIG.COLORS.entityStroke);
                rect.strokeWidth(2);
            }
        });

        this.associationShapes.forEach(shape => {
            const rect = shape.group.findOne('Ellipse');
            if (rect) {
                rect.stroke(CONFIG.COLORS.associationStroke);
                rect.strokeWidth(2);
            }
        });

        // Highlight selected
        this.state.selectedItems.forEach(item => {
            if (item.type === 'entity') {
                const shape = this.entityShapes.get(item.id);
                if (shape) {
                    const rect = shape.group.findOne('Rect');
                    if (rect) {
                        rect.stroke(CONFIG.COLORS.entityStrokeSelected);
                        rect.strokeWidth(3);
                    }
                }
            } else if (item.type === 'association') {
                const shape = this.associationShapes.get(item.id);
                if (shape) {
                    const rect = shape.group.findOne('Ellipse');
                    if (rect) {
                        rect.stroke(CONFIG.COLORS.associationStrokeSelected);
                        rect.strokeWidth(3);
                    }
                }
            } else if (item.type === 'text') {
                this.textShapes.get(item.id)?.group.findOne('.text-selection').visible(true);
            } else if (item.type === 'connection') {
                const shape = this.connectionShapes.get(item.id);
                if (shape && shape.group) {
                    // Find the line or curve in the group
                    const line = shape.group.findOne('Line');
                    if (line) {
                        line.stroke(CONFIG.COLORS.connectionSelected);
                        line.strokeWidth(3);
                    }
                }
            }
        });

        this.nodeLayer.batchDraw();
        this.connectionLayer.batchDraw();
        this.updateResizeHandles();
    }

    getStagePointerPosition() {
        const pos = this.stage.getPointerPosition();
        const transform = this.stage.getAbsoluteTransform().copy().invert();
        return transform.point(pos);
    }
}

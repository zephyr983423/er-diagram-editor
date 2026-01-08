// ===========================
// CANVAS RENDERER
// ===========================

import { CONFIG } from './config.js';
import { formatAttribute, calculateAngle, getPerpendicularOffset, snapToGrid } from './utils.js';
import { MoveNodeCommand } from './commands.js';

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
            draggable: false  // Stage dragging handled separately
        });

        console.log(`Stage créé: ${width}x${height}`);

        this.gridLayer = new Konva.Layer();
        this.connectionLayer = new Konva.Layer();
        this.nodeLayer = new Konva.Layer();

        this.stage.add(this.gridLayer);
        this.stage.add(this.connectionLayer);
        this.stage.add(this.nodeLayer);

        // Settings
        this.showGrid = true;
        this.snapToGrid = false;
        this.scale = 1;

        // Shape maps
        this.entityShapes = new Map();
        this.associationShapes = new Map();
        this.connectionShapes = new Map();

        // Drag tracking
        this.dragStartPos = null;
        this.dragNodeId = null;
        this.dragNodeType = null;

        this.setupGrid();
        this.setupEvents();
        this.render();

        window.addEventListener('resize', () => this.handleResize());
    }

    setupGrid() {
        this.drawGrid();
    }

    drawGrid() {
        this.gridLayer.destroyChildren();

        if (!this.showGrid) {
            this.gridLayer.batchDraw();
            return;
        }

        const width = CONFIG.CANVAS_WIDTH;
        const height = CONFIG.CANVAS_HEIGHT;

        for (let x = 0; x <= width; x += CONFIG.GRID_SIZE) {
            this.gridLayer.add(new Konva.Line({
                points: [x, 0, x, height],
                stroke: CONFIG.COLORS.grid,
                strokeWidth: 1
            }));
        }

        for (let y = 0; y <= height; y += CONFIG.GRID_SIZE) {
            this.gridLayer.add(new Konva.Line({
                points: [0, y, width, y],
                stroke: CONFIG.COLORS.grid,
                strokeWidth: 1
            }));
        }

        this.gridLayer.batchDraw();
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

    setupEvents() {
        // Zoom with mouse wheel
        this.stage.on('wheel', (e) => {
            e.evt.preventDefault();

            const oldScale = this.stage.scaleX();
            const pointer = this.stage.getPointerPosition();

            const mousePointTo = {
                x: (pointer.x - this.stage.x()) / oldScale,
                y: (pointer.y - this.stage.y()) / oldScale
            };

            const direction = e.evt.deltaY > 0 ? -1 : 1;
            const newScale = Math.max(
                CONFIG.ZOOM_MIN,
                Math.min(CONFIG.ZOOM_MAX, oldScale + direction * CONFIG.ZOOM_STEP)
            );

            this.setZoom(newScale, mousePointTo, pointer);
        });

        // Note: Stage click events are handled in app.js for tool management
    }

    setZoom(scale, center, pointer) {
        this.scale = scale;
        this.stage.scale({ x: scale, y: scale });

        const newPos = {
            x: pointer.x - center.x * scale,
            y: pointer.y - center.y * scale
        };

        this.stage.position(newPos);
        this.stage.batchDraw();

        document.getElementById('zoom-level').textContent = Math.round(scale * 100) + '%';
    }

    zoomIn() {
        const newScale = Math.min(CONFIG.ZOOM_MAX, this.scale + CONFIG.ZOOM_STEP);
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
        const newScale = Math.max(CONFIG.ZOOM_MIN, this.scale - CONFIG.ZOOM_STEP);
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
        this.setZoom(1, { x: 0, y: 0 }, { x: 0, y: 0 });
        this.stage.position({ x: 0, y: 0 });
        this.stage.batchDraw();
    }

    handleResize() {
        this.stage.width(this.container.offsetWidth);
        this.stage.height(this.container.offsetHeight);
        this.stage.batchDraw();
    }

    render() {
        this.renderConnections();
        this.renderNodes();
        this.updateSelection();
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

        const height = CONFIG.ENTITY_MIN_HEIGHT + entity.attributes.length * CONFIG.ATTRIBUTE_HEIGHT;

        const rect = new Konva.Rect({
            width: CONFIG.ENTITY_WIDTH,
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
            width: CONFIG.ENTITY_WIDTH,
            height: 40,
            fill: CONFIG.COLORS.entityHeader,
            cornerRadius: [8, 8, 0, 0]
        });

        const nameText = new Konva.Text({
            text: entity.name,
            x: CONFIG.ENTITY_PADDING,
            y: 12,
            width: CONFIG.ENTITY_WIDTH - 2 * CONFIG.ENTITY_PADDING,
            fontSize: 16,
            fontStyle: 'bold',
            fill: CONFIG.COLORS.entityHeaderText,
            align: 'center'
        });

        group.add(rect, headerRect, nameText);

        let yOffset = 50;
        entity.attributes.forEach((attr) => {
            const attrText = new Konva.Text({
                text: formatAttribute(attr),
                x: CONFIG.ENTITY_PADDING,
                y: yOffset,
                width: CONFIG.ENTITY_WIDTH - 2 * CONFIG.ENTITY_PADDING,
                fontSize: 13,
                fill: '#1e293b'
            });
            group.add(attrText);
            yOffset += CONFIG.ATTRIBUTE_HEIGHT;
        });

        this.attachEntityEvents(group, entity);

        this.nodeLayer.add(group);
        this.entityShapes.set(entity.id, { group, rect, nameText, entity });
    }

    attachEntityEvents(group, entity) {
        // Double-click detection (better than native dblclick with draggable elements)
        let lastClickTime = 0;
        const DOUBLE_CLICK_DELAY = 300; // ms

        group.on('click', (e) => {
            // Let app.js handle clicks when connection tool is active
            if (window.app && window.app.currentTool === 'connection') {
                return;
            }

            // Detect double-click manually
            const now = Date.now();
            const timeSinceLastClick = now - lastClickTime;

            if (timeSinceLastClick < DOUBLE_CLICK_DELAY) {
                // Double-click detected!
                console.log('Double-clic détecté sur entité:', entity.name);
                if (window.app && window.app.modalManager) {
                    window.app.modalManager.openEntityModal(entity.id);
                }
                lastClickTime = 0; // Reset
                return;
            }

            lastClickTime = now;

            // Single click - select
            setTimeout(() => {
                if (lastClickTime === now) { // Only if not followed by another click
                    const isMultiSelect = e.evt.shiftKey;
                    this.state.select({ type: 'entity', id: entity.id }, isMultiSelect);
                    this.updateSelection();
                    if (window.app) window.app.updatePropertiesPanel();
                }
            }, DOUBLE_CLICK_DELAY);
        });

        group.on('dragstart', () => {
            this.dragStartPos = { x: entity.x, y: entity.y };
            this.dragNodeId = entity.id;
            this.dragNodeType = 'entity';
        });

        group.on('dragmove', () => {
            const pos = this.snapPosition(group.position());
            group.position(pos);
            entity.x = pos.x;
            entity.y = pos.y;
            this.renderConnections();
        });

        group.on('dragend', () => {
            if (this.dragStartPos) {
                const newPos = { x: entity.x, y: entity.y };
                if (this.dragStartPos.x !== newPos.x || this.dragStartPos.y !== newPos.y) {
                    this.state.executeCommand(
                        new MoveNodeCommand(this.state, entity.id, 'entity', this.dragStartPos, newPos)
                    );
                }
                this.dragStartPos = null;
            }
        });

        group.on('contextmenu', (e) => {
            e.evt.preventDefault();
            if (window.app) window.app.showContextMenu(e.evt.clientX, e.evt.clientY, entity.id, 'entity');
        });
    }

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

        // Calculate size based on attributes
        const headerHeight = 30;
        const attrHeight = assoc.attributes.length * CONFIG.ASSOCIATION_ATTRIBUTE_HEIGHT;
        const totalHeight = Math.max(
            CONFIG.ASSOCIATION_MIN_HEIGHT,
            headerHeight + attrHeight + CONFIG.ASSOCIATION_PADDING * 2
        );
        const width = CONFIG.ASSOCIATION_MIN_WIDTH;

        // Rounded rectangle
        const rect = new Konva.Rect({
            x: -width / 2,
            y: -totalHeight / 2,
            width: width,
            height: totalHeight,
            fill: CONFIG.COLORS.association,
            stroke: CONFIG.COLORS.associationStroke,
            strokeWidth: 2,
            cornerRadius: 15,
            shadowColor: 'black',
            shadowBlur: 10,
            shadowOpacity: 0.1,
            shadowOffset: { x: 0, y: 2 }
        });

        // Association name
        const nameText = new Konva.Text({
            text: assoc.name,
            x: -width / 2 + CONFIG.ASSOCIATION_PADDING,
            y: -totalHeight / 2 + 8,
            width: width - CONFIG.ASSOCIATION_PADDING * 2,
            fontSize: 14,
            fontStyle: 'bold',
            fill: CONFIG.COLORS.associationText,
            align: 'center'
        });

        group.add(rect, nameText);

        // Attributes
        if (assoc.attributes.length > 0) {
            let yOffset = -totalHeight / 2 + headerHeight + CONFIG.ASSOCIATION_PADDING;

            assoc.attributes.forEach((attr) => {
                const attrText = new Konva.Text({
                    text: formatAttribute(attr),
                    x: -width / 2 + CONFIG.ASSOCIATION_PADDING,
                    y: yOffset,
                    width: width - CONFIG.ASSOCIATION_PADDING * 2,
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

    attachAssociationEvents(group, assoc, width, height) {
        // Double-click detection (better than native dblclick with draggable elements)
        let lastClickTime = 0;
        const DOUBLE_CLICK_DELAY = 300; // ms

        group.on('click', (e) => {
            // Let app.js handle clicks when connection tool is active
            if (window.app && window.app.currentTool === 'connection') {
                return;
            }

            // Detect double-click manually
            const now = Date.now();
            const timeSinceLastClick = now - lastClickTime;

            if (timeSinceLastClick < DOUBLE_CLICK_DELAY) {
                // Double-click detected!
                console.log('Double-clic détecté sur association:', assoc.name);
                if (window.app && window.app.modalManager) {
                    window.app.modalManager.openAssociationModal(assoc.id);
                }
                lastClickTime = 0; // Reset
                return;
            }

            lastClickTime = now;

            // Single click - select
            setTimeout(() => {
                if (lastClickTime === now) { // Only if not followed by another click
                    const isMultiSelect = e.evt.shiftKey;
                    this.state.select({ type: 'association', id: assoc.id }, isMultiSelect);
                    this.updateSelection();
                    if (window.app) window.app.updatePropertiesPanel();
                }
            }, DOUBLE_CLICK_DELAY);
        });

        group.on('dragstart', () => {
            this.dragStartPos = { x: assoc.x, y: assoc.y };
            this.dragNodeId = assoc.id;
            this.dragNodeType = 'association';
        });

        group.on('dragmove', () => {
            const pos = this.snapPosition(group.position());
            group.position(pos);
            assoc.x = pos.x;
            assoc.y = pos.y;
            this.renderConnections();
        });

        group.on('dragend', () => {
            if (this.dragStartPos) {
                const newPos = { x: assoc.x, y: assoc.y };
                if (this.dragStartPos.x !== newPos.x || this.dragStartPos.y !== newPos.y) {
                    this.state.executeCommand(
                        new MoveNodeCommand(this.state, assoc.id, 'association', this.dragStartPos, newPos)
                    );
                }
                this.dragStartPos = null;
            }
        });

        group.on('contextmenu', (e) => {
            e.evt.preventDefault();
            if (window.app) window.app.showContextMenu(e.evt.clientX, e.evt.clientY, assoc.id, 'association');
        });
    }

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

        // Get association shape info
        const assocShape = this.associationShapes.get(assoc.id);
        const assocWidth = assocShape ? assocShape.width : CONFIG.ASSOCIATION_MIN_WIDTH;
        const assocHeight = assocShape ? assocShape.height : CONFIG.ASSOCIATION_MIN_HEIGHT;

        // Calculate connection points
        const assocPoint = this.getAssociationEdgePoint(assoc, entity, assocWidth, assocHeight);
        const entityPoint = this.getEntityEdgePoint(entity, assoc);

        // Calculate angle and perpendicular offset for labels
        const angle = calculateAngle(assocPoint, entityPoint);
        const perpOffset = getPerpendicularOffset(angle, CONFIG.LABEL_OFFSET);

        // Create line
        const line = new Konva.Line({
            points: [assocPoint.x, assocPoint.y, entityPoint.x, entityPoint.y],
            stroke: CONFIG.COLORS.connection,
            strokeWidth: 2,
            lineCap: 'round'
        });

        // Cardinality near entity with smart positioning
        const cardOffset = CONFIG.CARDINALITY_OFFSET;
        const cardPos = {
            x: entityPoint.x - Math.cos(angle) * cardOffset + perpOffset.x,
            y: entityPoint.y - Math.sin(angle) * cardOffset + perpOffset.y
        };

        const cardText = new Konva.Text({
            text: conn.cardinality,
            x: cardPos.x - 20,
            y: cardPos.y - 10,
            width: 40,
            fontSize: 12,
            fontStyle: 'bold',
            fill: '#1e293b',
            align: 'center'
        });

        const group = new Konva.Group({ id: conn.id });
        group.add(line, cardText);

        // Connection label at midpoint
        if (conn.label && conn.label.trim()) {
            const midX = (assocPoint.x + entityPoint.x) / 2;
            const midY = (assocPoint.y + entityPoint.y) / 2;

            const labelBg = new Konva.Rect({
                x: midX - 40 + perpOffset.x,
                y: midY - 12 + perpOffset.y,
                width: 80,
                height: 24,
                fill: 'white',
                stroke: CONFIG.COLORS.connection,
                strokeWidth: 1,
                cornerRadius: 4
            });

            const labelText = new Konva.Text({
                text: conn.label,
                x: midX - 40 + perpOffset.x,
                y: midY - 8 + perpOffset.y,
                width: 80,
                fontSize: 11,
                fill: '#1e293b',
                align: 'center'
            });

            group.add(labelBg, labelText);
        }

        line.on('click', () => {
            this.state.select({ type: 'connection', id: conn.id }, false);
            this.updateSelection();
            if (window.app) window.app.updatePropertiesPanel();
        });

        this.connectionLayer.add(group);
        this.connectionShapes.set(conn.id, { group, line, conn });
    }

    getAssociationEdgePoint(assoc, targetEntity, width, height) {
        const entityCenter = this.getEntityCenter(targetEntity);
        const dx = entityCenter.x - assoc.x;
        const dy = entityCenter.y - assoc.y;

        // Calculate intersection with rounded rectangle
        const angle = Math.atan2(dy, dx);

        // Approximate with ellipse for edge calculation
        const a = width / 2;
        const b = height / 2;
        const x = assoc.x + a * Math.cos(angle);
        const y = assoc.y + b * Math.sin(angle);

        return { x, y };
    }

    getEntityEdgePoint(entity, targetAssoc) {
        const centerX = entity.x + CONFIG.ENTITY_WIDTH / 2;
        const centerY = entity.y + (CONFIG.ENTITY_MIN_HEIGHT + entity.attributes.length * CONFIG.ATTRIBUTE_HEIGHT) / 2;

        const dx = targetAssoc.x - centerX;
        const dy = targetAssoc.y - centerY;

        const width = CONFIG.ENTITY_WIDTH;
        const height = CONFIG.ENTITY_MIN_HEIGHT + entity.attributes.length * CONFIG.ATTRIBUTE_HEIGHT;

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
        return {
            x: entity.x + CONFIG.ENTITY_WIDTH / 2,
            y: entity.y + (CONFIG.ENTITY_MIN_HEIGHT + entity.attributes.length * CONFIG.ATTRIBUTE_HEIGHT) / 2
        };
    }

    updateSelection() {
        // Reset all strokes
        this.entityShapes.forEach(shape => {
            const rect = shape.group.findOne('Rect');
            if (rect) {
                rect.stroke(CONFIG.COLORS.entityStroke);
                rect.strokeWidth(2);
            }
        });

        this.associationShapes.forEach(shape => {
            const rect = shape.group.findOne('Rect');
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
                    const rect = shape.group.findOne('Rect');
                    if (rect) {
                        rect.stroke(CONFIG.COLORS.associationStrokeSelected);
                        rect.strokeWidth(3);
                    }
                }
            } else if (item.type === 'connection') {
                const shape = this.connectionShapes.get(item.id);
                if (shape && shape.line) {
                    shape.line.stroke(CONFIG.COLORS.connectionSelected);
                    shape.line.strokeWidth(3);
                }
            }
        });

        this.nodeLayer.batchDraw();
        this.connectionLayer.batchDraw();
    }

    getStagePointerPosition() {
        const pos = this.stage.getPointerPosition();
        const transform = this.stage.getAbsoluteTransform().copy().invert();
        return transform.point(pos);
    }
}

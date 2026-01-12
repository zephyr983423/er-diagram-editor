// ===========================
// CANVAS RENDERER
// ===========================

import { CONFIG } from './config.js';
import { formatAttribute, formatAttributeSimple, calculateAngle, getPerpendicularOffset, snapToGrid, generateId } from './utils.js';
import { MoveNodeCommand } from './commands.js';
import { Connection } from './models.js';
import { CreateConnectionCommand } from './commands.js';

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
            const parts = formatAttribute(attr);
            let xOffset = CONFIG.ENTITY_PADDING;

            parts.forEach((part) => {
                let textConfig = {
                    text: part.text,
                    x: xOffset,
                    y: yOffset,
                    fontSize: 13,
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
                    textConfig.fontSize = 11;
                }

                const textNode = new Konva.Text(textConfig);
                group.add(textNode);
                xOffset += textNode.width();
            });

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
                // Clear temp connection on double-click
                if (window.app) window.app.tempConnection = null;
                return;
            }

            lastClickTime = now;

            // Single click - check for pending connection or memorize entity
            setTimeout(() => {
                if (lastClickTime === now) { // Only if not followed by another click
                    // Check if there's a pending connection from an association
                    if (window.app && window.app.tempConnection && window.app.tempConnection.associationId) {
                        // Create connection: association → entity
                        const conn = new Connection(
                            generateId('conn'),
                            window.app.tempConnection.associationId,
                            entity.id,
                            '1,n',
                            ''
                        );
                        this.state.executeCommand(new CreateConnectionCommand(this.state, conn));
                        window.app.tempConnection = null;
                        this.render();
                        console.log('✓ Connexion créée automatiquement: association → entité');
                    } else {
                        // Store this entity for potential connection
                        if (window.app) {
                            window.app.tempConnection = {
                                entityId: entity.id,
                                entity: entity
                            };
                            console.log('→ Entité sélectionnée. Cliquez sur une association pour créer une connexion.');
                        }

                        // Normal selection
                        const isMultiSelect = e.evt.shiftKey;
                        this.state.select({ type: 'entity', id: entity.id }, isMultiSelect);
                        this.updateSelection();
                        if (window.app) window.app.updatePropertiesPanel();
                    }
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
                    text: formatAttributeSimple(attr),
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
                // Clear temp connection on double-click
                if (window.app) window.app.tempConnection = null;
                return;
            }

            lastClickTime = now;

            // Single click - check for pending entity or memorize association
            setTimeout(() => {
                if (lastClickTime === now) { // Only if not followed by another click
                    // Check if there's a pending connection from an entity
                    if (window.app && window.app.tempConnection && window.app.tempConnection.entityId) {
                        // Create connection: entity → association
                        const conn = new Connection(
                            generateId('conn'),
                            assoc.id,
                            window.app.tempConnection.entityId,
                            '1,n',
                            ''
                        );
                        this.state.executeCommand(new CreateConnectionCommand(this.state, conn));
                        window.app.tempConnection = null;
                        this.render();
                        console.log('✓ Connexion créée automatiquement: entité → association');
                    } else {
                        // Store this association for potential connection
                        if (window.app) {
                            window.app.tempConnection = {
                                associationId: assoc.id,
                                association: assoc
                            };
                            console.log('→ Association sélectionnée. Cliquez sur une entité pour créer une connexion.');
                        }

                        // Also select normally
                        const isMultiSelect = e.evt.shiftKey;
                        this.state.select({ type: 'association', id: assoc.id }, isMultiSelect);
                        this.updateSelection();
                        if (window.app) window.app.updatePropertiesPanel();
                    }
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

        // Check if this is a self-association (auto-association)
        const connections = this.state.getConnectionsForAssociation(conn.associationId);
        const entityConnections = connections.filter(c => c.entityId === entity.id);
        const isSelfAssociation = entityConnections.length > 1;
        const connectionIndex = entityConnections.findIndex(c => c.id === conn.id);

        // Get association shape info
        const assocShape = this.associationShapes.get(assoc.id);
        const assocWidth = assocShape ? assocShape.width : CONFIG.ASSOCIATION_MIN_WIDTH;
        const assocHeight = assocShape ? assocShape.height : CONFIG.ASSOCIATION_MIN_HEIGHT;

        const group = new Konva.Group({ id: conn.id });

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
            fontSize: 15,
            fontStyle: 'bold',
            fill: '#1e293b',
            align: 'center'
        });

        group.add(line, cardText);

        // Connection label at midpoint (without border)
        if (conn.label && conn.label.trim()) {
            const midX = (assocPoint.x + entityPoint.x) / 2;
            const midY = (assocPoint.y + entityPoint.y) / 2;

            // Offset label more to the side to avoid overlapping with cardinality
            const labelOffset = getPerpendicularOffset(angle, 25);

            const labelText = new Konva.Text({
                text: conn.label,
                x: midX - 40 + labelOffset.x,
                y: midY - 8 + labelOffset.y,
                width: 80,
                fontSize: 14,
                fill: '#2563eb',
                fontStyle: 'italic',
                align: 'center'
            });

            group.add(labelText);
        }

        line.on('click', () => {
            this.state.select({ type: 'connection', id: conn.id }, false);
            this.updateSelection();
        });
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
            bezier: true
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
        const cardinalityDistance = CONFIG.LABEL_OFFSET;  // 15px - same as normal connections
        const labelDistance = 25;  // 25px - same as normal connections
        const sideMultiplier = connectionIndex === 0 ? 1 : -1;

        // Cardinality on one side
        const cardPerpX = -Math.sin(tangentAngle) * cardinalityDistance * sideMultiplier;
        const cardPerpY = Math.cos(tangentAngle) * cardinalityDistance * sideMultiplier;

        // Cardinality at midpoint, offset to one side
        const cardText = new Konva.Text({
            text: conn.cardinality,
            x: midX + cardPerpX - 20,
            y: midY + cardPerpY - 10,
            width: 40,
            fontSize: 15,
            fontStyle: 'bold',
            fill: '#1e293b',
            align: 'center'
        });

        group.add(curve, cardText);

        // Label at midpoint, on the OPPOSITE side from cardinality
        if (conn.label && conn.label.trim()) {
            // Opposite side: negate the multiplier, use same distance as normal connections
            const labelPerpX = -Math.sin(tangentAngle) * labelDistance * (-sideMultiplier);
            const labelPerpY = Math.cos(tangentAngle) * labelDistance * (-sideMultiplier);

            const labelText = new Konva.Text({
                text: conn.label,
                x: midX + labelPerpX - 40,
                y: midY + labelPerpY - 10,
                width: 80,
                fontSize: 14,
                fill: '#2563eb',
                fontStyle: 'italic',
                align: 'center'
            });

            group.add(labelText);
        }

        curve.on('click', () => {
            this.state.select({ type: 'connection', id: conn.id }, false);
            this.updateSelection();
        });
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
    }

    getStagePointerPosition() {
        const pos = this.stage.getPointerPosition();
        const transform = this.stage.getAbsoluteTransform().copy().invert();
        return transform.point(pos);
    }
}

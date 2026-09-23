// ===========================
// COMMAND PATTERN
// ===========================

import { Association, Connection, TextAnnotation, MAX_TEXT_NOTES } from './models.js';
import { validCoordinate } from './viewport.js';
import { applySize, validDimension } from './dimensions.js';

export class ResizeNodeCommand {
    constructor(state, id, type, previous, next) {
        this.state = state; this.id = id; this.type = type;
        this.previous = structuredClone(previous); this.next = structuredClone(next);
    }
    apply(data) {
        const node = this.type === 'entity' ? this.state.getEntity(this.id) : this.type === 'association' ? this.state.getAssociation(this.id) : this.state.getText(this.id);
        if (!node) return;
        assertPosition(data);
        for (const key of ['width', 'height']) if (data[key] !== undefined && !validDimension(data[key])) throw new Error('Dimension invalide.');
        applySize(node, data);
    }
    execute() { this.apply(this.next); }
    undo() { this.apply(this.previous); }
}

function assertPosition(position) {
    if (!validCoordinate(position.x) || !validCoordinate(position.y)) throw new Error('Position hors de la plage numérique prise en charge.');
}

export class UpdateConnectionCommand {
    constructor(state, id, previous, next) {
        this.state = state; this.id = id;
        this.previous = { cardinality: previous.cardinality, label: previous.label };
        this.next = { cardinality: next.cardinality, label: next.label };
    }
    apply(data) { const connection = this.state.getConnection(this.id); if (connection) Object.assign(connection, data); }
    execute() { this.apply(this.next); }
    undo() { this.apply(this.previous); }
}

export class UpdateTextCommand {
    constructor(state, id, previous, next) {
        this.state = state; this.id = id; this.previous = structuredClone(previous); this.next = structuredClone(next);
        this.index = state.texts.findIndex(text => text.id === id);
    }
    apply(data) {
        const index = this.state.texts.findIndex(text => text.id === this.id);
        if (!data) { if (index >= 0) this.state.texts.splice(index, 1); return; }
        if (index < 0 && this.state.texts.length >= MAX_TEXT_NOTES) throw new Error(`Un diagramme peut contenir jusqu’à ${MAX_TEXT_NOTES} notes.`);
        assertPosition(data);
        const text = TextAnnotation.fromJSON(data);
        if (index >= 0) this.state.texts.splice(index, 1, text);
        else this.state.texts.splice(this.index < 0 ? this.state.texts.length : this.index, 0, text);
    }
    execute() { this.apply(this.next); }
    undo() { this.apply(this.previous); }
}

export class Command {
    execute() {
        throw new Error('execute() must be implemented');
    }
    undo() {
        throw new Error('undo() must be implemented');
    }
}

export class CreateEntityCommand extends Command {
    constructor(state, entity) {
        super();
        this.state = state;
        this.entity = entity;
    }

    execute() {
        assertPosition(this.entity);
        this.state.entities.push(this.entity);
    }

    undo() {
        this.state.entities = this.state.entities.filter(e => e.id !== this.entity.id);
    }
}

export class UpdateEntityCommand extends Command {
    constructor(state, entityId, oldData, newData) {
        super();
        this.state = state;
        this.entityId = entityId;
        this.oldData = oldData;
        this.newData = newData;
    }

    execute() {
        const entity = this.state.getEntity(this.entityId);
        if (entity) {
            Object.assign(entity, this.newData);
        }
    }

    undo() {
        const entity = this.state.getEntity(this.entityId);
        if (entity) {
            Object.assign(entity, this.oldData);
        }
    }
}

export class DeleteEntityCommand extends Command {
    constructor(state, entity) {
        super();
        this.state = state;
        this.entity = entity;
        this.deletedConnections = [];
    }

    execute() {
        this.state.entities = this.state.entities.filter(e => e.id !== this.entity.id);
        this.deletedConnections = this.state.connections.filter(c => c.entityId === this.entity.id);
        this.state.connections = this.state.connections.filter(c => c.entityId !== this.entity.id);
    }

    undo() {
        this.state.entities.push(this.entity);
        this.deletedConnections.forEach(c => this.state.connections.push(c));
    }
}

export class CreateAssociationCommand extends Command {
    constructor(state, association) {
        super();
        this.state = state;
        this.association = association;
    }

    execute() {
        assertPosition(this.association);
        this.state.associations.push(this.association);
    }

    undo() {
        this.state.associations = this.state.associations.filter(a => a.id !== this.association.id);
    }
}

export class UpdateAssociationCommand extends Command {
    constructor(state, associationId, oldData, newData, oldConnections = null, newConnections = null) {
        super();
        this.state = state;
        this.associationId = associationId;
        this.oldData = structuredClone(oldData);
        this.newData = structuredClone(newData);
        this.oldConnections = oldConnections && structuredClone(oldConnections);
        this.newConnections = newConnections && structuredClone(newConnections);
        this.connectionOrder = new Map(state.connections.map((connection, index) => [connection.id, index]));
    }

    restoreConnections(connections) {
        this.state.connections = [
            ...this.state.connections.filter(c => c.associationId !== this.associationId),
            ...connections.map(Connection.fromJSON)
        ].sort((left, right) => (this.connectionOrder.get(left.id) ?? Number.MAX_SAFE_INTEGER) -
            (this.connectionOrder.get(right.id) ?? Number.MAX_SAFE_INTEGER));
    }

    execute() {
        const assoc = this.state.getAssociation(this.associationId);
        if (assoc) {
            Object.assign(assoc, Association.fromJSON(this.newData));
        }
        if (this.newConnections) {
            this.restoreConnections(this.newConnections);
        }
    }

    undo() {
        const assoc = this.state.getAssociation(this.associationId);
        if (assoc) {
            Object.assign(assoc, Association.fromJSON(this.oldData));
        }
        if (this.oldConnections) {
            this.restoreConnections(this.oldConnections);
        }
    }
}

export class DeleteAssociationCommand extends Command {
    constructor(state, association) {
        super();
        this.state = state;
        this.association = association;
        this.deletedConnections = [];
    }

    execute() {
        this.state.associations = this.state.associations.filter(a => a.id !== this.association.id);
        this.deletedConnections = this.state.connections.filter(c => c.associationId === this.association.id);
        this.state.connections = this.state.connections.filter(c => c.associationId !== this.association.id);
    }

    undo() {
        this.state.associations.push(this.association);
        this.deletedConnections.forEach(c => this.state.connections.push(c));
    }
}

export class CreateConnectionCommand extends Command {
    constructor(state, connection) {
        super();
        this.state = state;
        this.connection = connection;
    }

    execute() {
        this.state.connections.push(this.connection);
    }

    undo() {
        this.state.connections = this.state.connections.filter(c => c.id !== this.connection.id);
    }
}

export class DeleteConnectionCommand extends Command {
    constructor(state, connection) {
        super();
        this.state = state;
        this.connection = connection;
    }

    execute() {
        this.state.connections = this.state.connections.filter(c => c.id !== this.connection.id);
    }

    undo() {
        this.state.connections.push(this.connection);
    }
}

export class MoveNodeCommand extends Command {
    constructor(state, nodeId, nodeType, oldPos, newPos) {
        super();
        this.state = state;
        this.nodeId = nodeId;
        this.nodeType = nodeType;
        this.oldPos = oldPos;
        this.newPos = newPos;
    }

    execute() {
        const node = this.nodeType === 'entity'
            ? this.state.getEntity(this.nodeId)
            : this.nodeType === 'text' ? this.state.getText(this.nodeId) : this.state.getAssociation(this.nodeId);
        if (node) {
            assertPosition(this.newPos);
            node.x = this.newPos.x;
            node.y = this.newPos.y;
        }
    }

    undo() {
        const node = this.nodeType === 'entity'
            ? this.state.getEntity(this.nodeId)
            : this.nodeType === 'text' ? this.state.getText(this.nodeId) : this.state.getAssociation(this.nodeId);
        if (node) {
            node.x = this.oldPos.x;
            node.y = this.oldPos.y;
        }
    }
}

export class MoveMultipleNodesCommand extends Command {
    constructor(state, moves) {
        super();
        this.state = state;
        this.moves = moves; // Array of { id, type, oldPos, newPos }
    }

    getNode(move) {
        return move.type === 'entity' ? this.state.getEntity(move.id) :
            move.type === 'text' ? this.state.getText(move.id) : this.state.getAssociation(move.id);
    }

    execute() {
        for (const move of this.moves) {
            const node = this.getNode(move);
            if (node) { node.x = move.newPos.x; node.y = move.newPos.y; }
        }
    }

    undo() {
        for (const move of this.moves) {
            const node = this.getNode(move);
            if (node) { node.x = move.oldPos.x; node.y = move.oldPos.y; }
        }
    }
}

export class DeleteSelectionCommand extends Command {
    constructor(state, selectedItems) {
        super();
        this.state = state;
        const entityIds = new Set(selectedItems.filter(item => item.type === 'entity').map(item => item.id));
        const associationIds = new Set(selectedItems.filter(item => item.type === 'association').map(item => item.id));
        const connectionIds = new Set(selectedItems.filter(item => item.type === 'connection').map(item => item.id));
        const textIds = new Set(selectedItems.filter(item => item.type === 'text').map(item => item.id));
        this.texts = state.texts.filter(text => textIds.has(text.id));

        this.entities = state.entities.filter(entity => entityIds.has(entity.id));
        this.associations = state.associations.filter(association => associationIds.has(association.id));
        this.connections = state.connections.filter(connection =>
            connectionIds.has(connection.id) ||
            entityIds.has(connection.entityId) ||
            associationIds.has(connection.associationId)
        );
    }

    execute() {
        const entityIds = new Set(this.entities.map(entity => entity.id));
        const associationIds = new Set(this.associations.map(association => association.id));
        const connectionIds = new Set(this.connections.map(connection => connection.id));
        this.state.entities = this.state.entities.filter(entity => !entityIds.has(entity.id));
        this.state.associations = this.state.associations.filter(association => !associationIds.has(association.id));
        this.state.connections = this.state.connections.filter(connection => !connectionIds.has(connection.id));
        const textIds = new Set(this.texts.map(text => text.id));
        this.state.texts = this.state.texts.filter(text => !textIds.has(text.id));
    }

    undo() {
        this.state.entities.push(...this.entities);
        this.state.associations.push(...this.associations);
        this.state.connections.push(...this.connections);
        this.state.texts.push(...this.texts);
    }
}

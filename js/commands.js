// ===========================
// COMMAND PATTERN
// ===========================

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
        this.state.associations.push(this.association);
    }

    undo() {
        this.state.associations = this.state.associations.filter(a => a.id !== this.association.id);
    }
}

export class UpdateAssociationCommand extends Command {
    constructor(state, associationId, oldData, newData) {
        super();
        this.state = state;
        this.associationId = associationId;
        this.oldData = oldData;
        this.newData = newData;
    }

    execute() {
        const assoc = this.state.getAssociation(this.associationId);
        if (assoc) {
            Object.assign(assoc, this.newData);
        }
    }

    undo() {
        const assoc = this.state.getAssociation(this.associationId);
        if (assoc) {
            Object.assign(assoc, this.oldData);
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
            : this.state.getAssociation(this.nodeId);
        if (node) {
            node.x = this.newPos.x;
            node.y = this.newPos.y;
        }
    }

    undo() {
        const node = this.nodeType === 'entity'
            ? this.state.getEntity(this.nodeId)
            : this.state.getAssociation(this.nodeId);
        if (node) {
            node.x = this.oldPos.x;
            node.y = this.oldPos.y;
        }
    }
}

// ===========================
// DIAGRAM STATE MANAGER
// ===========================

import { Entity, Association, Connection } from './models.js';

export class DiagramState {
    constructor() {
        this.entities = [];
        this.associations = [];
        this.connections = [];
        this.selectedItems = [];
        this.clipboard = null;
        this.commandHistory = [];
        this.historyIndex = -1;
        this.maxHistory = 50;
    }

    // Entity operations
    getEntity(entityId) {
        return this.entities.find(e => e.id === entityId);
    }

    // Association operations
    getAssociation(associationId) {
        return this.associations.find(a => a.id === associationId);
    }

    // Connection operations
    getConnection(connectionId) {
        return this.connections.find(c => c.id === connectionId);
    }

    getConnectionsForAssociation(associationId) {
        return this.connections.filter(c => c.associationId === associationId);
    }

    getConnectionsForEntity(entityId) {
        return this.connections.filter(c => c.entityId === entityId);
    }

    // Command execution with history
    executeCommand(command) {
        if (this.historyIndex < this.commandHistory.length - 1) {
            this.commandHistory = this.commandHistory.slice(0, this.historyIndex + 1);
        }

        command.execute();
        this.commandHistory.push(command);

        if (this.commandHistory.length > this.maxHistory) {
            this.commandHistory.shift();
        } else {
            this.historyIndex++;
        }

        this.saveToLocalStorage();
    }

    undo() {
        if (this.historyIndex >= 0) {
            this.commandHistory[this.historyIndex].undo();
            this.historyIndex--;
            this.saveToLocalStorage();
            return true;
        }
        return false;
    }

    redo() {
        if (this.historyIndex < this.commandHistory.length - 1) {
            this.historyIndex++;
            this.commandHistory[this.historyIndex].execute();
            this.saveToLocalStorage();
            return true;
        }
        return false;
    }

    // Selection
    select(item, multi = false) {
        if (!multi) {
            this.selectedItems = [item];
        } else {
            const index = this.selectedItems.findIndex(i => i.id === item.id);
            if (index >= 0) {
                this.selectedItems.splice(index, 1);
            } else {
                this.selectedItems.push(item);
            }
        }
    }

    clearSelection() {
        this.selectedItems = [];
    }

    deleteSelected() {
        const { DeleteEntityCommand, DeleteAssociationCommand, DeleteConnectionCommand } =
            window.ERDiagramCommands;

        this.selectedItems.forEach(item => {
            if (item.type === 'entity') {
                const entity = this.getEntity(item.id);
                if (entity) {
                    this.executeCommand(new DeleteEntityCommand(this, entity));
                }
            } else if (item.type === 'association') {
                const assoc = this.getAssociation(item.id);
                if (assoc) {
                    this.executeCommand(new DeleteAssociationCommand(this, assoc));
                }
            } else if (item.type === 'connection') {
                const conn = this.getConnection(item.id);
                if (conn) {
                    this.executeCommand(new DeleteConnectionCommand(this, conn));
                }
            }
        });
        this.selectedItems = [];
    }

    // Clipboard operations
    copy() {
        if (this.selectedItems.length > 0) {
            this.clipboard = this.selectedItems
                .filter(item => item.type === 'entity' || item.type === 'association')
                .map(item => {
                    if (item.type === 'entity') {
                        return this.getEntity(item.id).clone();
                    } else {
                        return this.getAssociation(item.id).clone();
                    }
                });
        }
    }

    paste() {
        const { CreateEntityCommand, CreateAssociationCommand } = window.ERDiagramCommands;

        if (this.clipboard && this.clipboard.length > 0) {
            this.clipboard.forEach(node => {
                if (node.type === 'entity') {
                    this.executeCommand(new CreateEntityCommand(this, node));
                } else {
                    this.executeCommand(new CreateAssociationCommand(this, node));
                }
            });
            this.clipboard = this.clipboard.map(n => n.clone());
            return true;
        }
        return false;
    }

    // Serialization
    serialize() {
        return JSON.stringify({
            entities: this.entities.map(e => e.toJSON()),
            associations: this.associations.map(a => a.toJSON()),
            connections: this.connections.map(c => c.toJSON())
        });
    }

    deserialize(json) {
        try {
            const data = JSON.parse(json);
            this.entities = data.entities.map(e => Entity.fromJSON(e));
            this.associations = (data.associations || []).map(a => Association.fromJSON(a));
            this.connections = (data.connections || []).map(c => Connection.fromJSON(c));
            this.selectedItems = [];
            this.commandHistory = [];
            this.historyIndex = -1;
            this.saveToLocalStorage();
            return true;
        } catch (e) {
            console.error('Failed to deserialize:', e);
            return false;
        }
    }

    // LocalStorage
    saveToLocalStorage() {
        try {
            localStorage.setItem('er-diagram-v2', this.serialize());
        } catch (e) {
            console.error('Failed to save to localStorage:', e);
        }
    }

    loadFromLocalStorage() {
        try {
            const data = localStorage.getItem('er-diagram-v2');
            if (data) {
                return this.deserialize(data);
            }
        } catch (e) {
            console.error('Failed to load from localStorage:', e);
        }
        return false;
    }

    clear() {
        this.entities = [];
        this.associations = [];
        this.connections = [];
        this.selectedItems = [];
        this.commandHistory = [];
        this.historyIndex = -1;
        this.saveToLocalStorage();
    }
}

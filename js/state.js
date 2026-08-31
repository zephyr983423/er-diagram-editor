import { CONFIG } from './config.js';
import { Entity, Association, Connection } from './models.js';

const STORAGE_KEY = 'er-diagram-v2';
const MAX_ITEMS = 500;
const MAX_ATTRIBUTES = 200;
const MAX_TEXT_LENGTH = 160;

function isObject(value) {
    return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function assertText(value, label, { allowEmpty = false } = {}) {
    if (typeof value !== 'string' || value.length > MAX_TEXT_LENGTH || (!allowEmpty && !value.trim())) {
        throw new Error(`${label} doit être un texte ${allowEmpty ? 'valide' : 'non vide'} de moins de ${MAX_TEXT_LENGTH} caractères.`);
    }
}

function assertPosition(value, label) {
    if (!Number.isFinite(value) || Math.abs(value) > 100000) {
        throw new Error(`${label} doit être une coordonnée numérique valide.`);
    }
}

function validateAttribute(attribute, context) {
    if (!isObject(attribute)) throw new Error(`${context} contient un attribut invalide.`);
    assertText(attribute.id, `${context} : identifiant d’attribut`);
    assertText(attribute.name, `${context} : nom d’attribut`);
    if (!CONFIG.SQL_TYPES.includes(attribute.type)) {
        throw new Error(`${context} : le type SQL « ${attribute.type} » n’est pas pris en charge.`);
    }
    for (const key of ['isPK', 'isUQ', 'isNull']) {
        if (typeof attribute[key] !== 'boolean') throw new Error(`${context} : ${key} doit être booléen.`);
    }
    assertText(attribute.defaultValue ?? '', `${context} : valeur par défaut`, { allowEmpty: true });
    if (attribute.enumValues !== undefined) {
        if (!Array.isArray(attribute.enumValues) || attribute.enumValues.length > MAX_ATTRIBUTES) {
            throw new Error(`${context} : valeurs ENUM/SET invalides.`);
        }
        attribute.enumValues.forEach((value, index) => assertText(value, `${context} : valeur ENUM/SET ${index + 1}`));
    }
}

function validateNode(node, kind, seenIds) {
    if (!isObject(node)) throw new Error(`${kind} invalide.`);
    assertText(node.id, `${kind} : identifiant`);
    if (seenIds.has(node.id)) throw new Error(`L’identifiant « ${node.id} » est utilisé plusieurs fois.`);
    seenIds.add(node.id);
    assertText(node.name, `${kind} : nom`);
    assertPosition(node.x, `${kind} : position X`);
    assertPosition(node.y, `${kind} : position Y`);
    if (!Array.isArray(node.attributes) || node.attributes.length > MAX_ATTRIBUTES) {
        throw new Error(`${kind} : liste d’attributs invalide.`);
    }
    const attributeIds = new Set();
    node.attributes.forEach((attribute, index) => {
        validateAttribute(attribute, `${kind} « ${node.name} », attribut ${index + 1}`);
        if (attributeIds.has(attribute.id)) throw new Error(`${kind} « ${node.name} » contient deux attributs avec le même identifiant.`);
        attributeIds.add(attribute.id);
    });
}

export function validateDiagramData(data) {
    if (!isObject(data)) throw new Error('Le document JSON doit être un objet.');
    for (const collection of ['entities', 'associations', 'connections']) {
        if (!Array.isArray(data[collection]) || data[collection].length > MAX_ITEMS) {
            throw new Error(`La collection « ${collection} » est absente ou trop volumineuse.`);
        }
    }

    const nodeIds = new Set();
    data.entities.forEach(node => validateNode(node, 'Entité', nodeIds));
    data.associations.forEach(node => validateNode(node, 'Association', nodeIds));

    const entityIds = new Set(data.entities.map(entity => entity.id));
    const associationIds = new Set(data.associations.map(association => association.id));
    const connectionIds = new Set();
    const cardinalities = new Set(CONFIG.CARDINALITY_OPTIONS.map(option => option.value));

    data.connections.forEach((connection, index) => {
        const label = `Connexion ${index + 1}`;
        if (!isObject(connection)) throw new Error(`${label} invalide.`);
        assertText(connection.id, `${label} : identifiant`);
        if (connectionIds.has(connection.id)) throw new Error(`L’identifiant de connexion « ${connection.id} » est utilisé plusieurs fois.`);
        connectionIds.add(connection.id);
        if (!associationIds.has(connection.associationId)) throw new Error(`${label} pointe vers une association inconnue.`);
        if (!entityIds.has(connection.entityId)) throw new Error(`${label} pointe vers une entité inconnue.`);
        if (!cardinalities.has(connection.cardinality)) throw new Error(`${label} contient une cardinalité inconnue.`);
        assertText(connection.label ?? '', `${label} : libellé`, { allowEmpty: true });
    });

    return data;
}

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
        this.lastError = '';
        this.listeners = new Set();
    }

    subscribe(listener) {
        this.listeners.add(listener);
        return () => this.listeners.delete(listener);
    }

    notify(reason = 'change') {
        this.listeners.forEach(listener => listener(reason, this));
    }

    getEntity(entityId) { return this.entities.find(entity => entity.id === entityId); }
    getAssociation(associationId) { return this.associations.find(association => association.id === associationId); }
    getConnection(connectionId) { return this.connections.find(connection => connection.id === connectionId); }
    getConnectionsForAssociation(associationId) { return this.connections.filter(connection => connection.associationId === associationId); }
    getConnectionsForEntity(entityId) { return this.connections.filter(connection => connection.entityId === entityId); }

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
        if (this.historyIndex < 0) return false;
        this.commandHistory[this.historyIndex].undo();
        this.historyIndex--;
        this.saveToLocalStorage();
        return true;
    }

    redo() {
        if (this.historyIndex >= this.commandHistory.length - 1) return false;
        this.historyIndex++;
        this.commandHistory[this.historyIndex].execute();
        this.saveToLocalStorage();
        return true;
    }

    select(item, multi = false) {
        if (!multi) {
            this.selectedItems = [item];
        } else {
            const index = this.selectedItems.findIndex(selected => selected.id === item.id);
            if (index >= 0) this.selectedItems.splice(index, 1);
            else this.selectedItems.push(item);
        }
        this.notify('selection');
    }

    clearSelection() {
        this.selectedItems = [];
        this.notify('selection');
    }

    deleteSelected() {
        if (!this.selectedItems.length) return false;
        const { DeleteSelectionCommand } = window.ERDiagramCommands;
        this.executeCommand(new DeleteSelectionCommand(this, this.selectedItems));
        this.selectedItems = [];
        this.notify('selection');
        return true;
    }

    copy() {
        this.clipboard = this.selectedItems
            .filter(item => item.type === 'entity' || item.type === 'association')
            .map(item => item.type === 'entity' ? this.getEntity(item.id)?.clone() : this.getAssociation(item.id)?.clone())
            .filter(Boolean);
        return this.clipboard.length > 0;
    }

    paste() {
        const { CreateEntityCommand, CreateAssociationCommand } = window.ERDiagramCommands;
        if (!this.clipboard?.length) return false;
        const pasted = [];
        this.clipboard.forEach(node => {
            if (node.type === 'entity') this.executeCommand(new CreateEntityCommand(this, node));
            else this.executeCommand(new CreateAssociationCommand(this, node));
            pasted.push({ type: node.type, id: node.id });
        });
        this.selectedItems = pasted;
        this.clipboard = this.clipboard.map(node => node.clone());
        this.notify('selection');
        return true;
    }

    toData() {
        return {
            version: 1,
            entities: this.entities.map(entity => entity.toJSON()),
            associations: this.associations.map(association => association.toJSON()),
            connections: this.connections.map(connection => connection.toJSON())
        };
    }

    serialize(pretty = false) {
        return JSON.stringify(this.toData(), null, pretty ? 2 : 0);
    }

    deserialize(jsonOrData, { persist = true } = {}) {
        try {
            const data = typeof jsonOrData === 'string' ? JSON.parse(jsonOrData) : structuredClone(jsonOrData);
            validateDiagramData(data);
            this.entities = data.entities.map(Entity.fromJSON);
            this.associations = data.associations.map(Association.fromJSON);
            this.connections = data.connections.map(Connection.fromJSON);
            this.selectedItems = [];
            this.commandHistory = [];
            this.historyIndex = -1;
            this.lastError = '';
            if (persist) this.saveToLocalStorage();
            else this.notify('load');
            return true;
        } catch (error) {
            this.lastError = error instanceof Error ? error.message : 'Le document est invalide.';
            return false;
        }
    }

    saveToLocalStorage() {
        try {
            localStorage.setItem(STORAGE_KEY, this.serialize());
            this.lastError = '';
            this.notify('save');
            return true;
        } catch (error) {
            this.lastError = error instanceof Error ? error.message : 'La sauvegarde locale a échoué.';
            this.notify('save-error');
            return false;
        }
    }

    loadFromLocalStorage() {
        try {
            const data = localStorage.getItem(STORAGE_KEY);
            return data ? this.deserialize(data, { persist: false }) : false;
        } catch (error) {
            this.lastError = error instanceof Error ? error.message : 'La sauvegarde locale est inaccessible.';
            return false;
        }
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

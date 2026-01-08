// ===========================
// DATA MODELS
// ===========================

import { generateId } from './utils.js';

export class Attribute {
    constructor(id, name, type = 'VARCHAR', isPK = false, isUQ = false, isNull = true, defaultValue = '') {
        this.id = id || generateId('attr');
        this.name = name || 'nouvel_attribut';
        this.type = type;
        this.isPK = isPK;
        this.isUQ = isUQ;
        this.isNull = isNull;
        this.defaultValue = defaultValue;
        this.enumValues = [];
    }

    clone() {
        const attr = new Attribute(
            generateId('attr'),
            this.name,
            this.type,
            this.isPK,
            this.isUQ,
            this.isNull,
            this.defaultValue
        );
        attr.enumValues = [...this.enumValues];
        return attr;
    }
}

export class Entity {
    constructor(id, name, x, y, attributes = []) {
        this.id = id || generateId('entity');
        this.name = name || 'Nouvelle Entité';
        this.x = x || 100;
        this.y = y || 100;
        this.type = 'entity';
        this.attributes = attributes.length ? attributes : [
            new Attribute(generateId('attr'), 'id', 'INTEGER', true, false, false, '')
        ];
    }

    clone() {
        return new Entity(
            generateId('entity'),
            this.name + ' (copie)',
            this.x + 50,
            this.y + 50,
            this.attributes.map(attr => attr.clone())
        );
    }

    toJSON() {
        return {
            id: this.id,
            name: this.name,
            x: this.x,
            y: this.y,
            type: this.type,
            attributes: this.attributes.map(a => ({ ...a }))
        };
    }

    static fromJSON(json) {
        const entity = new Entity(json.id, json.name, json.x, json.y);
        entity.attributes = json.attributes.map(a => {
            const attr = new Attribute(
                a.id,
                a.name,
                a.type,
                a.isPK,
                a.isUQ,
                a.isNull,
                a.defaultValue
            );
            attr.enumValues = a.enumValues || [];
            return attr;
        });
        return entity;
    }
}

export class Association {
    constructor(id, name, x, y, attributes = []) {
        this.id = id || generateId('assoc');
        this.name = name || 'Association';
        this.x = x || 100;
        this.y = y || 100;
        this.type = 'association';
        this.attributes = attributes;
    }

    clone() {
        return new Association(
            generateId('assoc'),
            this.name + ' (copie)',
            this.x + 50,
            this.y + 50,
            this.attributes.map(attr => attr.clone())
        );
    }

    toJSON() {
        return {
            id: this.id,
            name: this.name,
            x: this.x,
            y: this.y,
            type: this.type,
            attributes: this.attributes.map(a => ({ ...a }))
        };
    }

    static fromJSON(json) {
        const assoc = new Association(json.id, json.name, json.x, json.y);
        assoc.attributes = (json.attributes || []).map(a => {
            const attr = new Attribute(
                a.id,
                a.name,
                a.type,
                a.isPK,
                a.isUQ,
                a.isNull,
                a.defaultValue
            );
            attr.enumValues = a.enumValues || [];
            return attr;
        });
        return assoc;
    }
}

export class Connection {
    constructor(id, associationId, entityId, cardinality = '1,n', label = '') {
        this.id = id || generateId('conn');
        this.associationId = associationId;
        this.entityId = entityId;
        this.cardinality = cardinality;
        this.label = label;
    }

    toJSON() {
        return {
            id: this.id,
            associationId: this.associationId,
            entityId: this.entityId,
            cardinality: this.cardinality,
            label: this.label
        };
    }

    static fromJSON(json) {
        return new Connection(
            json.id,
            json.associationId,
            json.entityId,
            json.cardinality,
            json.label || ''
        );
    }
}

import test from 'node:test';
import assert from 'node:assert/strict';

import { EXAMPLE_DIAGRAM } from '../js/example.js';
import { DiagramState, validateDiagramData } from '../js/state.js';
import { Entity, Association, Connection } from '../js/models.js';
import {
    CreateEntityCommand,
    CreateAssociationCommand,
    DeleteSelectionCommand,
    UpdateAssociationCommand
} from '../js/commands.js';

function installBrowserStubs() {
    const values = new Map();
    globalThis.localStorage = {
        getItem: key => values.get(key) ?? null,
        setItem: (key, value) => values.set(key, value),
        removeItem: key => values.delete(key)
    };
    globalThis.window = {
        ERDiagramCommands: { CreateEntityCommand, CreateAssociationCommand, DeleteSelectionCommand }
    };
}

test('the bundled example is valid and round-trips through the state model', () => {
    installBrowserStubs();
    assert.doesNotThrow(() => validateDiagramData(structuredClone(EXAMPLE_DIAGRAM)));

    const state = new DiagramState();
    assert.equal(state.deserialize(EXAMPLE_DIAGRAM), true);
    assert.equal(state.entities.length, 4);
    assert.equal(state.associations.length, 3);
    assert.equal(state.connections.length, 6);
    assert.deepEqual(JSON.parse(state.serialize()), EXAMPLE_DIAGRAM);
});

test('node positions preserve valid zero coordinates', () => {
    const entity = new Entity('entity_zero', 'Origine', 0, 0);
    const association = new Association('assoc_zero', 'Relier', 0, 0);
    assert.equal(entity.x, 0);
    assert.equal(entity.y, 0);
    assert.equal(association.x, 0);
    assert.equal(association.y, 0);
});

test('invalid imports are rejected without replacing the current model', () => {
    installBrowserStubs();
    const state = new DiagramState();
    assert.equal(state.deserialize(EXAMPLE_DIAGRAM), true);
    const before = state.serialize();
    const invalid = structuredClone(EXAMPLE_DIAGRAM);
    invalid.connections[0].entityId = 'missing_entity';

    assert.equal(state.deserialize(invalid), false);
    assert.match(state.lastError, /entité inconnue/);
    assert.equal(state.serialize(), before);
});

test('association edits include cardinalities in undo and redo', () => {
    installBrowserStubs();
    const state = new DiagramState();
    assert.equal(state.deserialize(EXAMPLE_DIAGRAM), true);
    const association = state.getAssociation('assoc_passer');
    const oldAssociation = Association.fromJSON(association.toJSON());
    const oldConnections = state.getConnectionsForAssociation(association.id).map(item => Connection.fromJSON(item.toJSON()));
    const newAssociation = Association.fromJSON({ ...association.toJSON(), name: 'Commander' });
    const newConnections = oldConnections.map((item, index) => Connection.fromJSON({
        ...item.toJSON(), cardinality: index === 0 ? '1,n' : item.cardinality
    }));

    state.executeCommand(new UpdateAssociationCommand(
        state, association.id, oldAssociation, newAssociation, oldConnections, newConnections
    ));
    assert.equal(state.getAssociation(association.id).name, 'Commander');
    assert.equal(state.getConnection(oldConnections[0].id).cardinality, '1,n');

    assert.equal(state.undo(), true);
    assert.equal(state.getAssociation(association.id).name, 'Passer');
    assert.equal(state.getConnection(oldConnections[0].id).cardinality, '0,n');

    assert.equal(state.redo(), true);
    assert.equal(state.getAssociation(association.id).name, 'Commander');
    assert.equal(state.getConnection(oldConnections[0].id).cardinality, '1,n');
});

test('deleting a multi-selection is one reversible history action', () => {
    installBrowserStubs();
    const state = new DiagramState();
    assert.equal(state.deserialize(EXAMPLE_DIAGRAM), true);
    state.selectedItems = [
        { type: 'entity', id: 'entity_client' },
        { type: 'association', id: 'assoc_contenir' }
    ];

    assert.equal(state.deleteSelected(), true);
    assert.equal(state.commandHistory.length, 1);
    assert.equal(state.getEntity('entity_client'), undefined);
    assert.equal(state.getAssociation('assoc_contenir'), undefined);
    assert.equal(state.connections.length, 3);

    assert.equal(state.undo(), true);
    assert.equal(state.entities.length, 4);
    assert.equal(state.associations.length, 3);
    assert.equal(state.connections.length, 6);
});

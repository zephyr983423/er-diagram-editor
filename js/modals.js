// ===========================
// MODAL MANAGEMENT
// ===========================

import { CONFIG } from './config.js';
import { generateId } from './utils.js';
import { Entity, Association, Attribute, Connection } from './models.js';
import { UpdateEntityCommand, UpdateAssociationCommand, DeleteAssociationCommand } from './commands.js';

const escapeHTML = value => String(value ?? '').replace(/[&<>'"]/g, character => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;'
}[character]));

export class ModalManager {
    constructor(state, renderer) {
        this.state = state;
        this.renderer = renderer;
    }

    openEntityModal(entityId) {
        const entity = this.state.getEntity(entityId);
        if (!entity) return;

        const modal = document.getElementById('entity-modal');
        modal.classList.add('active');
        modal.setAttribute('aria-hidden', 'false');

        const originalEntity = Entity.fromJSON(entity.toJSON());

        this.renderEntityModalContent(entity);

        document.getElementById('entity-modal-cancel').onclick = () => {
            Object.assign(entity, originalEntity);
            modal.classList.remove('active');
            modal.setAttribute('aria-hidden', 'true');
            this.renderer.render();
        };

        document.getElementById('entity-modal-confirm').onclick = () => {
            if (!entity.name.trim()) {
                alert('Le nom de l\'entité ne peut pas être vide.');
                return;
            }

            const hasPK = entity.attributes.some(a => a.isPK);
            if (!hasPK) {
                if (!confirm('Aucune clé primaire définie. Continuer quand même?')) {
                    return;
                }
            }

            const names = entity.attributes.map(a => a.name.toLowerCase());
            if (entity.attributes.some(attribute => !attribute.name.trim())) {
                alert('Chaque attribut doit avoir un nom.');
                return;
            }
            const duplicates = names.filter((n, i) => names.indexOf(n) !== i);
            if (duplicates.length > 0) {
                alert('Noms d\'attributs en double : ' + duplicates.join(', '));
                return;
            }

            this.state.executeCommand(
                new UpdateEntityCommand(this.state, entity.id, originalEntity, Entity.fromJSON(entity.toJSON()))
            );

            modal.classList.remove('active');
            modal.setAttribute('aria-hidden', 'true');
            this.renderer.render();
            if (window.app) window.app.updatePropertiesPanel();
        };

        requestAnimationFrame(() => document.getElementById('entity-modal-name').focus());
    }

    renderEntityModalContent(entity) {
        const nameInput = document.getElementById('entity-modal-name');
        nameInput.value = entity.name;
        nameInput.oninput = () => { entity.name = nameInput.value; };

        const attrList = document.getElementById('entity-modal-attributes');
        attrList.innerHTML = '';

        entity.attributes.forEach((attr, index) => {
            const attrEl = this.createAttributeEditor(entity, attr, index);
            attrList.appendChild(attrEl);
        });

        document.getElementById('entity-add-attribute').onclick = () => {
            const newAttr = new Attribute(generateId('attr'), 'nouvel_attribut', 'VARCHAR');
            entity.attributes.push(newAttr);
            this.renderEntityModalContent(entity);
        };
    }

    createAttributeEditor(container, attr, index) {
        const div = document.createElement('div');
        div.className = 'attribute-editor';

        div.innerHTML = `
            <div class="attribute-editor-header">
                <span class="attribute-order">#${index + 1}</span>
                <input type="text" class="attr-name-input" value="${escapeHTML(attr.name)}" placeholder="Nom" aria-label="Nom de l’attribut ${index + 1}" />
                <button type="button" class="btn-icon btn-move-up" title="Monter" aria-label="Monter l’attribut" ${index === 0 ? 'disabled' : ''}>↑</button>
                <button type="button" class="btn-icon btn-move-down" title="Descendre" aria-label="Descendre l’attribut" ${index === container.attributes.length - 1 ? 'disabled' : ''}>↓</button>
                <button type="button" class="btn-icon btn-delete-attr" title="Supprimer" aria-label="Supprimer l’attribut">×</button>
            </div>
            <div class="attribute-editor-body">
                <div class="attr-row">
                    <label>Type:</label>
                    <select class="attr-type-select">
                        ${CONFIG.SQL_TYPES.map(t =>
                            `<option value="${t}" ${t === attr.type ? 'selected' : ''}>${t}</option>`
                        ).join('')}
                    </select>
                </div>
                <div class="attr-row attr-checkboxes">
                    <label><input type="checkbox" class="attr-pk" ${attr.isPK ? 'checked' : ''}> PK</label>
                    <label><input type="checkbox" class="attr-uq" ${attr.isUQ ? 'checked' : ''}> UQ</label>
                    <label><input type="checkbox" class="attr-null" ${attr.isNull ? 'checked' : ''}> NULL</label>
                </div>
                <div class="attr-row">
                    <label>DEFAULT:</label>
                    <input type="text" class="attr-default" value="${escapeHTML(attr.defaultValue || '')}" placeholder="Valeur par défaut" />
                </div>
                <div class="attr-enum-section" style="display: ${attr.type === 'ENUM' || attr.type === 'SET' ? 'block' : 'none'};">
                    <label>Valeurs (ENUM/SET):</label>
                    <div class="attr-enum-tags"></div>
                    <input type="text" class="attr-enum-input" placeholder="Ajouter une valeur (Entrée)" />
                </div>
            </div>
        `;

        // Event handlers
        const nameInput = div.querySelector('.attr-name-input');
        nameInput.oninput = () => { attr.name = nameInput.value; };

        const typeSelect = div.querySelector('.attr-type-select');
        typeSelect.onchange = () => {
            attr.type = typeSelect.value;
            div.querySelector('.attr-enum-section').style.display =
                (attr.type === 'ENUM' || attr.type === 'SET') ? 'block' : 'none';
        };

        const pkCheck = div.querySelector('.attr-pk');
        pkCheck.onchange = () => { attr.isPK = pkCheck.checked; };

        const uqCheck = div.querySelector('.attr-uq');
        uqCheck.onchange = () => { attr.isUQ = uqCheck.checked; };

        const nullCheck = div.querySelector('.attr-null');
        nullCheck.onchange = () => { attr.isNull = nullCheck.checked; };

        const defaultInput = div.querySelector('.attr-default');
        defaultInput.oninput = () => { attr.defaultValue = defaultInput.value; };

        // ENUM/SET values
        const enumTags = div.querySelector('.attr-enum-tags');
        const enumInput = div.querySelector('.attr-enum-input');

        const renderEnumTags = () => {
            enumTags.innerHTML = attr.enumValues.map((val, i) =>
                `<span class="enum-tag">${escapeHTML(val)} <button type="button" class="enum-tag-remove" aria-label="Supprimer ${escapeHTML(val)}" data-index="${i}">×</button></span>`
            ).join('');

            enumTags.querySelectorAll('.enum-tag-remove').forEach(btn => {
                btn.onclick = () => {
                    attr.enumValues.splice(parseInt(btn.dataset.index), 1);
                    renderEnumTags();
                };
            });
        };

        renderEnumTags();

        enumInput.onkeydown = (e) => {
            if (e.key === 'Enter' && enumInput.value.trim()) {
                attr.enumValues.push(enumInput.value.trim());
                enumInput.value = '';
                renderEnumTags();
                e.preventDefault();
            }
        };

        // Move buttons
        div.querySelector('.btn-move-up').onclick = () => {
            if (index > 0) {
                [container.attributes[index], container.attributes[index - 1]] =
                [container.attributes[index - 1], container.attributes[index]];
                if (container.type === 'entity') {
                    this.renderEntityModalContent(container);
                } else {
                    this.renderAssociationModalContent(container);
                }
            }
        };

        div.querySelector('.btn-move-down').onclick = () => {
            if (index < container.attributes.length - 1) {
                [container.attributes[index], container.attributes[index + 1]] =
                [container.attributes[index + 1], container.attributes[index]];
                if (container.type === 'entity') {
                    this.renderEntityModalContent(container);
                } else {
                    this.renderAssociationModalContent(container);
                }
            }
        };

        // Delete button
        div.querySelector('.btn-delete-attr').onclick = () => {
            if (confirm('Supprimer cet attribut?')) {
                container.attributes.splice(index, 1);
                if (container.type === 'entity') {
                    this.renderEntityModalContent(container);
                } else {
                    this.renderAssociationModalContent(container);
                }
            }
        };

        return div;
    }

    openAssociationModal(assocId) {
        const assoc = this.state.getAssociation(assocId);
        if (!assoc) return;

        const modal = document.getElementById('association-modal');
        modal.classList.add('active');
        modal.setAttribute('aria-hidden', 'false');

        const originalAssoc = Association.fromJSON(assoc.toJSON());
        const originalConnections = this.state.getConnectionsForAssociation(assocId).map(c => Connection.fromJSON(c.toJSON()));

        this.renderAssociationModalContent(assoc);

        document.getElementById('assoc-modal-cancel').onclick = () => {
            Object.assign(assoc, originalAssoc);
            this.state.connections = this.state.connections.filter(c => c.associationId !== assocId);
            originalConnections.forEach(c => this.state.connections.push(c));
            modal.classList.remove('active');
            modal.setAttribute('aria-hidden', 'true');
            this.renderer.render();
        };

        document.getElementById('assoc-modal-confirm').onclick = () => {
            if (!assoc.name.trim()) {
                alert('Le nom de l\'association ne peut pas être vide.');
                return;
            }

            if (assoc.attributes.some(attribute => !attribute.name.trim())) {
                alert('Chaque attribut doit avoir un nom.');
                return;
            }
            const newConnections = this.state.getConnectionsForAssociation(assocId).map(c => Connection.fromJSON(c.toJSON()));
            this.state.executeCommand(new UpdateAssociationCommand(
                this.state,
                assoc.id,
                originalAssoc,
                Association.fromJSON(assoc.toJSON()),
                originalConnections,
                newConnections
            ));

            modal.classList.remove('active');
            modal.setAttribute('aria-hidden', 'true');
            this.renderer.render();
            if (window.app) window.app.updatePropertiesPanel();
        };

        document.getElementById('assoc-modal-delete').onclick = () => {
            if (confirm('Supprimer cette association et toutes ses connexions?')) {
                this.state.executeCommand(new DeleteAssociationCommand(this.state, assoc));
                modal.classList.remove('active');
                modal.setAttribute('aria-hidden', 'true');
                this.renderer.render();
                if (window.app) window.app.updatePropertiesPanel();
            }
        };

        requestAnimationFrame(() => document.getElementById('assoc-modal-name').focus());
    }

    renderAssociationModalContent(assoc) {
        const nameInput = document.getElementById('assoc-modal-name');
        nameInput.value = assoc.name;
        nameInput.oninput = () => { assoc.name = nameInput.value; };

        // Render connections
        const connList = document.getElementById('assoc-modal-connections');
        const connections = this.state.getConnectionsForAssociation(assoc.id);

        connList.innerHTML = connections.map(conn => {
            const entity = this.state.getEntity(conn.entityId);
            return `
                <div class="connection-item">
                    <strong>${escapeHTML(entity?.name || 'Entité inconnue')}</strong>
                    <select class="conn-card-select" aria-label="Cardinalité avec ${escapeHTML(entity?.name || 'entité inconnue')}" data-conn-id="${escapeHTML(conn.id)}">
                        ${CONFIG.CARDINALITY_OPTIONS.map(c =>
                            `<option value="${c.value}" ${c.value === conn.cardinality ? 'selected' : ''}>${c.label}</option>`
                        ).join('')}
                    </select>
                    <input type="text" class="conn-label-input" aria-label="Rôle de la connexion" data-conn-id="${escapeHTML(conn.id)}" value="${escapeHTML(conn.label || '')}" placeholder="Rôle métier" />
                    <button type="button" class="btn-icon btn-delete-conn" aria-label="Supprimer la connexion" data-conn-id="${escapeHTML(conn.id)}">×</button>
                </div>
            `;
        }).join('');

        if (connections.length === 0) {
            connList.innerHTML = '<p class="no-connections">Aucune connexion. Utilisez l\'outil Connexion pour relier cette association à des entités.</p>';
        }

        // Event handlers for connections
        connList.querySelectorAll('.conn-card-select').forEach(select => {
            select.onchange = () => {
                const conn = this.state.getConnection(select.dataset.connId);
                if (conn) conn.cardinality = select.value;
            };
        });

        connList.querySelectorAll('.conn-label-input').forEach(input => {
            input.oninput = () => {
                const conn = this.state.getConnection(input.dataset.connId);
                if (conn) conn.label = input.value;
            };
        });

        connList.querySelectorAll('.btn-delete-conn').forEach(btn => {
            btn.onclick = () => {
                if (confirm('Supprimer cette connexion?')) {
                    const conn = this.state.getConnection(btn.dataset.connId);
                    if (conn) {
                        this.state.connections = this.state.connections.filter(c => c.id !== conn.id);
                        this.renderAssociationModalContent(assoc);
                    }
                }
            };
        });

        // Render attributes
        const attrList = document.getElementById('assoc-modal-attributes');
        attrList.innerHTML = '';

        assoc.attributes.forEach((attr, index) => {
            const attrEl = this.createAttributeEditor(assoc, attr, index);
            attrList.appendChild(attrEl);
        });

        if (assoc.attributes.length === 0) {
            attrList.innerHTML = '<p class="no-attributes">Aucun attribut.</p>';
        }

        document.getElementById('assoc-add-attribute').onclick = () => {
            const newAttr = new Attribute(generateId('attr'), 'nouvel_attribut', 'VARCHAR');
            assoc.attributes.push(newAttr);
            this.renderAssociationModalContent(assoc);
        };
    }
}

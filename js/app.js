import { CONFIG } from './config.js';
import { generateId } from './utils.js';
import { Entity, Association, Connection } from './models.js';
import {
    CreateEntityCommand,
    CreateAssociationCommand,
    CreateConnectionCommand,
    DeleteEntityCommand,
    DeleteAssociationCommand,
    DeleteConnectionCommand,
    DeleteSelectionCommand
} from './commands.js';
import { DiagramState } from './state.js';
import { CanvasRenderer } from './renderer.js';
import { ModalManager } from './modals.js';
import { EXAMPLE_DIAGRAM } from './example.js';

window.ERDiagramCommands = {
    CreateEntityCommand,
    CreateAssociationCommand,
    CreateConnectionCommand,
    DeleteEntityCommand,
    DeleteAssociationCommand,
    DeleteConnectionCommand,
    DeleteSelectionCommand
};

const TOOL_HINTS = {
    select: 'Sélectionnez puis déplacez un élément, ou double-cliquez pour l’éditer.',
    entity: 'Cliquez sur le canevas pour placer une nouvelle entité.',
    association: 'Cliquez sur le canevas pour placer une nouvelle association.',
    connection: 'Cliquez d’abord sur une association, puis sur l’entité à relier.'
};

export class ERDiagramApp {
    constructor() {
        this.state = new DiagramState();
        this.currentTool = 'select';
        this.tempConnection = null;
        this.toastTimer = null;

        this.renderer = new CanvasRenderer('canvas-container', this.state);
        this.stage = this.renderer.stage;
        this.modalManager = new ModalManager(this.state, this.renderer);
        window.app = this;

        this.state.subscribe(reason => this.updateUI(reason));
        this.setupEventHandlers();
        this.setupKeyboardShortcuts();
        this.loadDiagram();
        this.updateUI('ready');

        requestAnimationFrame(() => this.renderer.fitToContent());
    }

    setupEventHandlers() {
        document.querySelectorAll('.tool-btn').forEach(button => {
            button.addEventListener('click', () => this.setTool(button.dataset.tool));
        });

        document.getElementById('btn-undo').addEventListener('click', () => this.undo());
        document.getElementById('btn-redo').addEventListener('click', () => this.redo());
        document.getElementById('btn-delete').addEventListener('click', () => this.deleteSelected());
        document.getElementById('btn-grid').addEventListener('click', () => this.toggleGrid());
        document.getElementById('btn-snap').addEventListener('click', () => this.toggleSnap());
        document.getElementById('btn-export').addEventListener('click', () => this.openExportModal());
        document.getElementById('btn-import').addEventListener('click', () => this.openImportModal());
        document.getElementById('btn-export-png').addEventListener('click', () => this.downloadPNG());
        document.getElementById('btn-example').addEventListener('click', () => this.loadExample());
        document.getElementById('btn-clear').addEventListener('click', () => this.clearDiagram());
        document.getElementById('btn-help').addEventListener('click', () => this.openModal('help-modal'));
        document.getElementById('btn-zoom-in').addEventListener('click', () => this.renderer.zoomIn());
        document.getElementById('btn-zoom-out').addEventListener('click', () => this.renderer.zoomOut());
        document.getElementById('zoom-level').addEventListener('click', () => this.renderer.resetZoom());
        document.getElementById('btn-fit').addEventListener('click', () => this.renderer.fitToContent());

        this.stage.on('click', event => this.handleStageClick(event));
        this.stage.on('contextmenu', event => this.handleContextMenu(event));

        document.getElementById('entity-modal-close').addEventListener('click', () => document.getElementById('entity-modal-cancel').click());
        document.getElementById('assoc-modal-close').addEventListener('click', () => document.getElementById('assoc-modal-cancel').click());
        document.getElementById('export-modal-close').addEventListener('click', () => this.closeModal('export-modal'));
        document.getElementById('import-modal-close').addEventListener('click', () => this.closeModal('import-modal'));
        document.getElementById('import-modal-cancel').addEventListener('click', () => this.closeModal('import-modal'));
        document.getElementById('help-modal-close').addEventListener('click', () => this.closeModal('help-modal'));
        document.getElementById('help-modal-confirm').addEventListener('click', () => this.closeModal('help-modal'));
        document.getElementById('export-download').addEventListener('click', () => this.downloadJSON());
        document.getElementById('export-copy').addEventListener('click', () => this.copyToClipboard());
        document.getElementById('import-file').addEventListener('change', event => this.handleFileImport(event));
        document.getElementById('import-confirm').addEventListener('click', () => this.importFromText());

        document.querySelectorAll('.modal-overlay').forEach(overlay => {
            overlay.addEventListener('mousedown', event => {
                if (event.target === overlay) this.closeActiveModal();
            });
        });

        document.getElementById('ctx-edit').addEventListener('click', () => this.runContextAction(() => this.editSelected()));
        document.getElementById('ctx-delete').addEventListener('click', () => this.runContextAction(() => this.deleteSelected()));
        document.getElementById('ctx-copy').addEventListener('click', () => this.runContextAction(() => this.copySelected()));
        document.getElementById('ctx-paste').addEventListener('click', () => this.runContextAction(() => this.pasteSelected()));
        document.addEventListener('click', event => {
            const menu = document.getElementById('context-menu');
            if (!menu.contains(event.target)) this.hideContextMenu();
        });
    }

    setupKeyboardShortcuts() {
        document.addEventListener('keydown', event => {
            const isFormField = ['INPUT', 'TEXTAREA', 'SELECT'].includes(event.target?.tagName);
            if (isFormField) return;

            const modifier = event.ctrlKey || event.metaKey;
            const key = event.key.toLowerCase();

            if (modifier && key === 'z' && !event.shiftKey) {
                event.preventDefault();
                this.undo();
            } else if (modifier && (key === 'y' || (key === 'z' && event.shiftKey))) {
                event.preventDefault();
                this.redo();
            } else if (modifier && key === 'c') {
                event.preventDefault();
                this.copySelected();
            } else if (modifier && key === 'v') {
                event.preventDefault();
                this.pasteSelected();
            } else if (modifier && key === 'a') {
                event.preventDefault();
                this.selectAll();
            } else if (event.key === 'Delete' || event.key === 'Backspace') {
                event.preventDefault();
                this.deleteSelected();
            } else if (event.key === 'Enter') {
                this.editSelected();
            } else if (event.key === 'Escape') {
                if (document.querySelector('.modal-overlay.active')) this.closeActiveModal();
                else {
                    this.setTool('select');
                    this.state.clearSelection();
                    this.renderer.updateSelection();
                }
            } else if (['v', 'e', 'a', 'c'].includes(key) && !modifier) {
                const tool = { v: 'select', e: 'entity', a: 'association', c: 'connection' }[key];
                this.setTool(tool);
            } else if (key === '0' && !modifier) {
                this.renderer.fitToContent();
            }
        });
    }

    setTool(tool) {
        if (!TOOL_HINTS[tool]) return;
        this.currentTool = tool;
        this.tempConnection = null;
        document.querySelectorAll('.tool-btn').forEach(button => {
            const active = button.dataset.tool === tool;
            button.classList.toggle('active', active);
            button.setAttribute('aria-pressed', String(active));
        });
        this.stage.container().style.cursor = tool === 'select' ? 'default' : 'crosshair';
        document.getElementById('tool-hint').textContent = TOOL_HINTS[tool];
    }

    handleStageClick(event) {
        if (this.renderer.isPanning) return;
        const target = event.target;
        const isBackgroundClick = target === this.stage || target.getType() === 'Stage' || target.getParent()?.getType() === 'Layer';

        if (this.currentTool === 'connection') {
            this.handleConnectionTool(event);
            return;
        }
        if (!isBackgroundClick) return;

        if (this.currentTool === 'select') {
            this.state.clearSelection();
            this.renderer.updateSelection();
            return;
        }

        const position = this.renderer.snapPosition(this.getRelativePointerPosition());
        if (this.currentTool === 'entity') {
            const entity = new Entity(generateId('entity'), 'Nouvelle entité', position.x, position.y);
            this.state.executeCommand(new CreateEntityCommand(this.state, entity));
            this.state.select({ type: 'entity', id: entity.id });
            this.renderer.render();
            this.setTool('select');
            this.modalManager.openEntityModal(entity.id);
        } else if (this.currentTool === 'association') {
            const association = new Association(generateId('assoc'), 'Nouvelle association', position.x, position.y);
            this.state.executeCommand(new CreateAssociationCommand(this.state, association));
            this.state.select({ type: 'association', id: association.id });
            this.renderer.render();
            this.setTool('select');
            this.modalManager.openAssociationModal(association.id);
        }
    }

    getRelativePointerPosition() {
        const pointer = this.stage.getPointerPosition();
        return this.stage.getAbsoluteTransform().copy().invert().point(pointer);
    }

    handleConnectionTool(event) {
        let group = event.target;
        while (group && group.getType() !== 'Group') group = group.getParent();
        if (!group?.attrs.itemType) return;

        const itemId = group.attrs.itemId;
        const itemType = group.attrs.itemType;
        if (!this.tempConnection) {
            if (itemType !== 'association') {
                this.showToast('Commencez par sélectionner une association.');
                return;
            }
            this.tempConnection = { associationId: itemId };
            this.state.select({ type: 'association', id: itemId });
            this.renderer.updateSelection();
            document.getElementById('tool-hint').textContent = 'Association choisie — cliquez maintenant sur une entité.';
            return;
        }

        if (itemType !== 'entity') {
            this.showToast('Choisissez une entité pour terminer la connexion.');
            return;
        }

        const duplicateCount = this.state.connections.filter(connection =>
            connection.associationId === this.tempConnection.associationId && connection.entityId === itemId
        ).length;
        if (duplicateCount >= 2) {
            this.showToast('Deux rôles relient déjà cette association à l’entité.');
            return;
        }

        const connection = new Connection(generateId('conn'), this.tempConnection.associationId, itemId, '1,n', '');
        this.state.executeCommand(new CreateConnectionCommand(this.state, connection));
        this.state.select({ type: 'connection', id: connection.id });
        this.tempConnection = null;
        this.renderer.render();
        this.setTool('select');
        this.showToast('Connexion ajoutée. Ouvrez l’association pour préciser la cardinalité.');
    }

    handleContextMenu(event) {
        event.evt.preventDefault();
        let group = event.target;
        while (group && group.getType() !== 'Group') group = group.getParent();
        if (!group?.attrs.itemType) {
            this.hideContextMenu();
            return;
        }
        this.showContextMenu(event.evt.clientX, event.evt.clientY, group.attrs.itemId, group.attrs.itemType);
    }

    showContextMenu(x, y, itemId, itemType) {
        if (!this.state.selectedItems.some(item => item.id === itemId)) {
            this.state.select({ type: itemType, id: itemId });
            this.renderer.updateSelection();
        }
        const menu = document.getElementById('context-menu');
        menu.style.display = 'block';
        menu.setAttribute('aria-hidden', 'false');
        const width = 190;
        const height = 150;
        menu.style.left = `${Math.min(x, window.innerWidth - width - 8)}px`;
        menu.style.top = `${Math.min(y, window.innerHeight - height - 8)}px`;
    }

    hideContextMenu() {
        const menu = document.getElementById('context-menu');
        menu.style.display = 'none';
        menu.setAttribute('aria-hidden', 'true');
    }

    runContextAction(action) {
        this.hideContextMenu();
        action();
    }

    undo() {
        if (this.state.undo()) {
            this.renderer.render();
            this.showToast('Dernière action annulée.');
        }
    }

    redo() {
        if (this.state.redo()) {
            this.renderer.render();
            this.showToast('Action rétablie.');
        }
    }

    deleteSelected() {
        if (!this.state.selectedItems.length) return;
        if (confirm('Supprimer la sélection et ses connexions ?') && this.state.deleteSelected()) {
            this.renderer.render();
            this.showToast('Sélection supprimée.');
        }
    }

    copySelected() {
        if (this.state.copy()) this.showToast('Sélection copiée.');
    }

    pasteSelected() {
        if (this.state.paste()) {
            this.renderer.render();
            this.showToast('Copie ajoutée au modèle.');
        }
    }

    selectAll() {
        this.state.selectedItems = [
            ...this.state.entities.map(entity => ({ type: 'entity', id: entity.id })),
            ...this.state.associations.map(association => ({ type: 'association', id: association.id }))
        ];
        this.state.notify('selection');
        this.renderer.updateSelection();
    }

    editSelected() {
        if (this.state.selectedItems.length !== 1) return;
        const item = this.state.selectedItems[0];
        if (item.type === 'entity') this.modalManager.openEntityModal(item.id);
        else if (item.type === 'association') this.modalManager.openAssociationModal(item.id);
    }

    updateUI(reason = 'change') {
        document.getElementById('entity-count').textContent = this.state.entities.length;
        document.getElementById('association-count').textContent = this.state.associations.length;
        document.getElementById('connection-count').textContent = this.state.connections.length;
        document.getElementById('btn-undo').disabled = this.state.historyIndex < 0;
        document.getElementById('btn-redo').disabled = this.state.historyIndex >= this.state.commandHistory.length - 1;
        document.getElementById('btn-delete').disabled = this.state.selectedItems.length === 0;

        const status = document.getElementById('save-status');
        if (reason === 'save-error') status.textContent = 'Sauvegarde indisponible';
        else if (reason === 'save') status.textContent = `Enregistré à ${new Intl.DateTimeFormat('fr-FR', { hour: '2-digit', minute: '2-digit' }).format(new Date())}`;
    }

    updatePropertiesPanel() {
        this.updateUI('change');
    }

    openModal(id) {
        const modal = document.getElementById(id);
        modal.classList.add('active');
        modal.setAttribute('aria-hidden', 'false');
        requestAnimationFrame(() => modal.querySelector('button, input, textarea, select')?.focus());
    }

    closeModal(id) {
        const modal = document.getElementById(id);
        modal.classList.remove('active');
        modal.setAttribute('aria-hidden', 'true');
    }

    closeActiveModal() {
        const active = document.querySelector('.modal-overlay.active');
        if (!active) return;
        if (active.id === 'entity-modal') document.getElementById('entity-modal-cancel').click();
        else if (active.id === 'association-modal') document.getElementById('assoc-modal-cancel').click();
        else this.closeModal(active.id);
    }

    openExportModal() {
        document.getElementById('export-data').value = this.state.serialize(true);
        this.openModal('export-modal');
    }

    openImportModal() {
        document.getElementById('import-data').value = '';
        document.getElementById('import-file').value = '';
        document.getElementById('import-error').textContent = '';
        this.openModal('import-modal');
    }

    downloadJSON() {
        this.downloadBlob(new Blob([this.state.serialize(true)], { type: 'application/json' }), 'atelier-merise.json');
        this.showToast('Export JSON téléchargé.');
    }

    downloadPNG() {
        const link = document.createElement('a');
        link.href = this.renderer.exportPNG(2);
        link.download = 'atelier-merise.png';
        link.click();
        this.showToast('Image PNG exportée.');
    }

    downloadBlob(blob, filename) {
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = filename;
        link.click();
        window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    }

    async copyToClipboard() {
        const value = document.getElementById('export-data').value;
        try {
            await navigator.clipboard.writeText(value);
        } catch {
            const textarea = document.getElementById('export-data');
            textarea.select();
            document.execCommand('copy');
        }
        this.showToast('JSON copié dans le presse-papiers.');
    }

    handleFileImport(event) {
        const file = event.target.files[0];
        const error = document.getElementById('import-error');
        error.textContent = '';
        if (!file) return;
        if (file.size > 2 * 1024 * 1024) {
            error.textContent = 'Le fichier dépasse la limite de 2 Mo.';
            return;
        }
        const reader = new FileReader();
        reader.onload = loadEvent => { document.getElementById('import-data').value = String(loadEvent.target.result || ''); };
        reader.onerror = () => { error.textContent = 'Impossible de lire ce fichier.'; };
        reader.readAsText(file);
    }

    importFromText() {
        const data = document.getElementById('import-data').value.trim();
        const error = document.getElementById('import-error');
        error.textContent = '';
        if (!data) {
            error.textContent = 'Ajoutez un fichier ou collez un document JSON.';
            return;
        }
        if (!this.state.deserialize(data)) {
            error.textContent = this.state.lastError || 'Le format JSON est invalide.';
            return;
        }
        this.closeModal('import-modal');
        this.renderer.render();
        this.renderer.fitToContent();
        this.showToast('Diagramme importé et sauvegardé localement.');
    }

    loadExample() {
        const hasContent = this.state.entities.length || this.state.associations.length;
        if (hasContent && !confirm('Remplacer le diagramme actuel par le modèle d’exemple ?')) return;
        this.state.deserialize(EXAMPLE_DIAGRAM);
        this.renderer.render();
        this.renderer.fitToContent();
        this.showToast('Modèle e-commerce chargé.');
    }

    clearDiagram() {
        const hasContent = this.state.entities.length || this.state.associations.length;
        if (hasContent && !confirm('Créer un nouveau diagramme vide ? Le modèle actuel sera remplacé.')) return;
        this.state.clear();
        this.renderer.render();
        this.renderer.fitToContent();
        this.showToast('Nouveau diagramme prêt.');
    }

    toggleGrid() {
        this.renderer.toggleGrid();
        const button = document.getElementById('btn-grid');
        button.classList.toggle('active', this.renderer.showGrid);
        button.setAttribute('aria-pressed', String(this.renderer.showGrid));
    }

    toggleSnap() {
        this.renderer.toggleSnap();
        const button = document.getElementById('btn-snap');
        button.classList.toggle('active', this.renderer.snapToGrid);
        button.setAttribute('aria-pressed', String(this.renderer.snapToGrid));
    }

    loadDiagram() {
        const forceExample = new URLSearchParams(window.location.search).get('demo') === '1';
        if (forceExample || !this.state.loadFromLocalStorage()) this.state.deserialize(EXAMPLE_DIAGRAM);
        this.renderer.render();
    }

    showToast(message) {
        const toast = document.getElementById('toast');
        toast.textContent = message;
        toast.classList.add('visible');
        window.clearTimeout(this.toastTimer);
        this.toastTimer = window.setTimeout(() => toast.classList.remove('visible'), 2600);
    }
}

document.addEventListener('DOMContentLoaded', () => new ERDiagramApp());

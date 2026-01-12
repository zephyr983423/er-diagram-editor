// ===========================
// MAIN APPLICATION CONTROLLER
// ===========================

import { CONFIG } from './config.js';
import { generateId } from './utils.js';
import { Entity, Association, Connection } from './models.js';
import {
    CreateEntityCommand,
    CreateAssociationCommand,
    CreateConnectionCommand,
    MoveNodeCommand,
    DeleteEntityCommand,
    DeleteAssociationCommand,
    DeleteConnectionCommand
} from './commands.js';
import { DiagramState } from './state.js';
import { CanvasRenderer } from './renderer.js';
import { ModalManager } from './modals.js';

// Make commands globally available for state.js
window.ERDiagramCommands = {
    CreateEntityCommand,
    CreateAssociationCommand,
    CreateConnectionCommand,
    DeleteEntityCommand,
    DeleteAssociationCommand,
    DeleteConnectionCommand
};

export class ERDiagramApp {
    constructor() {
        console.log('🚀 Initialisation de l\'application...');

        this.state = new DiagramState();
        console.log('✓ DiagramState créé');

        this.currentTool = 'select';
        this.tempConnection = null;
        this.dragStartPos = null;
        this.lastClickTime = 0;

        this.renderer = new CanvasRenderer('canvas-container', this.state);
        console.log('✓ CanvasRenderer créé');

        this.stage = this.renderer.stage;
        this.modalManager = new ModalManager(this.state, this.renderer);
        console.log('✓ ModalManager créé');

        this.setupEventHandlers();
        console.log('✓ Event handlers configurés');

        this.setupKeyboardShortcuts();
        console.log('✓ Raccourcis clavier configurés');

        this.loadDiagram();
        console.log('✓ Diagramme chargé');

        // Make app globally available
        window.app = this;

        console.log('✅ Application prête ! Grille visible, outils disponibles.');
        console.log('→ Cliquez sur "Entité" puis sur le canvas pour créer une entité');
    }

    setupEventHandlers() {
        // Toolbar buttons
        document.getElementById('tool-select').onclick = () => this.setTool('select');
        document.getElementById('tool-entity').onclick = () => this.setTool('entity');
        document.getElementById('tool-association').onclick = () => this.setTool('association');
        document.getElementById('tool-connection').onclick = () => this.setTool('connection');

        document.getElementById('btn-undo').onclick = () => this.undo();
        document.getElementById('btn-redo').onclick = () => this.redo();
        document.getElementById('btn-delete').onclick = () => this.deleteSelected();
        document.getElementById('btn-grid').onclick = () => this.toggleGrid();
        document.getElementById('btn-snap').onclick = () => this.toggleSnap();
        document.getElementById('btn-export').onclick = () => this.openExportModal();
        document.getElementById('btn-import').onclick = () => this.openImportModal();
        document.getElementById('btn-clear').onclick = () => this.clearDiagram();
        document.getElementById('btn-help').onclick = () => this.openHelpModal();

        // Canvas interactions
        this.stage.on('click', (e) => this.handleStageClick(e));
        this.stage.on('contextmenu', (e) => this.handleContextMenu(e));

        // Modal handlers
        this.setupModalHandlers();
    }

    setupModalHandlers() {
        // Entity modal
        document.getElementById('entity-modal-close').onclick = () => {
            document.getElementById('entity-modal').classList.remove('active');
        };

        // Association modal
        document.getElementById('assoc-modal-close').onclick = () => {
            document.getElementById('association-modal').classList.remove('active');
        };

        // Export modal
        document.getElementById('export-modal-close').onclick = () => {
            document.getElementById('export-modal').classList.remove('active');
        };
        document.getElementById('export-download').onclick = () => this.downloadJSON();
        document.getElementById('export-copy').onclick = () => this.copyToClipboard();

        // Import modal
        document.getElementById('import-modal-close').onclick = () => {
            document.getElementById('import-modal').classList.remove('active');
        };
        document.getElementById('import-modal-cancel').onclick = () => {
            document.getElementById('import-modal').classList.remove('active');
        };
        document.getElementById('import-file').onchange = (e) => this.handleFileImport(e);
        document.getElementById('import-confirm').onclick = () => this.importFromText();

        // Help modal
        document.getElementById('help-modal-close').onclick = () => {
            document.getElementById('help-modal').classList.remove('active');
        };
        document.getElementById('help-modal-confirm').onclick = () => {
            document.getElementById('help-modal').classList.remove('active');
        };

        // GLOBAL: All buttons with class "modal-close" close their parent modal
        document.querySelectorAll('.modal-close').forEach(btn => {
            btn.onclick = () => {
                // Find parent modal overlay
                let modal = btn.closest('.modal-overlay');
                if (modal) {
                    modal.classList.remove('active');
                }
            };
        });

        // Close modals on overlay click
        document.querySelectorAll('.modal-overlay').forEach(overlay => {
            overlay.onclick = (e) => {
                if (e.target === overlay) {
                    overlay.classList.remove('active');
                }
            };
        });

        // Context menu
        document.getElementById('ctx-edit').onclick = (e) => {
            e.stopPropagation();
            this.editSelected();
            document.getElementById('context-menu').style.display = 'none';
        };
        document.getElementById('ctx-delete').onclick = (e) => {
            e.stopPropagation();
            this.deleteSelected();
            document.getElementById('context-menu').style.display = 'none';
        };
        document.getElementById('ctx-copy').onclick = (e) => {
            e.stopPropagation();
            this.copySelected();
            document.getElementById('context-menu').style.display = 'none';
        };
        document.getElementById('ctx-paste').onclick = (e) => {
            e.stopPropagation();
            this.pasteSelected();
            document.getElementById('context-menu').style.display = 'none';
        };

        // Close menu when clicking outside
        document.addEventListener('click', (e) => {
            const menu = document.getElementById('context-menu');
            if (menu && !menu.contains(e.target)) {
                menu.style.display = 'none';
            }
        });
    }

    setupKeyboardShortcuts() {
        document.addEventListener('keydown', (e) => {
            // Ignore if typing in input/textarea
            if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') {
                return;
            }

            // Undo/Redo
            if ((e.ctrlKey || e.metaKey) && e.key === 'z' && !e.shiftKey) {
                e.preventDefault();
                this.undo();
            } else if ((e.ctrlKey || e.metaKey) && (e.key === 'y' || (e.key === 'z' && e.shiftKey))) {
                e.preventDefault();
                this.redo();
            }

            // Copy/Paste
            else if ((e.ctrlKey || e.metaKey) && e.key === 'c') {
                e.preventDefault();
                this.copySelected();
            } else if ((e.ctrlKey || e.metaKey) && e.key === 'v') {
                e.preventDefault();
                this.pasteSelected();
            }

            // Delete
            else if (e.key === 'Delete' || e.key === 'Backspace') {
                e.preventDefault();
                this.deleteSelected();
            }

            // Select All
            else if ((e.ctrlKey || e.metaKey) && e.key === 'a') {
                e.preventDefault();
                this.selectAll();
            }

            // Escape to cancel tool
            else if (e.key === 'Escape') {
                this.setTool('select');
                this.tempConnection = null;
                this.renderer.render();
            }
        });
    }

    setTool(tool) {
        this.currentTool = tool;
        this.tempConnection = null;

        document.querySelectorAll('.tool-btn').forEach(btn => btn.classList.remove('active'));
        document.getElementById('tool-' + tool)?.classList.add('active');

        this.stage.container().style.cursor = tool === 'select' ? 'default' : 'crosshair';
        this.updatePropertiesPanel();
    }

    handleStageClick(e) {
        const target = e.target;

        // Check if clicking on stage background (not on a shape)
        const isBackgroundClick = target === this.stage ||
                                  target.getType() === 'Stage' ||
                                  target.getParent()?.getType() === 'Layer';

        if (isBackgroundClick && this.currentTool !== 'connection') {
            if (this.currentTool === 'select') {
                this.state.clearSelection();
                this.renderer.render();
                this.updatePropertiesPanel();
            } else if (this.currentTool === 'entity') {
                const pos = this.getRelativePointerPosition();
                const snappedPos = this.snapToGrid(pos);
                const entity = new Entity(
                    generateId('entity'),
                    'Nouvelle Entité',
                    snappedPos.x,
                    snappedPos.y
                );
                this.state.executeCommand(new CreateEntityCommand(this.state, entity));
                this.renderer.render();
                this.setTool('select');
                console.log('Entité créée:', entity);
            } else if (this.currentTool === 'association') {
                const pos = this.getRelativePointerPosition();
                const snappedPos = this.snapToGrid(pos);
                const association = new Association(
                    generateId('assoc'),
                    'Association',
                    snappedPos.x,
                    snappedPos.y
                );
                this.state.executeCommand(new CreateAssociationCommand(this.state, association));
                this.renderer.render();
                this.setTool('select');
                console.log('Association créée:', association);
            }
        }

        // Handle connection tool (clicks on entities/associations)
        if (this.currentTool === 'connection') {
            this.handleConnectionTool(e);
        }
    }

    getRelativePointerPosition() {
        const pos = this.stage.getPointerPosition();
        const transform = this.stage.getAbsoluteTransform().copy().invert();
        return transform.point(pos);
    }

    handleConnectionTool(e) {
        const target = e.target;

        // Check if we clicked on a group (entity or association)
        let clickedGroup = target;
        while (clickedGroup && clickedGroup.getType() !== 'Group') {
            clickedGroup = clickedGroup.getParent();
        }

        if (!clickedGroup || !clickedGroup.attrs.itemType) {
            return;
        }

        const itemId = clickedGroup.attrs.itemId;
        const itemType = clickedGroup.attrs.itemType;

        if (!this.tempConnection) {
            // First click - must be on association
            if (itemType === 'association') {
                this.tempConnection = {
                    associationId: itemId,
                    association: this.state.getAssociation(itemId)
                };
                // Visual feedback
                console.log('Association sélectionnée, cliquez sur une entité');
            }
        } else {
            // Second click - must be on entity
            if (itemType === 'entity') {
                const connection = new Connection(
                    generateId('conn'),
                    this.tempConnection.associationId,
                    itemId,
                    '1,n',
                    ''
                );
                this.state.executeCommand(new CreateConnectionCommand(this.state, connection));
                this.tempConnection = null;
                this.renderer.render();
                this.setTool('select');
                console.log('Connexion créée');
            } else {
                console.log('Veuillez cliquer sur une entité');
            }
        }
    }

    handleContextMenu(e) {
        e.evt.preventDefault();

        const target = e.target;

        // Check if we clicked on a group (entity or association)
        let clickedGroup = target;
        while (clickedGroup && clickedGroup.getType() !== 'Group') {
            clickedGroup = clickedGroup.getParent();
        }

        if (clickedGroup && clickedGroup.attrs.itemType) {
            const itemId = clickedGroup.attrs.itemId;
            const itemType = clickedGroup.attrs.itemType;
            const item = itemType === 'entity'
                ? this.state.getEntity(itemId)
                : this.state.getAssociation(itemId);

            if (item && !this.state.selectedItems.find(i => i.id === item.id)) {
                this.state.select(item, false);
                this.renderer.render();
                this.updatePropertiesPanel();
            }

            const menu = document.getElementById('context-menu');
            menu.style.display = 'block';
            menu.style.left = e.evt.clientX + 'px';
            menu.style.top = e.evt.clientY + 'px';
        }
    }

    snapToGrid(pos) {
        return {
            x: Math.round(pos.x / CONFIG.GRID_SIZE) * CONFIG.GRID_SIZE,
            y: Math.round(pos.y / CONFIG.GRID_SIZE) * CONFIG.GRID_SIZE
        };
    }

    // Command operations
    undo() {
        if (this.state.undo()) {
            this.renderer.render();
            this.updatePropertiesPanel();
        }
    }

    redo() {
        if (this.state.redo()) {
            this.renderer.render();
            this.updatePropertiesPanel();
        }
    }

    deleteSelected() {
        if (this.state.selectedItems.length > 0) {
            if (confirm('Supprimer les éléments sélectionnés?')) {
                this.state.deleteSelected();
                this.renderer.render();
                this.updatePropertiesPanel();
            }
        }
    }

    copySelected() {
        this.state.copy();
    }

    pasteSelected() {
        if (this.state.paste()) {
            this.renderer.render();
            this.updatePropertiesPanel();
        }
    }

    selectAll() {
        this.state.entities.forEach(e => this.state.select(e, true));
        this.state.associations.forEach(a => this.state.select(a, true));
        this.renderer.render();
        this.updatePropertiesPanel();
    }

    editSelected() {
        if (this.state.selectedItems.length === 1) {
            const item = this.state.selectedItems[0];
            if (item.type === 'entity') {
                this.modalManager.openEntityModal(item.id);
            } else if (item.type === 'association') {
                this.modalManager.openAssociationModal(item.id);
            }
        }
    }

    // Properties panel removed - keeping stub to prevent errors
    updatePropertiesPanel() {}

    // Import/Export
    openExportModal() {
        const modal = document.getElementById('export-modal');
        const textarea = document.getElementById('export-data');
        textarea.value = this.state.serialize();
        modal.classList.add('active');
    }

    openImportModal() {
        const modal = document.getElementById('import-modal');
        document.getElementById('import-data').value = '';
        document.getElementById('import-file').value = '';
        modal.classList.add('active');
    }

    downloadJSON() {
        const data = this.state.serialize();
        const blob = new Blob([data], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'er-diagram.json';
        a.click();
        URL.revokeObjectURL(url);
    }

    copyToClipboard() {
        const textarea = document.getElementById('export-data');
        textarea.select();
        document.execCommand('copy');
        alert('Copié dans le presse-papiers!');
    }

    handleFileImport(e) {
        const file = e.target.files[0];
        if (file) {
            const reader = new FileReader();
            reader.onload = (evt) => {
                document.getElementById('import-data').value = evt.target.result;
            };
            reader.readAsText(file);
        }
    }

    importFromText() {
        const data = document.getElementById('import-data').value;
        if (data.trim()) {
            if (confirm('Remplacer le diagramme actuel?')) {
                if (this.state.deserialize(data)) {
                    document.getElementById('import-modal').classList.remove('active');
                    this.renderer.render();
                    this.updatePropertiesPanel();
                } else {
                    alert('Erreur lors de l\'importation. Vérifiez le format JSON.');
                }
            }
        }
    }

    clearDiagram() {
        if (confirm('Effacer tout le diagramme? Cette action est irréversible.')) {
            this.state.clear();
            this.renderer.render();
            this.updatePropertiesPanel();
        }
    }

    toggleGrid() {
        this.renderer.toggleGrid();
        const btn = document.getElementById('btn-grid');
        btn.classList.toggle('active');
    }

    toggleSnap() {
        this.renderer.toggleSnap();
        const btn = document.getElementById('btn-snap');
        btn.classList.toggle('active');
    }

    openHelpModal() {
        document.getElementById('help-modal').classList.add('active');
    }

    loadDiagram() {
        this.state.loadFromLocalStorage();
        this.renderer.render();
        this.updatePropertiesPanel();
    }
}

// Initialize application when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
    new ERDiagramApp();
});

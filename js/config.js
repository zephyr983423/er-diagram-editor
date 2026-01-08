// ===========================
// CONFIGURATION & CONSTANTS
// ===========================

export const CONFIG = {
    GRID_SIZE: 20,
    ENTITY_WIDTH: 220,
    ENTITY_MIN_HEIGHT: 100,
    ENTITY_PADDING: 12,
    ATTRIBUTE_HEIGHT: 28,
    ASSOCIATION_MIN_WIDTH: 160,
    ASSOCIATION_MIN_HEIGHT: 100,
    ASSOCIATION_PADDING: 12,
    ASSOCIATION_ATTRIBUTE_HEIGHT: 24,
    CANVAS_WIDTH: 3000,
    CANVAS_HEIGHT: 2000,
    ZOOM_MIN: 0.2,
    ZOOM_MAX: 3,
    ZOOM_STEP: 0.1,
    CARDINALITY_OFFSET: 35,  // Distance from node to cardinality label
    LABEL_OFFSET: 15,        // Offset for connection labels
    COLORS: {
        entity: '#ffffff',
        entityStroke: '#2563eb',
        entityStrokeSelected: '#dc2626',
        entityHeader: '#2563eb',
        entityHeaderText: '#ffffff',
        association: '#d1fae5',
        associationStroke: '#10b981',
        associationStrokeSelected: '#dc2626',
        associationText: '#065f46',
        connection: '#64748b',
        connectionSelected: '#dc2626',
        grid: '#e2e8f0',
        background: '#f8fafc'
    },
    SQL_TYPES: [
        'INTEGER', 'BIGINT', 'SMALLINT', 'TINYINT',
        'VARCHAR', 'CHAR', 'TEXT', 'LONGTEXT',
        'DECIMAL', 'FLOAT', 'DOUBLE',
        'DATE', 'DATETIME', 'TIMESTAMP', 'TIME',
        'BOOLEAN', 'BIT',
        'ENUM', 'SET',
        'JSON', 'BLOB'
    ],
    CARDINALITY_OPTIONS: [
        { value: '0,1', label: '0,1 (zéro ou un)' },
        { value: '1,1', label: '1,1 (exactement un)' },
        { value: '0,n', label: '0,n (zéro ou plusieurs)' },
        { value: '1,n', label: '1,n (un ou plusieurs)' }
    ]
};

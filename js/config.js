// ===========================
// CONFIGURATION & CONSTANTS
// ===========================

export const CONFIG = {
    GRID_SIZE: 20,
    ENTITY_WIDTH: 240,
    ENTITY_MIN_HEIGHT: 100,
    ENTITY_PADDING: 12,
    ATTRIBUTE_HEIGHT: 28,
    ASSOCIATION_MIN_WIDTH: 180,
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
        entityStroke: '#3975d7',
        entityStrokeSelected: '#e08b3f',
        entityHeader: '#285fae',
        entityHeaderText: '#ffffff',
        association: '#e2f8f1',
        associationStroke: '#25a98c',
        associationStrokeSelected: '#e08b3f',
        associationText: '#126c5a',
        connection: '#78889b',
        connectionSelected: '#e08b3f',
        grid: '#dfe6eb',
        background: '#f4f7f9'
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

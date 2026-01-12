// ===========================
// UTILITY FUNCTIONS
// ===========================

export function generateId(prefix = 'id') {
    return `${prefix}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

export function formatAttribute(attr) {
    let parts = [];

    // Pour les attributs UQ (unique/clés étrangères)
    if (attr.isUQ && !attr.isPK) {
        parts.push({ text: '[UQ]', style: 'normal' });
        parts.push({ text: attr.name, style: 'normal' });
    }
    // Pour les clés primaires
    else if (attr.isPK) {
        parts.push({ text: attr.name, style: 'pk' });
    }
    // Attributs normaux
    else {
        parts.push({ text: attr.name, style: 'normal' });
    }

    // Type entre parenthèses
    if (attr.type) {
        parts.push({ text: ` (${attr.type})`, style: 'type' });
    }

    // NOT NULL seulement pour les attributs non-PK
    if (!attr.isNull && !attr.isPK) {
        parts.push({ text: ' [NOT NULL]', style: 'constraint' });
    }

    return parts;
}

// Version simple pour les associations (qui n'ont pas besoin de formatage spécial)
export function formatAttributeSimple(attr) {
    let text = attr.name;
    if (attr.type) text += ` (${attr.type})`;
    return text;
}

export function calculateDistance(p1, p2) {
    const dx = p2.x - p1.x;
    const dy = p2.y - p1.y;
    return Math.sqrt(dx * dx + dy * dy);
}

export function calculateAngle(p1, p2) {
    return Math.atan2(p2.y - p1.y, p2.x - p1.x);
}

export function getPerpendicularOffset(angle, distance) {
    return {
        x: -Math.sin(angle) * distance,
        y: Math.cos(angle) * distance
    };
}

export function snapToGrid(pos, gridSize, enabled) {
    if (!enabled) return pos;
    return {
        x: Math.round(pos.x / gridSize) * gridSize,
        y: Math.round(pos.y / gridSize) * gridSize
    };
}

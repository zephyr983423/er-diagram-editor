// ===========================
// UTILITY FUNCTIONS
// ===========================

export function generateId(prefix = 'id') {
    return `${prefix}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

export function formatAttribute(attr) {
    let text = '';
    if (attr.isPK) text += '🔑 ';
    text += attr.name;
    if (attr.type) text += `: ${attr.type}`;
    if (attr.isUQ) text += ' [UQ]';
    if (!attr.isNull) text += ' [NOT NULL]';
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

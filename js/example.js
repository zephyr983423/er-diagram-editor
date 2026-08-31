export const EXAMPLE_DIAGRAM = {
    version: 1,
    entities: [
        {
            id: 'entity_client', name: 'Client', x: 70, y: 70, type: 'entity',
            attributes: [
                { id: 'attr_client_id', name: 'client_id', type: 'INTEGER', isPK: true, isUQ: false, isNull: false, defaultValue: '', enumValues: [] },
                { id: 'attr_client_email', name: 'email', type: 'VARCHAR', isPK: false, isUQ: true, isNull: false, defaultValue: '', enumValues: [] },
                { id: 'attr_client_name', name: 'nom_complet', type: 'VARCHAR', isPK: false, isUQ: false, isNull: false, defaultValue: '', enumValues: [] }
            ]
        },
        {
            id: 'entity_commande', name: 'Commande', x: 465, y: 55, type: 'entity',
            attributes: [
                { id: 'attr_order_id', name: 'commande_id', type: 'INTEGER', isPK: true, isUQ: false, isNull: false, defaultValue: '', enumValues: [] },
                { id: 'attr_order_ref', name: 'reference', type: 'VARCHAR', isPK: false, isUQ: true, isNull: false, defaultValue: '', enumValues: [] },
                { id: 'attr_order_date', name: 'date_creation', type: 'DATETIME', isPK: false, isUQ: false, isNull: false, defaultValue: 'CURRENT_TIMESTAMP', enumValues: [] },
                { id: 'attr_order_status', name: 'statut', type: 'ENUM', isPK: false, isUQ: false, isNull: false, defaultValue: 'brouillon', enumValues: ['brouillon', 'validée', 'expédiée'] }
            ]
        },
        {
            id: 'entity_produit', name: 'Produit', x: 875, y: 70, type: 'entity',
            attributes: [
                { id: 'attr_product_id', name: 'produit_id', type: 'INTEGER', isPK: true, isUQ: false, isNull: false, defaultValue: '', enumValues: [] },
                { id: 'attr_product_sku', name: 'sku', type: 'VARCHAR', isPK: false, isUQ: true, isNull: false, defaultValue: '', enumValues: [] },
                { id: 'attr_product_label', name: 'libelle', type: 'VARCHAR', isPK: false, isUQ: false, isNull: false, defaultValue: '', enumValues: [] },
                { id: 'attr_product_price', name: 'prix_unitaire', type: 'DECIMAL', isPK: false, isUQ: false, isNull: false, defaultValue: '0', enumValues: [] }
            ]
        },
        {
            id: 'entity_adresse', name: 'Adresse', x: 120, y: 650, type: 'entity',
            attributes: [
                { id: 'attr_address_id', name: 'adresse_id', type: 'INTEGER', isPK: true, isUQ: false, isNull: false, defaultValue: '', enumValues: [] },
                { id: 'attr_address_city', name: 'ville', type: 'VARCHAR', isPK: false, isUQ: false, isNull: false, defaultValue: '', enumValues: [] },
                { id: 'attr_address_zip', name: 'code_postal', type: 'VARCHAR', isPK: false, isUQ: false, isNull: false, defaultValue: '', enumValues: [] }
            ]
        }
    ],
    associations: [
        { id: 'assoc_passer', name: 'Passer', x: 385, y: 430, type: 'association', attributes: [] },
        {
            id: 'assoc_contenir', name: 'Contenir', x: 810, y: 430, type: 'association',
            attributes: [{ id: 'attr_line_qty', name: 'quantite', type: 'INTEGER', isPK: false, isUQ: false, isNull: false, defaultValue: '1', enumValues: [] }]
        },
        { id: 'assoc_livrer', name: 'Livrer à', x: 650, y: 695, type: 'association', attributes: [] }
    ],
    connections: [
        { id: 'conn_client_passer', associationId: 'assoc_passer', entityId: 'entity_client', cardinality: '0,n', label: 'passe' },
        { id: 'conn_order_passer', associationId: 'assoc_passer', entityId: 'entity_commande', cardinality: '1,1', label: 'est passée' },
        { id: 'conn_order_contenir', associationId: 'assoc_contenir', entityId: 'entity_commande', cardinality: '1,n', label: 'comprend' },
        { id: 'conn_product_contenir', associationId: 'assoc_contenir', entityId: 'entity_produit', cardinality: '0,n', label: 'figure dans' },
        { id: 'conn_order_livrer', associationId: 'assoc_livrer', entityId: 'entity_commande', cardinality: '1,1', label: 'destination' },
        { id: 'conn_address_livrer', associationId: 'assoc_livrer', entityId: 'entity_adresse', cardinality: '0,n', label: 'reçoit' }
    ]
};

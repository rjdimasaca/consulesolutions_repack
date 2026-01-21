/**
 * @NApiVersion 2.1
 * @NScriptType ClientScript
 */
define(['N/currentRecord', 'N/search'], (currentRecord, search) => {

    const FIELD_SPECIES  = 'custrecord_cos_rep_species';
    const FIELD_LOCATION = 'custrecord_cos_rep_location';

    function pushItemsToInlineHtml(items, speciesId) {
        const meta = { speciesId: speciesId || '' };

        const tryPush = (attempt) => {
            const a = attempt || 0;
            try {
                if (window.COS_REPACK_UI && typeof window.COS_REPACK_UI.setItems === 'function') {
                    window.COS_REPACK_UI.setItems(items, meta);
                    return;
                }
            } catch (e) {}

            if (a < 25) setTimeout(() => tryPush(a + 1), 200);
        };

        tryPush(0);
    }

    function fetchItemsBySpecies(speciesId) {
        if (!speciesId) return [];

        const items = [];

        const s = search.create({
            type: search.Type.ITEM,
            filters: [
                ['isinactive', 'is', 'F'],
                'AND',
                ['custitem_repack_species', 'anyof', speciesId]
            ],
            columns: [
                search.createColumn({ name: 'internalid' }),
                search.createColumn({ name: 'itemid' }),
                search.createColumn({ name: 'custitem_repack_conversion' })
            ]
        });

        const paged = s.runPaged({ pageSize: 1000 });
        paged.pageRanges.forEach((range) => {
            const page = paged.fetch({ index: range.index });
            page.data.forEach((r) => {
                const id = r.getValue({ name: 'internalid' });
                if (!id) return;

                items.push({
                    id: String(id),
                    name: String(r.getValue({ name: 'itemid' }) || id),
                    conversion: String(r.getValue({ name: 'custitem_repack_conversion' }) || '')
                });
            });
        });

        return items;
    }

    function fetchLocationMetricsMap(itemIds, locationId) {
        const map = {};
        if (!locationId || !itemIds || !itemIds.length) return map;

        try {
            const s = search.create({
                type: search.Type.ITEM,
                filters: [
                    ['internalid', 'anyof', itemIds],
                    'AND',
                    ['inventorylocation', 'anyof', locationId]
                ],
                columns: [
                    search.createColumn({ name: 'internalid' }),
                    search.createColumn({ name: 'locationquantityavailable' }),
                    search.createColumn({ name: 'locationquantityonhand' }),
                    search.createColumn({ name: 'locationquantitycommitted' }),
                    search.createColumn({ name: 'locationquantityonorder' }),
                    search.createColumn({ name: 'locationquantitybackordered' })
                ]
            });

            const paged = s.runPaged({ pageSize: 1000 });
            paged.pageRanges.forEach((range) => {
                const page = paged.fetch({ index: range.index });
                page.data.forEach((r) => {
                    const id = r.getValue({ name: 'internalid' });
                    if (!id) return;
                    map[String(id)] = {
                        available: String(r.getValue({ name: 'locationquantityavailable' }) || '0'),
                        onhand: String(r.getValue({ name: 'locationquantityonhand' }) || '0'),
                        committed: String(r.getValue({ name: 'locationquantitycommitted' }) || '0'),
                        onorder: String(r.getValue({ name: 'locationquantityonorder' }) || '0'),
                        backordered: String(r.getValue({ name: 'locationquantitybackordered' }) || '0')
                    };
                });
            });
        } catch (e) {}

        return map;
    }

    function refreshItems() {
        try {
            const rec = currentRecord.get();
            const speciesId = rec.getValue({ fieldId: FIELD_SPECIES });
            const locationId = rec.getValue({ fieldId: FIELD_LOCATION });

            if (!speciesId) {
                pushItemsToInlineHtml([], '');
                return;
            }

            const items = fetchItemsBySpecies(speciesId);

            // attach location metrics
            try {
                const ids = items.map((it) => it.id);
                const m = fetchLocationMetricsMap(ids, locationId);
                items.forEach((it) => {
                    const row = m[String(it.id)] || {};
                    it.available = row.available || '0';
                    it.onhand = row.onhand || '0';
                    it.committed = row.committed || '0';
                    it.onorder = row.onorder || '0';
                    it.backordered = row.backordered || '0';
                });
            } catch (ignore) {}

            pushItemsToInlineHtml(items, String(speciesId));
        } catch (e) {
            pushItemsToInlineHtml([], '');
            try { console.error('COS_CS refreshItems error', e); } catch (ignore) {}
        }
    }

    function pageInit() {
        refreshItems();
    }

    function fieldChanged(context) {
        if (!context) return;
        if (context.fieldId === FIELD_SPECIES || context.fieldId === FIELD_LOCATION) {
            refreshItems();
        }
    }

    return { pageInit, fieldChanged };
});

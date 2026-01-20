/**
 * @NApiVersion 2.1
 * @NScriptType ClientScript
 */
define(['N/currentRecord', 'N/search'], (currentRecord, search) => {

    const FIELD_SPECIES = 'custrecord_cos_rep_species';
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
            } catch (e) {
                // ignore and retry
            }

            // INLINEHTML can load slightly after client script in NetSuite
            if (a < 25) {
                setTimeout(() => tryPush(a + 1), 200);
            }
        };

        tryPush(0);
    }


    function fetchAvailabilityMap(itemIds, locationId) {
        var map = {};
        try {
            if (!locationId || !itemIds || !itemIds.length) return map;

            var s = search.create({
                type: 'inventorybalance',
                filters: [
                    ['item', 'anyof', itemIds],
                    'AND',
                    ['location', 'anyof', locationId]
                ],
                columns: [
                    search.createColumn({ name: 'item', summary: search.Summary.GROUP }),
                    search.createColumn({ name: 'available', summary: search.Summary.SUM })
                ]
            });

            s.run().each(function (r) {
                var itemId = r.getValue({ name: 'item', summary: search.Summary.GROUP });
                var avail = r.getValue({ name: 'available', summary: search.Summary.SUM });
                if (itemId) map[String(itemId)] = String(avail || '0');
                return true;
            });
        } catch (e) {
            // ignore; return empty map
        }
        return map;
    }

    function fetchItemsBySpecies(speciesId, locationId) {
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
                const name = r.getValue({ name: 'itemid' });
                if (id) {
                    var conv = r.getValue({ name: 'custitem_repack_conversion' });
                    items.push({ id: String(id), name: String(name || id), conversion: String(conv || '') });
                }
            });
        });

        // Attach availability at the selected location (if provided)
        try {
            var ids = items.map(function (it) { return it.id; });
            var availMap = fetchAvailabilityMap(ids, locationId);
            items.forEach(function (it) {
                it.available = availMap[String(it.id)] || '0';
            });
        } catch (e) {}

        return items;
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

            const items = fetchItemsBySpecies(speciesId, locationId);
            pushItemsToInlineHtml(items, String(speciesId));
        } catch (e) {
            // If something goes wrong, still push empty so UI doesn't hang
            pushItemsToInlineHtml([], '');
            try {
                console.error('COS_CS refreshItems error', e);
            } catch (ignore) {}
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

    return {
        pageInit,
        fieldChanged
    };
});

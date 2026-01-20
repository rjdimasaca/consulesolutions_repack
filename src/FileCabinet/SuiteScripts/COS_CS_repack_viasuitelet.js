/**
 * @NApiVersion 2.1
 * @NScriptType ClientScript
 */
define(['N/currentRecord', 'N/search'], (currentRecord, search) => {

    const FIELD_SPECIES = 'custrecord_cos_rep_species';

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
                const name = r.getValue({ name: 'itemid' });
                if (id) {
                    var conv = r.getValue({ name: 'custitem_repack_conversion' });
                    console.log("{r, conv}", {r, conv});
                    items.push({ id: String(id), name: String(name || id), conversion: String(conv || '') });
                }
            });
        });

        return items;
    }

    function refreshItems() {
        try {
            const rec = currentRecord.get();
            const speciesId = rec.getValue({ fieldId: FIELD_SPECIES });

            if (!speciesId) {
                pushItemsToInlineHtml([], '');
                return;
            }

            const items = fetchItemsBySpecies(speciesId);
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
        if (context && context.fieldId === FIELD_SPECIES) {
            refreshItems();
        }
    }

    return {
        pageInit,
        fieldChanged
    };
});

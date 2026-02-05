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

    function cosOpenCreateWoModal() {
        try {
            // Prefer URL injected by User Event (VIEW mode)
            let u = '';
            try {
                const el = document.getElementById('custpage_cos_createwo_url');
                if (el && el.value) u = String(el.value);
            } catch (ignore) {}

            // fallback (older inline handler)
            if (!u && window.cosOpenCreateWoModal_inline) {
                window.cosOpenCreateWoModal_inline();
                return;
            }

            if (!u) {
                alert('Create WO URL is not available.');
                return;
            }

            // Build modal DOM once
            let overlay = document.getElementById('cos_createwo_overlay');
            let modal   = document.getElementById('cos_createwo_modal');
            let iframe  = document.getElementById('cos_createwo_iframe');
            let closeBtn= document.getElementById('cos_createwo_close');

            if (!overlay || !modal || !iframe) {
                overlay = document.createElement('div');
                overlay.id = 'cos_createwo_overlay';
                overlay.style.cssText = 'position:fixed;left:0;top:0;right:0;bottom:0;background:rgba(0,0,0,0.55);z-index:100000;display:none;';

                modal = document.createElement('div');
                modal.id = 'cos_createwo_modal';
                modal.style.cssText = 'position:fixed;left:50%;top:50%;transform:translate(-50%,-50%);width:92vw;max-width:1200px;height:85vh;background:#fff;border-radius:10px;overflow:hidden;z-index:100001;display:none;box-shadow:0 10px 40px rgba(0,0,0,0.35);';

                const hdr = document.createElement('div');
                hdr.style.cssText = 'display:flex;align-items:center;justify-content:space-between;padding:10px 12px;background:#2f3f53;color:#fff;font-family:Arial,Helvetica,sans-serif;';
                const title = document.createElement('div');
                title.textContent = 'Create Work Orders';
                title.style.cssText = 'font-weight:bold;font-size:14px;';
                closeBtn = document.createElement('button');
                closeBtn.id = 'cos_createwo_close';
                closeBtn.type = 'button';
                closeBtn.textContent = '✕';
                closeBtn.style.cssText = 'cursor:pointer;border:0;background:transparent;color:#fff;font-size:18px;line-height:18px;padding:2px 6px;';
                hdr.appendChild(title);
                hdr.appendChild(closeBtn);

                iframe = document.createElement('iframe');
                iframe.id = 'cos_createwo_iframe';
                iframe.style.cssText = 'width:100%;height:calc(85vh - 44px);border:0;display:block;';
                iframe.setAttribute('frameborder', '0');

                modal.appendChild(hdr);
                modal.appendChild(iframe);

                document.body.appendChild(overlay);
                document.body.appendChild(modal);

                const close = () => {
                    try { iframe.src = 'about:blank'; } catch (ignore) {}
                    overlay.style.display = 'none';
                    modal.style.display = 'none';
                    try { document.body.style.overflow = ''; } catch (ignore) {}
                };

                overlay.addEventListener('click', close);
                closeBtn.addEventListener('click', close);

                // Listen for Suitelet messages to close/refresh
                if (!window.__COS_CREATEWO_PM_BOUND__) {
                    window.__COS_CREATEWO_PM_BOUND__ = true;
                    window.addEventListener('message', function(ev){
                        try {
                            const d = ev && ev.data ? ev.data : null;
                            if (!d || typeof d !== 'object') return;

                            if (d.type === 'COS_REPACK_CREATEWO_CLOSE') {
                                close();
                            }
                            if (d.type === 'COS_REPACK_CREATEWO_DONE') {
                                close();
                                try { window.location.reload(); } catch (ignore) {}
                            }
                        } catch (ignore) {}
                    });
                }
            }

            // Open modal
            iframe.src = u;
            overlay.style.display = 'block';
            modal.style.display = 'block';
            try { document.body.style.overflow = 'hidden'; } catch (ignore) {}

            try { console.log('cosOpenCreateWoModal opened', u); } catch (ignore) {}
        } catch (e) {
            try { console.error('cosOpenCreateWoModal failed', e); } catch (ignore) {}
            alert('Unable to open Create Work Orders modal. See console for details.');
        }
    }

    function fieldChanged(context) {
        if (!context) return;
        if (context.fieldId === FIELD_SPECIES || context.fieldId === FIELD_LOCATION) {
            refreshItems();
        }
    }

    return { pageInit, fieldChanged, cosOpenCreateWoModal };
});

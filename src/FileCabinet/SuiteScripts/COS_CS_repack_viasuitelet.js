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
        // Prefer iframe modal (UE should set hidden field `custpage_cos_createwo_url`)
        // Fallback: if an inline handler exists, call it.
        try {
            const rec = currentRecord.get();
            const urlVal = rec.getValue({ fieldId: 'custpage_cos_createwo_url' });
            const suiteletUrl = (urlVal && String(urlVal).trim()) ? String(urlVal).trim() : '';

            if (suiteletUrl) {
                const OVERLAY_ID = 'cos_createwo_overlay';
                const MODAL_ID = 'cos_createwo_modal';
                const IFRAME_ID = 'cos_createwo_iframe';

                const closeModal = (opts) => {
                    const o = opts || {};
                    try {
                        const overlay = document.getElementById(OVERLAY_ID);
                        if (overlay && overlay.parentNode) overlay.parentNode.removeChild(overlay);
                        const modal = document.getElementById(MODAL_ID);
                        if (modal && modal.parentNode) modal.parentNode.removeChild(modal);
                    } catch (ignore) {}
                    if (o.refresh) {
                        try { window.location.reload(); } catch (ignore) {}
                    }
                };

                // inject styles once
                if (!document.getElementById('cos_createwo_modal_style')) {
                    const style = document.createElement('style');
                    style.id = 'cos_createwo_modal_style';
                    style.type = 'text/css';
                    style.appendChild(document.createTextNode(
                        '#' + OVERLAY_ID + '{position:fixed;inset:0;background:rgba(0,0,0,.55);z-index:100000;}' +
                        '#' + MODAL_ID + '{position:fixed;inset:4%;background:#fff;border-radius:10px;z-index:100001;box-shadow:0 10px 30px rgba(0,0,0,.35);overflow:hidden;display:flex;flex-direction:column;}' +
                        '#' + MODAL_ID + ' .cos_hdr{display:flex;align-items:center;gap:8px;padding:10px 12px;border-bottom:1px solid #e5e5e5;}' +
                        '#' + MODAL_ID + ' .cos_title{font-weight:600;font-size:14px;flex:1;}' +
                        '#' + MODAL_ID + ' .cos_btn{cursor:pointer;border:1px solid #ccc;border-radius:8px;padding:6px 10px;background:#f7f7f7;}' +
                        '#' + MODAL_ID + ' .cos_btn:hover{background:#efefef;}' +
                        '#' + IFRAME_ID + '{width:100%;height:100%;border:0;flex:1;}'
                    ));
                    document.head.appendChild(style);
                }

                // wire postMessage listener once
                if (!window.__COS_CREATEWO_MSG_WIRED__) {
                    window.__COS_CREATEWO_MSG_WIRED__ = true;
                    window.addEventListener('message', function (evt) {
                        try {
                            const msg = evt && evt.data;
                            if (!msg || typeof msg !== 'object') return;
                            if (msg.type === 'COS_REPACK_CREATEWO_CLOSE') closeModal({ refresh: false });
                            if (msg.type === 'COS_REPACK_CREATEWO_DONE') closeModal({ refresh: true });
                        } catch (ignore) {}
                    });
                }

                // close any existing modal then open
                closeModal({ refresh: false });

                const overlay = document.createElement('div');
                overlay.id = OVERLAY_ID;
                overlay.onclick = function () { closeModal({ refresh: false }); };
                document.body.appendChild(overlay);

                const modal = document.createElement('div');
                modal.id = MODAL_ID;

                const hdr = document.createElement('div');
                hdr.className = 'cos_hdr';

                const title = document.createElement('div');
                title.className = 'cos_title';
                title.textContent = 'Create Work Orders';

                const btnClose = document.createElement('button');
                btnClose.type = 'button';
                btnClose.className = 'cos_btn';
                btnClose.textContent = 'Close';
                btnClose.onclick = function () { closeModal({ refresh: false }); };

                hdr.appendChild(title);
                hdr.appendChild(btnClose);

                const iframe = document.createElement('iframe');
                iframe.id = IFRAME_ID;
                iframe.src = suiteletUrl;

                modal.appendChild(hdr);
                modal.appendChild(iframe);

                document.body.appendChild(modal);

                try { console.log('COS_CS cosOpenCreateWoModal iframe', suiteletUrl); } catch (ignore) {}
                return;
            }
        } catch (e) {
            try { console.error('COS_CS cosOpenCreateWoModal error', e); } catch (ignore) {}
        }

        // fallback to old inline handler if present
        try {
            if (window.cosOpenCreateWoModal_inline) {
                window.cosOpenCreateWoModal_inline();
                return;
            }
        } catch (ignore) {}

        alert('Create WO URL is not available.');
    }
    function fieldChanged(context) {
        if (!context) return;
        if (context.fieldId === FIELD_SPECIES || context.fieldId === FIELD_LOCATION) {
            refreshItems();
        }
    }

    return { pageInit, fieldChanged, cosOpenCreateWoModal };
});

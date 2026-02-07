/**
 * @NApiVersion 2.1
 * @NScriptType ClientScript
 */
define(['N/currentRecord', 'N/search'], (currentRecord, search) => {

    const FIELD_SPECIES  = 'custrecord_cos_rep_species';
    const FIELD_LOCATION = 'custrecord_cos_rep_location';


    // SO-only committed quantity (sum of transaction line quantitycommitted for Sales Orders)
    function fetchSalesOrderCommittedMap(itemIds, locationId) {
        const map = {};
        if (!itemIds || !itemIds.length || !locationId) return map;

        // NetSuite filter anyof has practical limits; chunk defensively
        const chunkSize = 800;
        for (let start = 0; start < itemIds.length; start += chunkSize) {
            const chunk = itemIds.slice(start, start + chunkSize);

            try {
                const s = search.create({
                    type: search.Type.TRANSACTION,
                    filters: [
                        ['type', 'anyof', 'SalesOrd'],
                        'AND',
                        ['mainline', 'is', 'F'],
                        'AND',
                        ['taxline', 'is', 'F'],
                        'AND',
                        ['shipping', 'is', 'F'],
                        'AND',
                        ['location', 'anyof', locationId],
                        'AND',
                        ['item', 'anyof', chunk],
                        'AND',
                        // Only lines with actual commitments
                        ['quantitycommitted', 'greaterthan', '0']
                    ],
                    columns: [
                        search.createColumn({ name: 'item', summary: search.Summary.GROUP }),
                        search.createColumn({ name: 'quantitycommitted', summary: search.Summary.SUM })
                    ]
                });

                s.run().each((r) => {
                    const itemId = r.getValue({ name: 'item', summary: search.Summary.GROUP });
                    if (!itemId) return true;

                    const qty = r.getValue({ name: 'quantitycommitted', summary: search.Summary.SUM });
                    map[String(itemId)] = String(qty || '0');
                    return true;
                });
            } catch (e) {
                try { log.error({ title: 'COS Repack: SO committed search failed', details: e }); } catch (_e) {}
            }
        }

        return map;
    }


    // WO-only committed quantity (sum of transaction line quantitycommitted for Work Orders)
    function fetchWorkOrderCommittedMap(itemIds, locationId) {
        const map = {};
        if (!itemIds || !itemIds.length || !locationId) return map;

        const chunkSize = 800;
        for (let start = 0; start < itemIds.length; start += chunkSize) {
            const chunk = itemIds.slice(start, start + chunkSize);

            try {
                const s = search.create({
                    type: search.Type.TRANSACTION,
                    filters: [
                        ['type', 'anyof', 'WorkOrd'],
                        'AND',
                        ['mainline', 'is', 'F'],
                        'AND',
                        ['taxline', 'is', 'F'],
                        'AND',
                        ['shipping', 'is', 'F'],
                        'AND',
                        ['location', 'anyof', locationId],
                        'AND',
                        ['item', 'anyof', chunk],
                        'AND',
                        ['quantitycommitted', 'greaterthan', '0']
                    ],
                    columns: [
                        search.createColumn({ name: 'item', summary: search.Summary.GROUP }),
                        search.createColumn({ name: 'quantitycommitted', summary: search.Summary.SUM })
                    ]
                });

                s.run().each((r) => {
                    const itemId = r.getValue({ name: 'item', summary: search.Summary.GROUP });
                    if (!itemId) return true;

                    const qty = r.getValue({ name: 'quantitycommitted', summary: search.Summary.SUM });
                    map[String(itemId)] = String(qty || '0');
                    return true;
                });
            } catch (e) {
                try { log.error({ title: 'COS Repack: WO committed search failed', details: e }); } catch (_e) {}
            }
        }

        return map;
    }


// PO remaining quantity (open qty not yet received) for Purchase Orders
// Uses formula: {quantity} - NVL({quantityshiprecv},0)
    function fetchPurchaseOrderRemainingMap(itemIds, locationId) {
        const map = {};
        if (!itemIds || !itemIds.length || !locationId) return map;

        const chunkSize = 800;
        for (let start = 0; start < itemIds.length; start += chunkSize) {
            const chunk = itemIds.slice(start, start + chunkSize);

            try {
                const remainingFilter = ["formulanumeric: {quantity}-nvl({quantityshiprecv},0)","greaterthan","0"]
                console.log("fetchPurchaseOrderRemainingMap remainingFilter", remainingFilter)
                const s = search.create({
                    type: search.Type.TRANSACTION,
                    filters: [
                        ['type', 'anyof', 'PurchOrd'],
                        'AND',
                        ['mainline', 'is', 'F'],
                        'AND',
                        ['taxline', 'is', 'F'],
                        'AND',
                        ['shipping', 'is', 'F'],
                        'AND',
                        ['closed', 'is', 'F'],
                        'AND',
                        ['location', 'anyof', locationId],
                        'AND',
                        ['item', 'anyof', chunk],
                        'AND',
                        remainingFilter
                    ],
                    columns: [
                        search.createColumn({ name: 'item', summary: search.Summary.GROUP }),
                        search.createColumn({ name: 'formulanumeric', summary: search.Summary.SUM, formula: '{quantity}-nvl({quantityshiprecv},0)' })
                    ]
                });

                s.run().each((r) => {
                    const itemId = r.getValue({ name: 'item', summary: search.Summary.GROUP });
                    if (!itemId) return true;

                    const qty = r.getValue({ name: 'formulanumeric', summary: search.Summary.SUM, formula: '{quantity}-nvl({quantityshiprecv},0)' });
                    map[String(itemId)] = String(qty || '0');
                    return true;
                });
                // s.title = "REPACK:ON PO SEARCH" + new Date().getTime();
                // var ssId = s.save();
                console.log("repack:on po search, ss internalid", ssId)
            } catch (e) {
                try { log.error({ title: 'COS Repack: PO remaining search failed', details: e }); } catch (_e) {}
            }
        }

        return map;
    }

    function pushItemsToInlineHtml(items, meta) {
        const m = meta || {};
        const metaObj = { speciesId: m.speciesId || '', vendors: Array.isArray(m.vendors) ? m.vendors : [] };

        const tryPush = (attempt) => {
            const a = attempt || 0;
            try {
                if (window.COS_REPACK_UI && typeof window.COS_REPACK_UI.setItems === 'function') {
                    window.COS_REPACK_UI.setItems(items, metaObj);
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
                search.createColumn({ name: 'custitem_repack_conversion' }),
                search.createColumn({ name: 'vendor' })
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
                    conversion: String(r.getValue({ name: 'custitem_repack_conversion' }) || ''),
                    preferredVendorId: String(r.getValue({ name: 'vendor' }) || '')
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


    // Vendor dropdown support for PO section
    var __COS_VENDOR_LIST_CACHE = null;
    var __COS_VENDOR_LIST_CACHE_TS = 0;

    function fetchVendorsList() {
        try {
            // cache for 10 minutes to avoid repeated searches on fieldChanged
            var now = Date.now();
            if (__COS_VENDOR_LIST_CACHE && (now - __COS_VENDOR_LIST_CACHE_TS) < (10 * 60 * 1000)) {
                return __COS_VENDOR_LIST_CACHE;
            }

            var list = [];
            var s = search.create({
                type: search.Type.VENDOR,
                filters: [['isinactive', 'is', 'F']],
                columns: [
                    search.createColumn({ name: 'internalid' }),
                    search.createColumn({ name: 'entityid' })
                ]
            });

            var paged = s.runPaged({ pageSize: 1000 });
            paged.pageRanges.forEach(function(range){
                var page = paged.fetch({ index: range.index });
                page.data.forEach(function(r){
                    var id = r.getValue({ name: 'internalid' });
                    if (!id) return;
                    list.push({ id: String(id), name: String(r.getValue({ name: 'entityid' }) || id) });
                });
            });

            // ensure default vendor 621 is present
            var has621 = list.some(function(v){ return String(v.id) === '621'; });
            if (!has621) list.unshift({ id: '621', name: '621' });

            __COS_VENDOR_LIST_CACHE = list;
            __COS_VENDOR_LIST_CACHE_TS = now;

            return list;
        } catch (e) {
            // fallback: include default vendor only
            return [{ id: '621', name: '621' }];
        }
    }

    function refreshItems() {
        try {
            const rec = currentRecord.get();
            const speciesId = rec.getValue({ fieldId: FIELD_SPECIES });
            const locationId = rec.getValue({ fieldId: FIELD_LOCATION });

            if (!speciesId) {
                pushItemsToInlineHtml([], { speciesId: '', vendors: fetchVendorsList() });
                return;
            }

            const items = fetchItemsBySpecies(speciesId);

            // attach location metrics
            try {
                const ids = items.map((it) => it.id);
                const m = fetchLocationMetricsMap(ids, locationId);
                const soMap = fetchSalesOrderCommittedMap(ids, locationId);
                const woMap = fetchWorkOrderCommittedMap(ids, locationId);
                const poMap = fetchPurchaseOrderRemainingMap(ids, locationId);
                items.forEach((it) => {
                    const row = m[String(it.id)] || {};
                    it.available = row.available || '0';
                    it.onhand = row.onhand || '0';
                    it.committed = row.committed || '0';
                    it.onorder = row.onorder || '0';
                    it.backordered = row.backordered || '0';
                    // SO committed (Sales Orders only)
                    try {
                        it.soCommitted = soMap[String(it.id)] || '0';
                    } catch(e) { it.soCommitted = '0'; }

                    // WO committed (Work Orders only)
                    try {
                        it.woCommitted = woMap[String(it.id)] || '0';
                    } catch(e) { it.woCommitted = '0'; }


                    // ON PO remaining (Purchase Orders open qty)
                    try {
                        it.onpo = poMap[String(it.id)] || '0';
                    } catch(e) { it.onpo = '0'; }
                });
            } catch (ignore) {}

            var vendors = fetchVendorsList();
            pushItemsToInlineHtml(items, { speciesId: String(speciesId), vendors: vendors });
        } catch (e) {
            pushItemsToInlineHtml([], { speciesId: '', vendors: fetchVendorsList() });
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

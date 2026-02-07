/**
 * @NApiVersion 2.1
 * @NScriptType ClientScript
 */
define(['N/currentRecord', 'N/search', 'N/record'], (currentRecord, search, record) => {

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

    async function cosOpenCreateWoModal() {
        try {
            const rec = currentRecord.get();
            const urlFieldId = 'custpage_cos_createwo_url';
            const baseUrl = rec.getValue({ fieldId: urlFieldId });

            if (!baseUrl) {
                alert('Create WO URL is not available.');
                return;
            }

            // 1) Mark status=2 first (server-side) so the next reload shows "WO Creation In Progress"
            // NOTE: This is done here (client) per latest requirement; Suitelet should not set status=2.
            const recId = rec.id;
            const recType = rec.type;

            if (!recId || !recType) {
                alert('Unable to identify this record for status update.');
                return;
            }

            try {
                record.submitFields({
                    type: recType,
                    id: recId,
                    values: {
                        custrecord_cos_rep_status: '2'
                    },
                    options: {
                        enableSourcing: false,
                        ignoreMandatoryFields: true
                    }
                });
            } catch (e) {
                console.log('COS Repack: failed to set status=2', e);
                alert('Unable to set status to "Work Order Creation In Progress". Please try again.');
                return;
            }

            // 2) Fire the WO creation Suitelet call (do not wait).
            // Use keepalive so the request can continue even if we reload immediately.
            const runUrl = baseUrl + (baseUrl.indexOf('?') >= 0 ? '&' : '?') + 'action=createWO';
            console.log("runUrl", runUrl);
            try {
                var resp = await fetch(runUrl, { method: 'GET', credentials: 'same-origin', keepalive: true });

                console.log("cosOpenCreateWoModal resp", resp)
                if(resp.ok)
                {
                    // 3) Reload so the banner/status updates immediately
                    location.reload();
                }
                else
                {
                    alert("ERROR connecting to the suitelet")
                }
            } catch (e) {
                console.log('COS Repack: failed to call Create WO suitelet', e);
                // even if fetch fails, keep the status=2 (user can retry via refresh)
            }


            console.log('COS Repack: Create WO triggered', { recType: recType, recId: recId, runUrl: runUrl });
        } catch (e) {
            console.log('COS Repack: error starting WO creation', e);
            alert('Unable to start Work Order creation.');
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

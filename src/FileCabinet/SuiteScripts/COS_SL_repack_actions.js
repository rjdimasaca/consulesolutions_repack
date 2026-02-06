/**
 * @NApiVersion 2.1
 * @NScriptType Suitelet
 *
 * COS Repack - Create Work Orders (button-driven)
 *
 * Deploy and set Script/Deployment IDs to match those referenced in COS_UE_repack.js:
 * - scriptId: customscript_cos_sl_repack_createwo
 * - deployId: customdeploy_cos_sl_repack_createwo
 */
define(['N/record','N/search','N/log','N/url','N/ui/serverWidget'], (record, search, log, url, serverWidget) => {

    const REPACK_STATUS_FIELDID = 'custrecord_cos_rep_status';
    const REPACK_STATUS_DRAFT = '1';
    const REPACK_STATUS_WO_CREATED = '2';

    // Optional helper fields (safe to ignore if not present in your account)
    const REPACK_CREATED_WO_IDS_FIELDID = 'custrecord_cos_rep_created_wo_ids';
    const REPACK_CREATED_WO_DATE_FIELDID = 'custrecord_cos_rep_created_wo_date';

    function htmlEscape(s){
        return String(s||'')
            .replace(/&/g,'&amp;')
            .replace(/</g,'&lt;')
            .replace(/>/g,'&gt;')
            .replace(/"/g,'&quot;')
            .replace(/'/g,'&#39;');
    }

    function renderResultPage(context, title, bodyHtml) {
        const form = serverWidget.createForm({ title, hideNavBar : true });
        const fld = form.addField({
            id: 'custpage_cos_result_html',
            type: serverWidget.FieldType.INLINEHTML,
            label: ' '
        });
        fld.defaultValue = bodyHtml;
        context.response.writePage(form);
    }

    function findExistingWorkOrders(repackId) {
        const results = [];
        try {
            const s = search.create({
                type: 'workorder',
                filters: [
                    ['mainline','is','T'],
                    'and',
                    ['custbody_cos_createdfromrepack','anyof', String(repackId)]
                ],
                columns: [
                    search.createColumn({ name:'internalid' }),
                    search.createColumn({ name:'tranid' })
                ]
            });

            s.run().each(r => {
                results.push({
                    id: r.getValue({ name:'internalid' }),
                    tranid: r.getValue({ name:'tranid' })
                });
                return true;
            });
        } catch (e) {
            log.error({ title: 'COS Repack Create WO: search existing WO failed', details: e });
        }
        return results;
    }

    function findExistingPurchaseOrders(repackId) {
        const results = [];
        try {
            const s = search.create({
                type: 'purchaseorder',
                filters: [
                    ['mainline','is','T'],
                    'and',
                    ['custbody_cos_createdfromrepack','anyof', String(repackId)]
                ],
                columns: [
                    search.createColumn({ name:'internalid' }),
                    search.createColumn({ name:'tranid' })
                ]
            });

            s.run().each(r => {
                results.push({
                    id: r.getValue({ name:'internalid' }),
                    tranid: r.getValue({ name:'tranid' })
                });
                return true;
            });
        } catch (e) {
            log.error({ title: 'COS Repack Create WO: search existing PO failed', details: e });
        }
        return results;
    }

    function fetchPreferredVendorMap(itemIds) {
        const map = {};
        const uniq = Array.from(new Set((itemIds || []).filter(Boolean).map(String)));
        if (!uniq.length) return map;

        // NetSuite has limits on 'anyof' list sizes; chunk defensively.
        const CHUNK = 900;
        for (let i = 0; i < uniq.length; i += CHUNK) {
            const chunk = uniq.slice(i, i + CHUNK);
            try {
                const s = search.create({
                    type: search.Type.ITEM,
                    filters: [['internalid','anyof', chunk]],
                    columns: [
                        search.createColumn({ name: 'internalid' }),
                        search.createColumn({ name: 'preferredvendor' })
                    ]
                });

                s.run().each((r) => {
                    const id = String(r.getValue({ name: 'internalid' }) || '');
                    if (!id) return true;
                    const vend = r.getValue({ name: 'preferredvendor' });
                    if (vend) map[id] = String(vend);
                    return true;
                });
            } catch (e) {
                log.error({ title: 'COS Repack Create WO: preferred vendor lookup failed', details: e });
            }
        }
        return map;
    }

    function buildPurchaseLinesFromSummary(repackRec) {
        // Repack PO section is stored in the summary payload as summary.purchase (or variants).
        const rawSummary = (function(){
            try { return repackRec.getValue({ fieldId: 'custrecord_cos_rep_summary_payload' }) || ''; } catch (_e) {}
            return '';
        })();

        const summary = safeParseJson(rawSummary) || {};
        const purchase = Array.isArray(summary.purchase) ? summary.purchase
            : (Array.isArray(summary.purchaseOrder) ? summary.purchaseOrder
                : (Array.isArray(summary.po) ? summary.po : []));

        const lines = [];
        purchase.forEach(p => {
            const id = p && p.id ? String(p.id) : '';
            const qty = toNum(p && p.qty);
            if (!id || !(qty > 0)) return;
            lines.push({ itemId: id, qty: qty });
        });

        // Aggregate by item
        const byItem = {};
        lines.forEach(l => {
            if (!byItem[l.itemId]) byItem[l.itemId] = { itemId: l.itemId, qty: 0 };
            byItem[l.itemId].qty = round6(toNum(byItem[l.itemId].qty) + toNum(l.qty));
        });

        return Object.keys(byItem).map(k => byItem[k]);
    }

    function createPurchaseOrdersFromLines(poLines, subsidiary, location, repackId) {
        const DEFAULT_VENDOR_ID = '621';

        const results = [];
        const lines = Array.isArray(poLines) ? poLines : [];
        if (!lines.length) return results;

        const itemIds = lines.map(l => l.itemId);
        const prefVendorMap = fetchPreferredVendorMap(itemIds);

        // Group lines by vendor
        const byVendor = {};
        lines.forEach(l => {
            const vend = prefVendorMap[l.itemId] ? String(prefVendorMap[l.itemId]) : DEFAULT_VENDOR_ID;
            if (!byVendor[vend]) byVendor[vend] = [];
            byVendor[vend].push(l);
        });

        Object.keys(byVendor).forEach(vendorId => {
            const vendorLines = byVendor[vendorId] || [];
            if (!vendorLines.length) return;

            try {
                const poRec = record.create({ type: record.Type.PURCHASE_ORDER, isDynamic: true });

                // Header
                try { poRec.setValue({ fieldId: 'entity', value: Number(vendorId) }); } catch (_e) {}
                if (subsidiary) {
                    try { poRec.setValue({ fieldId: 'subsidiary', value: Number(subsidiary) }); } catch (_e) {}
                }
                if (repackId) {
                    try { poRec.setValue({ fieldId: 'custbody_cos_createdfromrepack', value: Number(repackId) }); } catch (_e) {}
                }

                // Lines
                vendorLines.forEach(l => {
                    const qty = toNum(l.qty);
                    if (!(qty > 0)) return;

                    try {
                        poRec.selectNewLine({ sublistId: 'item' });
                        poRec.setCurrentSublistValue({ sublistId: 'item', fieldId: 'item', value: Number(l.itemId) });
                        poRec.setCurrentSublistValue({ sublistId: 'item', fieldId: 'quantity', value: qty });

                        if (location) {
                            // Location can be line-level for PO
                            try { poRec.setCurrentSublistValue({ sublistId: 'item', fieldId: 'location', value: Number(location) }); } catch (_e) {}
                        }

                        // For now, set a safe default rate; later you can enhance to vendor cost.
                        try { poRec.setCurrentSublistValue({ sublistId: 'item', fieldId: 'rate', value: 1 }); } catch (_e) {}

                        poRec.commitLine({ sublistId: 'item' });
                    } catch (lineErr) {
                        try {
                            log.error({
                                title: 'COS Repack: PO line add failed',
                                details: JSON.stringify({ vendorId, itemId: l.itemId, qty, error: String(lineErr) })
                            });
                        } catch (_e) {}
                    }
                });

                const poId = poRec.save({ enableSourcing: true, ignoreMandatoryFields: false });
                results.push({ vendorId: vendorId, purchaseorderId: poId });
            } catch (e) {
                try {
                    log.error({ title: 'COS Repack: PO create failed', details: JSON.stringify({ vendorId, error: String(e) }) });
                } catch (_e) {}
                results.push({ vendorId: vendorId, purchaseorderId: null, error: String(e) });
            }
        });

        return results;
    }

    function setRepackWoCreatedFields(repackType, repackId, woIds) {
        const values = {};
        values[REPACK_STATUS_FIELDID] = REPACK_STATUS_WO_CREATED;

        // best-effort optional fields
        try { values[REPACK_CREATED_WO_IDS_FIELDID] = JSON.stringify(woIds || []); } catch (_e) {}
        try {
            // datetime field may not exist; if it does, submitFields accepts a Date
            values[REPACK_CREATED_WO_DATE_FIELDID] = new Date();
        } catch (_e) {}

        try {
            record.submitFields({
                type: repackType,
                id: repackId,
                values: values,
                options: { enableSourcing:false, ignoreMandatoryFields:true }
            });
        } catch (e) {
            // If optional fields don't exist, submitFields will throw; retry with only status
            try {
                record.submitFields({
                    type: repackType,
                    id: repackId,
                    values: { [REPACK_STATUS_FIELDID]: REPACK_STATUS_WO_CREATED },
                    options: { enableSourcing:false, ignoreMandatoryFields:true }
                });
            } catch (e2) {
                log.error({ title: 'COS Repack Create WO: failed updating repack status', details: e2 });
            }
        }
    }

    function onRequest(context) {
        const req = context.request;
        const repackId = req.parameters.repackid || req.parameters.id;
        const repackType = req.parameters.rectype || req.parameters.type;
        const action = (req.parameters.action || 'createWO').toString();

        if (!repackId || !repackType) {
            renderResultPage(context, 'COS Repack: Create Work Orders', `
                <div style="font-family:Arial;padding:12px;">
                  <div style="font-size:14px;font-weight:bold;margin-bottom:6px;">Missing Parameters</div>
                  <div style="color:#333;">Required: <code>repackid</code> and <code>rectype</code>.</div>
                </div>
            `);
            return;
        }

        if (action !== 'createWO') {
            renderResultPage(context, 'COS Repack: Create Work Orders', `
                <div style="font-family:Arial;padding:12px;">
                  <div style="font-size:14px;font-weight:bold;margin-bottom:6px;">Unsupported Action</div>
                  <div style="color:#333;">Action: <code>${htmlEscape(action)}</code></div>
                </div>
            `);
            return;
        }

        let repackRec;
        try {
            repackRec = record.load({ type: repackType, id: repackId, isDynamic: false });
        } catch (e) {
            renderResultPage(context, 'COS Repack: Create Work Orders', `
                <div style="font-family:Arial;padding:12px;">
                  <div style="font-size:14px;font-weight:bold;margin-bottom:6px;">Failed to load Repack</div>
                  <div style="color:#b00020;">${htmlEscape(String(e))}</div>
                </div>
            `);
            return;
        }

        // If already WO Created, or if WOs already exist, show list and stop.
        let repStatus = '';
        try { repStatus = repackRec.getValue({ fieldId: REPACK_STATUS_FIELDID }); } catch (_e) {}
        const repStatusStr = (repStatus === null || repStatus === undefined) ? '' : String(repStatus);

        const existing = findExistingWorkOrders(repackId);
        if (repStatusStr === REPACK_STATUS_WO_CREATED || (existing && existing.length)) {
            // Ensure status is set to 2 if WOs exist but status wasn't updated
            try {
                if (repStatusStr !== REPACK_STATUS_WO_CREATED && existing.length) {
                    setRepackWoCreatedFields(repackType, repackId, existing.map(x => x.id));
                }
            } catch (_e) {}

            const listHtml = (existing || []).map(x => `<li>WO <b>${htmlEscape(x.tranid || x.id)}</b> (ID: ${htmlEscape(x.id)})</li>`).join('');
            renderResultPage(context, 'COS Repack: Create Work Orders', `
                <div style="font-family:Arial;padding:12px;">
                  <div style="font-size:14px;font-weight:bold;margin-bottom:6px;">Work Orders already exist for this Repack</div>
                  <div style="margin:8px 0;">Repack ID: <code>${htmlEscape(repackId)}</code></div>
                  <ul>${listHtml || '<li>(none found)</li>'}</ul>
                  <div style="margin-top:12px;">
                    <a href="#" onclick="window.close();return false;">Close</a>
                  </div>
                </div>
            `);
            return;
        }

        // Build payload from saved repack fields
        const payload = buildWorkordersPayload(repackRec);

        // Validate against summary payload on the record
        const rawSummary = (function(){
            try { return repackRec.getValue({ fieldId: 'custrecord_cos_rep_summary_payload' }) || ''; } catch (_e) {}
            return '';
        })();

        const validationErrors = validateWorkordersPayload(payload, rawSummary);
        if (validationErrors && validationErrors.length) {
            try {
                log.error({ title: 'COS Repack Create WO: payload validation failed', details: JSON.stringify(validationErrors) });
            } catch (_e) {}

            const errHtml = validationErrors.map(e => `<li>${htmlEscape(typeof e === 'string' ? e : JSON.stringify(e))}</li>`).join('');
            renderResultPage(context, 'COS Repack: Create Work Orders', `
                <div style="font-family:Arial;padding:12px;">
                  <div style="font-size:14px;font-weight:bold;margin-bottom:6px;color:#b00020;">Validation failed. No Work Orders were created.</div>
                  <div style="margin:8px 0;">Repack ID: <code>${htmlEscape(repackId)}</code></div>
                  <ul style="color:#333;">${errHtml}</ul>
                  <div style="margin-top:12px;">
                    <a href="#" onclick="window.close();return false;">Close</a>
                  </div>
                </div>
            `);
            return;
        }

        // Repack flag: if checked, mark created Work Orders as WIP
        let repackMarkWip = false;
        try {
            const raw = repackRec.getValue({ fieldId: 'custrecord_cos_rep_wip' });
            repackMarkWip = (raw === true || raw === 'T' || raw === 'true');
        } catch (_e) {}

        // Create Work Orders
        let created;
        try {
            log.audit({ title: 'COS Repack Create WO: payload (debug)', details: JSON.stringify(payload) });
        } catch (_e) {}

        try {
            created = createWorkOrdersFromPayload(payload, repackMarkWip, repackId);
        } catch (e) {
            renderResultPage(context, 'COS Repack: Create Work Orders', `
                <div style="font-family:Arial;padding:12px;">
                  <div style="font-size:14px;font-weight:bold;margin-bottom:6px;color:#b00020;">Work Order creation failed.</div>
                  <div style="color:#333;">${htmlEscape(String(e))}</div>
                </div>
            `);
            return;
        }

        const woIds = (created || []).filter(x => x && x.workorderId).map(x => x.workorderId);
        // Update repack status to WO Created (2)
        setRepackWoCreatedFields(repackType, repackId, woIds);

        // Create Purchase Orders (optional; based on PO Section)
        let poSectionHtml = '';
        try {
            const poLines = buildPurchaseLinesFromSummary(repackRec);
            if (poLines && poLines.length) {
                const existingPos = findExistingPurchaseOrders(repackId);
                let poResults = [];
                let usedExisting = false;

                if (existingPos && existingPos.length) {
                    usedExisting = true;
                    poResults = existingPos.map(x => ({ vendorId: '', purchaseorderId: x.id, tranid: x.tranid }));
                } else {
                    const subsidiary = repackRec.getValue({ fieldId: 'custrecord_cos_rep_subsidiary' });
                    const location = repackRec.getValue({ fieldId: 'custrecord_cos_rep_location' });
                    poResults = createPurchaseOrdersFromLines(poLines, subsidiary, location, repackId);
                }

                const poRows = (poResults || []).map(r => {
                    const ok = r.purchaseorderId ? '✅' : '❌';
                    const label = r.tranid ? htmlEscape(r.tranid) : htmlEscape(String(r.purchaseorderId || ''));
                    const vend = r.vendorId ? (' (Vendor: ' + htmlEscape(String(r.vendorId)) + ')') : '';
                    return `<li>${ok} PO: <b>${label || '(unknown)'}</b> ID: <code>${htmlEscape(String(r.purchaseorderId || ''))}</code>${vend}${r.error ? ('<br/><span style="color:#b00020;">'+htmlEscape(r.error)+'</span>') : ''}</li>`;
                }).join('');

                poSectionHtml = `
                  <div style="margin-top:14px;padding-top:10px;border-top:1px solid #ddd;">
                    <div style="font-size:13px;font-weight:bold;margin-bottom:6px;">Purchase Order Creation Result${usedExisting ? ' (already existed)' : ''}</div>
                    <ul style="color:#333;">${poRows || '<li>(no results)</li>'}</ul>
                  </div>
                `;
            }
        } catch (e) {
            try { log.error({ title: 'COS Repack: PO creation block failed', details: e }); } catch (_e) {}
            poSectionHtml = `
              <div style="margin-top:14px;padding-top:10px;border-top:1px solid #ddd;">
                <div style="font-size:13px;font-weight:bold;margin-bottom:6px;color:#b00020;">Purchase Order creation failed.</div>
                <div style="color:#333;">${htmlEscape(String(e))}</div>
              </div>
            `;
        }


        // Render success page
        const rows = (created || []).map(r => {
            const ok = r.workorderId ? '✅' : '❌';
            return `<li>${ok} Output Item: <code>${htmlEscape(r.output_item_internalid || '')}</code> Qty: <code>${htmlEscape(r.output_item_quantity || '')}</code> → WO ID: <b>${htmlEscape(r.workorderId || '')}</b>${r.error ? ('<br/><span style="color:#b00020;">'+htmlEscape(r.error)+'</span>') : ''}</li>`;
        }).join('');

        renderResultPage(context, 'COS Repack: Create Work Orders', `
            <div style="font-family:Arial;padding:12px;">
              <div style="font-size:14px;font-weight:bold;margin-bottom:6px;">Work Order Creation Result</div>
              <div style="margin:8px 0;">Repack ID: <code>${htmlEscape(repackId)}</code></div>
              <ul style="color:#333;">${rows || '<li>(no results)</li>'}</ul>
              ${poSectionHtml}
              <div style="margin-top:12px;">
                <a href="#" onclick="window.close();return false;">Close</a>
              </div>
            </div>
        `);
    }

    function buildWorkordersPayload(newRecord) {
        // Read UI payloads (custpage fields) – available on submit context
        const rawSummary = firstNonEmptyString(
            newRecord.getValue({ fieldId: 'custpage_cos_summary_payload' }),
            newRecord.getValue({ fieldId: 'custrecord_cos_rep_summary_payload' }),
            ''
        );
        const rawLots = firstNonEmptyString(
            newRecord.getValue({ fieldId: 'custpage_cos_input_lots_payload' }),
            newRecord.getValue({ fieldId: 'custrecord_cos_rep_input_lots_payload' }),
            ''
        );

        const summary = safeParseJson(rawSummary) || {};
        const lotsMap = safeParseJson(rawLots) || {};

        const outputs = Array.isArray(summary.outputs) ? summary.outputs : [];
        const inputs = Array.isArray(summary.inputs) ? summary.inputs : [];
        const purchase = Array.isArray(summary.purchase) ? summary.purchase : [];

        const subsidiary = newRecord.getValue({ fieldId: 'custrecord_cos_rep_subsidiary' });
        const location = newRecord.getValue({ fieldId: 'custrecord_cos_rep_location' });

        // Fetch conversions for any item we may touch
        const itemIds = [];
        outputs.forEach(o => { if (o && o.id) itemIds.push(String(o.id)); });
        inputs.forEach(i => { if (i && i.id) itemIds.push(String(i.id)); });
        purchase.forEach(p => { if (p && p.id) itemIds.push(String(p.id)); });

        const convMap = fetchConversionMap(itemIds);

        function prorateLotsForAllocation(lotsArr, allocQty, totalQty) {
            try {
                if (!Array.isArray(lotsArr) || !lotsArr.length) return [];
                const tq = toNum(totalQty);
                const aq = toNum(allocQty);
                if (!(tq > 0) || !(aq > 0)) return [];
                const ratio = aq / tq;

                const out = [];
                let running = 0;
                for (let i = 0; i < lotsArr.length; i++) {
                    const l = lotsArr[i] || {};
                    const origQ = toNum(l.qty);
                    if (!(origQ > 0)) continue;

                    let q = (i === lotsArr.length - 1) ? (aq - running) : round6(origQ * ratio);
                    q = round6(q);
                    running = round6(running + q);
                    if (q <= 0) continue;

                    out.push(Object.assign({}, l, { qty: q }));
                }

                if (!out.length && lotsArr.length) {
                    const l0 = lotsArr[0] || {};
                    out.push(Object.assign({}, l0, { qty: aq }));
                }
                return out;
            } catch (e) {
                return [];
            }
        }

        // Output requirements (Qty × Conversion). If conversion missing, fallback to qty-only share.
        const outReq = outputs.map((o) => {
            const outId = o && o.id ? String(o.id) : '';
            const qty = toNum(o && o.qty);
            const conv = convMap[outId] || 0;
            const req = (conv > 0) ? (qty * conv) : qty;
            return { outId, qty, conv, req };
        }).filter(x => x.outId);

        const totalReq = outReq.reduce((a, b) => a + toNum(b.req), 0);
        const shares = {};
        outReq.forEach((o) => {
            shares[o.outId] = totalReq > 0 ? (toNum(o.req) / totalReq) : 0;
        });

        // Allocate each SOURCE (inventory inputs + purchase lines) across outputs using OUTPUT SHARES.
        // IMPORTANT: allocation is done by weight (Qty × Conversion) then converted back to qty per source item.
        // Rounding: round to 6dp and adjust last output per source to keep totals matching (in weight domain).
        const allocationsInvByOut = {}; // outId -> [ {input_item_internalid, input_item_quantity, input_item_lots } ]
        const allocationsPoByOut = {};  // outId -> [ {po_item_internalid, po_item_quantity } ]
        outReq.forEach(o => {
            allocationsInvByOut[o.outId] = [];
            allocationsPoByOut[o.outId] = [];
        });

        function allocateSourceAcrossOutputs(srcId, srcQty, srcLotsArr, isPurchase) {
            const outIds = outReq.map(o => o.outId);
            if (!outIds.length) return;

            const totalQty = toNum(srcQty);
            if (!(totalQty > 0)) return;

            // Allocate source QTY across outputs by output shares.
            // Use higher precision during allocation to reduce 0-qty rounding artifacts that can drop component lines.
            // Final qty is still stored as a number (NetSuite will apply its own precision rules based on the item's unit type).
            let runningQty = 0;

            outIds.forEach((outId, idx) => {
                const isLast = (idx === outIds.length - 1);

                let allocQty = 0;

                if (isLast) {
                    allocQty = round9(totalQty - runningQty);
                } else {
                    allocQty = round9(totalQty * (shares[outId] || 0));
                }

                allocQty = round9(allocQty);
                if (allocQty <= 0) return;

                runningQty = round9(runningQty + allocQty);

                if (isPurchase) {
                    allocationsPoByOut[outId].push({
                        po_item_internalid: Number(srcId),
                        po_item_quantity: allocQty
                    });
                } else {
                    allocationsInvByOut[outId].push({
                        input_item_internalid: Number(srcId),
                        input_item_quantity: allocQty,
                        input_item_lots: prorateLotsForAllocation((Array.isArray(srcLotsArr) ? srcLotsArr : []), allocQty, totalQty)
                    });
                }
            });
        }

        // Inventory inputs
        inputs.forEach((inp) => {
            const inputId = inp && inp.id ? String(inp.id) : '';
            if (!inputId) return;
            allocateSourceAcrossOutputs(
                inputId,
                inp.qty,
                (Array.isArray(lotsMap[inputId]) ? lotsMap[inputId] : []),
                false
            );
        });

        // Purchase lines (no lots)
        purchase.forEach((po) => {
            const poId = po && po.id ? String(po.id) : '';
            if (!poId) return;
            allocateSourceAcrossOutputs(poId, po.qty, [], true);
        });

        const workorders = outReq.map((o) => {
            return {
                subsidiary: subsidiary ? Number(subsidiary) : subsidiary,
                location: location ? Number(location) : location,
                output_item_internalid: Number(o.outId),
                output_item_quantity: o.qty,
                inputs: allocationsInvByOut[o.outId] || [],
                purchase: allocationsPoByOut[o.outId] || []
            };
        });

        return { workorders: workorders };
    }


    /**
     * Lightweight server-side validator for the workorders payload.
     * NOTE: afterSubmit runs AFTER the record is saved; this validator is for logging/debugging and safety checks
     * before you wire this into transaction creation.
     */
    function validateWorkordersPayload(payload, rawSummary) {
        const errors = [];
        const addErr = (code, msg, data) => {
            errors.push({ code: code, message: msg, data: data || {} });
        };

        const summary = safeParseJson(rawSummary) || {};
        const summaryInputs = Array.isArray(summary.inputs) ? summary.inputs : [];
        const summaryOutputs = Array.isArray(summary.outputs) ? summary.outputs : [];
        const summaryPurchase = Array.isArray(summary.purchase) ? summary.purchase
            : (Array.isArray(summary.purchaseOrder) ? summary.purchaseOrder
                : (Array.isArray(summary.po) ? summary.po : []));

        if (!payload || typeof payload !== 'object') {
            addErr('PAYLOAD_MISSING', 'Payload is missing or not an object.');
            return errors;
        }

        const workorders = Array.isArray(payload.workorders) ? payload.workorders : [];
        log.debug("workorders", workorders);
        if (!workorders.length) {
            addErr('WORKORDERS_EMPTY', 'Payload.workorders is empty.');
            return errors;
        }

        // Basic shape validation
        workorders.forEach((wo, idx) => {
            const path = 'workorders[' + idx + ']';
            if (!wo || typeof wo !== 'object') {
                addErr('WO_NOT_OBJECT', path + ' is not an object.');
                return;
            }

            if (wo.subsidiary === '' || wo.subsidiary === null || typeof wo.subsidiary === 'undefined') {
                addErr('WO_SUBSIDIARY_MISSING', path + '.subsidiary is missing.');
            }
            if (wo.location === '' || wo.location === null || typeof wo.location === 'undefined') {
                addErr('WO_LOCATION_MISSING', path + '.location is missing.');
            }

            const outId = toNum(wo.output_item_internalid);
            if (!(outId > 0)) {
                addErr('WO_OUTPUT_ID_INVALID', path + '.output_item_internalid must be a positive number.', { value: wo.output_item_internalid });
            }

            const outQty = toNum(wo.output_item_quantity);
            if (!(outQty > 0)) {
                addErr('WO_OUTPUT_QTY_INVALID', path + '.output_item_quantity must be > 0.', { value: wo.output_item_quantity });
            }

            if (!Array.isArray(wo.inputs)) {
                addErr('WO_INPUTS_NOT_ARRAY', path + '.inputs must be an array.');
            } else if (!wo.inputs.length) {
                addErr('WO_INPUTS_EMPTY', path + '.inputs is empty.');
            } else {
                wo.inputs.forEach((inp, jdx) => {
                    const ipath = path + '.inputs[' + jdx + ']';
                    if (!inp || typeof inp !== 'object') {
                        addErr('INPUT_NOT_OBJECT', ipath + ' is not an object.');
                        return;
                    }
                    const inId = toNum(inp.input_item_internalid);
                    if (!(inId > 0)) {
                        addErr('INPUT_ID_INVALID', ipath + '.input_item_internalid must be a positive number.', { value: inp.input_item_internalid });
                    }
                    const inQty = toNum(inp.input_item_quantity);
                    if (!(inQty >= 0)) {
                        addErr('INPUT_QTY_INVALID', ipath + '.input_item_quantity must be >= 0.', { value: inp.input_item_quantity });
                    }
                    if (typeof inp.input_item_lots !== 'undefined' && !Array.isArray(inp.input_item_lots)) {
                        addErr('INPUT_LOTS_NOT_ARRAY', ipath + '.input_item_lots must be an array when present.', { valueType: typeof inp.input_item_lots });
                    }
                });
            }

            // Optional: validate PO lines if provided
            if (typeof wo.purchase !== 'undefined') {
                if (!Array.isArray(wo.purchase)) {
                    addErr('WO_PURCHASE_NOT_ARRAY', path + '.purchase must be an array when present.');
                } else {
                    wo.purchase.forEach((p, kdx) => {
                        const ppath = path + '.purchase[' + kdx + ']';
                        if (!p || typeof p !== 'object') {
                            addErr('PO_NOT_OBJECT', ppath + ' is not an object.');
                            return;
                        }
                        const pid = toNum(p.po_item_internalid);
                        if (!(pid > 0)) {
                            addErr('PO_ID_INVALID', ppath + '.po_item_internalid must be a positive number.', { value: p.po_item_internalid });
                        }
                        const pq = toNum(p.po_item_quantity);
                        if (!(pq >= 0)) {
                            addErr('PO_QTY_INVALID', ppath + '.po_item_quantity must be >= 0.', { value: p.po_item_quantity });
                        }
                    });
                }
            }


            // Guard: at least one positive component (inventory input or PO line) must exist per WO
            // Otherwise this WO will be created with no components because component-creation skips qty<=0 lines.
            try {
                const posInv = (Array.isArray(wo.inputs) ? wo.inputs : []).some(x => toNum(x && x.input_item_quantity) > 0);
                const posPo  = (Array.isArray(wo.purchase) ? wo.purchase : []).some(x => toNum(x && x.po_item_quantity) > 0);
                if (!posInv && !posPo) {
                    addErr('WO_NO_POSITIVE_COMPONENTS', path + ' has no positive component quantities (inputs/purchase).', {
                        output_item_internalid: wo.output_item_internalid
                    });
                }
            } catch (_e) {}

        });

        // Reconciliation checks (container-level totals)
        // 1) Total input containers in summary should match total allocated input containers across all workorders (by input item).
        const expectedByInput = {};
        summaryInputs.forEach((i) => {
            const id = i && i.id ? String(i.id) : '';
            if (!id) return;
            expectedByInput[id] = round6(toNum(expectedByInput[id]) + toNum(i.qty));
        });

        const actualByInput = {};
        workorders.forEach((wo) => {
            (Array.isArray(wo.inputs) ? wo.inputs : []).forEach((inp) => {
                const id = inp && inp.input_item_internalid ? String(inp.input_item_internalid) : '';
                if (!id) return;
                actualByInput[id] = round6(toNum(actualByInput[id]) + toNum(inp.input_item_quantity));
            });
        });

        Object.keys(expectedByInput).forEach((id) => {
            const exp = round6(toNum(expectedByInput[id]));
            const act = round6(toNum(actualByInput[id]));
            if (Math.abs(exp - act) > 0.000001) {
                addErr('INPUT_TOTAL_MISMATCH', 'Allocated total for input item ' + id + ' does not match summary input qty.', {
                    input_item_internalid: Number(id),
                    expected_qty: exp,
                    actual_allocated_qty: act
                });
            }
        });

        // 1b) Total PO qty in summary should match total allocated PO qty across all workorders (by PO item).
        const expectedByPo = {};
        summaryPurchase.forEach((p) => {
            const id = p && p.id ? String(p.id) : '';
            if (!id) return;
            expectedByPo[id] = round6(toNum(expectedByPo[id]) + toNum(p.qty));
        });

        const actualByPo = {};
        workorders.forEach((wo) => {
            (Array.isArray(wo.purchase) ? wo.purchase : []).forEach((p) => {
                const id = p && p.po_item_internalid ? String(p.po_item_internalid) : '';
                if (!id) return;
                actualByPo[id] = round6(toNum(actualByPo[id]) + toNum(p.po_item_quantity));
            });
        });

        Object.keys(expectedByPo).forEach((id) => {
            const exp = round6(toNum(expectedByPo[id]));
            const act = round6(toNum(actualByPo[id]));
            if (Math.abs(exp - act) > 0.000001) {
                addErr('PO_TOTAL_MISMATCH', 'Allocated total for PO item ' + id + ' does not match summary PO qty.', {
                    po_item_internalid: Number(id),
                    expected_qty: exp,
                    actual_allocated_qty: act
                });
            }
        });


        // 2) Total output qty should match summary outputs (by output item).
        const expectedByOutput = {};
        summaryOutputs.forEach((o) => {
            const id = o && o.id ? String(o.id) : '';
            if (!id) return;
            expectedByOutput[id] = round6(toNum(expectedByOutput[id]) + toNum(o.qty));
        });

        const actualByOutput = {};
        workorders.forEach((wo) => {
            const id = wo && wo.output_item_internalid ? String(wo.output_item_internalid) : '';
            if (!id) return;
            actualByOutput[id] = round6(toNum(actualByOutput[id]) + toNum(wo.output_item_quantity));
        });

        Object.keys(expectedByOutput).forEach((id) => {
            const exp = round6(toNum(expectedByOutput[id]));
            const act = round6(toNum(actualByOutput[id]));
            if (Math.abs(exp - act) > 0.000001) {
                addErr('OUTPUT_TOTAL_MISMATCH', 'Workorder output qty for item ' + id + ' does not match summary output qty.', {
                    output_item_internalid: Number(id),
                    expected_qty: exp,
                    actual_qty: act
                });
            }
        });

        // Helpful debug marker
        try { log.debug({ title: 'COS Repack: validator result', details: JSON.stringify({ errorCount: errors.length }) }); } catch (_e) {}

        return errors;
    }
    /**
     * Persist UI payloads from custpage hidden fields into real record fields so they survive reloads.
     * Also enrich the Summary payload so VIEW mode can rebuild the Repack Summary without needing client-side calculations.
     */
    const beforeSubmit = (context) => {
        try {
            const rec = context.newRecord;
            const type = (context.type || '').toString();

            // Only relevant for create/edit/xedit (ignore delete)
            if (type === context.UserEventType.DELETE) return;

            const rawSummary = rec.getValue({ fieldId: 'custpage_cos_summary_payload' });
            const rawLots = rec.getValue({ fieldId: 'custpage_cos_input_lots_payload' });

            // If custpage fields are unavailable (csv/web services), fall back to existing stored payloads
            const summaryStr = firstNonEmptyString(
                rawSummary,
                rec.getValue({ fieldId: 'custrecord_cos_rep_summary_payload' }),
                ''
            );const lotsStr = firstNonEmptyString(
                rawLots,
                rec.getValue({ fieldId: 'custrecord_cos_rep_input_lots_payload' }),
                ''
            );const summary = safeParseJson(summaryStr) || {};
            const lotsMap = safeParseJson(lotsStr) || {};

            // Enrich summary if it looks like a valid snapshot (has outputs/inputs arrays)
            let finalSummaryStr = summaryStr;
            try {
                const outputs = Array.isArray(summary.outputs) ? summary.outputs : [];
                const inputs = Array.isArray(summary.inputs) ? summary.inputs : [];
                const purchases = Array.isArray(summary.purchase) ? summary.purchase : (Array.isArray(summary.purchaseOrder) ? summary.purchaseOrder : []);

                if (outputs.length || inputs.length || purchases.length) {
                    const subsidiary = rec.getValue({ fieldId: 'custrecord_cos_rep_subsidiary' }) || '';
                    const location = rec.getValue({ fieldId: 'custrecord_cos_rep_location' }) || '';
                    const species = rec.getValue({ fieldId: 'custrecord_cos_rep_species' }) || '';

                    // Gather itemIds for conversion lookup
                    const itemIds = [];
                    outputs.forEach(o => { if (o && o.id) itemIds.push(String(o.id)); });
                    inputs.forEach(i => { if (i && i.id) itemIds.push(String(i.id)); });
                    purchases.forEach(p => { if (p && p.id) itemIds.push(String(p.id)); });

                    const convMap = fetchConversionMap(itemIds);

                    function prorateLotsForAllocation(lotsArr, allocQty, totalQty) {
                        try {
                            if (!Array.isArray(lotsArr) || !lotsArr.length) return [];
                            const tq = toNum(totalQty);
                            const aq = toNum(allocQty);
                            if (!(tq > 0) || !(aq > 0)) return [];
                            const ratio = aq / tq;

                            const out = [];
                            let running = 0;
                            for (let i = 0; i < lotsArr.length; i++) {
                                const l = lotsArr[i] || {};
                                const origQ = toNum(l.qty);
                                if (!(origQ > 0)) continue;

                                let q = (i === lotsArr.length - 1) ? (aq - running) : round6(origQ * ratio);
                                q = round6(q);
                                running = round6(running + q);
                                if (q <= 0) continue;

                                out.push(Object.assign({}, l, { qty: q }));
                            }

                            if (!out.length && lotsArr.length) {
                                const l0 = lotsArr[0] || {};
                                out.push(Object.assign({}, l0, { qty: aq }));
                            }
                            return out;
                        } catch (e) {
                            return [];
                        }
                    }


                    // Compute output requirements + shares (same logic used for WO allocation)
                    const outReq = outputs.map((o) => {
                        const outId = o && o.id ? String(o.id) : '';
                        const qty = toNum(o && o.qty);
                        const conv = convMap[outId] || 0;
                        const req = (conv > 0) ? (qty * conv) : qty;
                        return { outId, qty, conv, req };
                    }).filter(x => x.outId);

                    const totalReq = outReq.reduce((a, b) => a + toNum(b.req), 0);
                    const shares = {};
                    outReq.forEach((o) => {
                        shares[o.outId] = totalReq > 0 ? (toNum(o.req) / totalReq) : 0;
                    });

                    // Build allocations map: output -> input -> allocatedQty
                    const allocations = {}; // { [outId]: { [inputId]: qty } }
                    outReq.forEach(o => { allocations[o.outId] = {}; });

                    inputs.forEach((inp) => {
                        const inputId = inp && inp.id ? String(inp.id) : '';
                        if (!inputId) return;
                        const inputQty = toNum(inp.qty);
                        const outIds = outReq.map(o => o.outId);
                        if (!outIds.length) return;

                        let running = 0;
                        outIds.forEach((outId, idx) => {
                            const isLast = (idx === outIds.length - 1);
                            let alloc = isLast ? (inputQty - running) : round6(inputQty * (shares[outId] || 0));
                            alloc = round6(alloc);
                            running = round6(running + alloc);
                            allocations[outId][inputId] = alloc;
                        });
                    });

                    // Build purchase allocations map: output -> purchaseItem -> allocatedQty
                    const purchaseAllocations = {}; // { [outId]: { [purchaseItemId]: qty } }
                    outReq.forEach(o => { purchaseAllocations[o.outId] = {}; });

                    purchases.forEach((p) => {
                        const purchaseId = p && p.id ? String(p.id) : '';
                        if (!purchaseId) return;
                        const purchaseQty = toNum(p.qty);
                        const outIds = outReq.map(o => o.outId);
                        if (!outIds.length) return;

                        let running = 0;
                        outIds.forEach((outId, idx) => {
                            const isLast = (idx === outIds.length - 1);
                            let alloc = isLast ? (purchaseQty - running) : round6(purchaseQty * (shares[outId] || 0));
                            alloc = round6(alloc);
                            running = round6(running + alloc);
                            purchaseAllocations[outId][purchaseId] = alloc;
                        });
                    });

                    // Attach conversions + computed fields onto summary arrays (non-breaking additive fields)
                    const outputsEnriched = outputs.map((o) => {
                        const id = o && o.id ? String(o.id) : '';
                        const qty = toNum(o && o.qty);
                        const conv = convMap[id] || 0;
                        const req = (conv > 0) ? (qty * conv) : qty;
                        return Object.assign({}, o, {
                            id,
                            qty: (o && o.qty != null ? o.qty : ''),
                            conversion: conv,
                            requirement: round6(req),
                            share: round6(shares[id] || 0)
                        });
                    });

                    const inputsEnriched = inputs.map((i) => {
                        const id = i && i.id ? String(i.id) : '';
                        const qty = toNum(i && i.qty);
                        const conv = convMap[id] || 0;
                        return Object.assign({}, i, {
                            id,
                            qty: (i && i.qty != null ? i.qty : ''),
                            conversion: conv,
                            qty_num: round6(qty),
                            lotCount: Array.isArray(lotsMap[id]) ? lotsMap[id].length : 0
                        });
                    });

                    const purchasesEnriched = purchases.map((p) => {
                        const id = p && p.id ? String(p.id) : '';
                        const qty = toNum(p && p.qty);
                        const conv = convMap[id] || 0;
                        return Object.assign({}, p, {
                            id,
                            qty: (p && p.qty != null ? p.qty : ''),
                            conversion: conv,
                            qty_num: round6(qty)
                        });
                    });

                    const enriched = Object.assign({}, summary, {
                        meta: Object.assign({}, (summary.meta || {}), {
                            speciesId: String(species || ''),
                            locationId: String(location || ''),
                            subsidiaryId: String(subsidiary || ''),
                            enrichedAt: (new Date()).toISOString()
                        }),
                        outputs: outputsEnriched,
                        inputs: inputsEnriched,
                        purchase: purchasesEnriched,
                        distribution: {
                            method: 'prorated',
                            totalRequirement: round6(totalReq),
                            shares: shares,
                            allocations: allocations,
                            purchaseAllocations: purchaseAllocations
                        }
                    });

                    finalSummaryStr = JSON.stringify(enriched);
                }
            } catch (_enrichErr) {
                // If anything goes wrong, keep the original summary string (do not block save)
                finalSummaryStr = summaryStr;
            }

            // Persist into real record fields
            if (finalSummaryStr !== null && finalSummaryStr !== undefined && String(finalSummaryStr).trim().length) {
                try { rec.setValue({ fieldId: 'custrecord_cos_rep_summary_payload', value: finalSummaryStr }); } catch (_e) {}
            }
            if (lotsStr !== null && lotsStr !== undefined && String(lotsStr).trim().length) {
                try { rec.setValue({ fieldId: 'custrecord_cos_rep_input_lots_payload', value: lotsStr }); } catch (_e) {}
            }

            // Helpful debug marker (log final output)
            try {
                log.debug({
                    title: 'COS Repack: beforeSubmit persisted/enriched payloads',
                    details: JSON.stringify({
                        summaryLen: String(finalSummaryStr || '').length,
                        lotsLen: String(lotsStr || '').length,
                        enriched: String(finalSummaryStr || '').indexOf('"distribution"') >= 0
                    })
                });
            } catch (_e) {}
        } catch (e) {
            try { log.error({ title: 'COS Repack: beforeSubmit failed', details: e }); } catch (_e) {}
        }
    };

    function createWorkOrdersFromPayload(payload, markWorkordersAsWip, repackId) {
        const results = [];
        const workorders = (payload && payload.workorders) ? payload.workorders : [];

// Normalize flag (checkbox fields can sometimes come through as true/false or 'T'/'F')
        markWorkordersAsWip = (markWorkordersAsWip === true || markWorkordersAsWip === 'T' || markWorkordersAsWip === 'true');


        workorders.forEach((woObj, idx) => {
            const contextInfo = { index: idx, output_item_internalid: woObj && woObj.output_item_internalid };
            try {
                const woRec = record.create({ type: record.Type.WORK_ORDER, isDynamic: true });

                // Header fields (set subsidiary first, then item)
                if (woObj.subsidiary) {
                    try { woRec.setValue({ fieldId: 'subsidiary', value: Number(woObj.subsidiary) }); } catch (_e) {}
                }

                // Required scheduling fields
                try { woRec.setValue({ fieldId: 'enddate', value: new Date() }); } catch (_e) {}





                // Mark as WIP if requested on the Repack record
                if (markWorkordersAsWip) {
                    try { woRec.setValue({ fieldId: 'iswip', value: true }); } catch (_e) {
                        // Defensive: some accounts may expose a different field id
                        try { woRec.setValue({ fieldId: 'isWip', value: true }); } catch (_e2) {}
                        try { woRec.setValue({ fieldId: 'usewip', value: true }); } catch (_e3) {}
                    }
                }
// Work Order status
                try { woRec.setValue({ fieldId: 'orderstatus', value: 'B' }); } catch (_e) {}
// Work Order item field is commonly 'assemblyitem' (preferred); some accounts expose 'item'.
                try {
                    woRec.setValue({ fieldId: 'assemblyitem', value: Number(woObj.output_item_internalid) });
                } catch (_e) {
                    woRec.setValue({ fieldId: 'item', value: Number(woObj.output_item_internalid) });
                }

                log.debug("woObj", woObj)
                log.debug("woObj.location", woObj.location)
                if (woObj.location) {
                    try {
                        log.debug("location1 successfully set as " + woObj.location)
                        woRec.setValue({ fieldId: 'location', value: Number(woObj.location) });
                        log.debug("location2 successfully set as " + woObj.location)
                    } catch (_e) {}
                }

                woRec.setValue({ fieldId: 'quantity', value: Number(woObj.output_item_quantity) });

                if (repackId)
                {
                    try
                    {
                        woRec.setValue({ fieldId: 'custbody_cos_createdfromrepack', value: Number(repackId) });
                    }
                    catch(e)
                    {
                        log.error("ERROR in retrieving and setting WO repack internalid", e)
                    }
                }


                // Components (wipe defaults, then repopulate from payload)
                /*
                // Components (wipe defaults, then repopulate from payload)
                try {
                    const existingLineCount = woRec.getLineCount({ sublistId: 'item' }) || 0;
                    for (let i = existingLineCount - 1; i >= 0; i--) {
                        try { woRec.removeLine({ sublistId: 'item', line: i, ignoreRecalc: true }); } catch (_e) {}
                    }
                } catch (_e) {}
                */

                // Components
                // Inventory-driven inputs stay in woObj.inputs; Purchase Order lines stay in woObj.purchase.
                // PO lines MUST be added as unique component lines (aggregated by item).
                const invInputs = (woObj && Array.isArray(woObj.inputs)) ? woObj.inputs : [];

                // Aggregate PO lines by item (unique component per PO item)
                const poLinesRaw = (woObj && Array.isArray(woObj.purchase)) ? woObj.purchase : [];
                const poInputsMap = {};
                poLinesRaw.forEach((p) => {
                    if (!p) return;
                    const itemIdStr = (p.po_item_internalid != null) ? String(p.po_item_internalid) : '';
                    if (!itemIdStr) return;

                    const qty = toNum(p.po_item_quantity);
                    if (!(qty > 0)) return;

                    if (!poInputsMap[itemIdStr]) {
                        poInputsMap[itemIdStr] = {
                            item_internalid: Number(p.po_item_internalid),
                            quantity: 0
                        };
                    }
                    poInputsMap[itemIdStr].quantity = round6(toNum(poInputsMap[itemIdStr].quantity) + qty);
                });
                const poInputs = Object.keys(poInputsMap).map((k) => poInputsMap[k]);

                // Build an index of existing component lines (BOM/revision suggested) by item id
                const existingLineCount2 = (() => {
                    try { return woRec.getLineCount({ sublistId: 'item' }) || 0; } catch (e) { return 0; }
                })();

                const lineByItemId = {};
                for (let ln = 0; ln < existingLineCount2; ln++) {
                    try {
                        const itemId = woRec.getSublistValue({ sublistId: 'item', fieldId: 'item', line: ln });
                        if (itemId) lineByItemId[String(itemId)] = ln;
                    } catch (_e) {}
                }

                function tryPopulateLineInventoryDetail(lotsArr, ctx) {
                    const _ctx = ctx || {};
                    const lotsCount = Array.isArray(lotsArr) ? lotsArr.length : 0;
                    try {
                        log.debug({
                            title: 'COS Repack: tryPopulateLineInventoryDetail start',
                            details: JSON.stringify({ ..._ctx, lotsCount })
                        });
                    } catch (_e) {}

                    if (!Array.isArray(lotsArr) || !lotsArr.length) {
                        try { log.debug({ title: 'COS Repack: no lots to assign', details: JSON.stringify(_ctx) }); } catch (_e) {}
                        return;
                    }

                    try {
                        let invDet = null;
                        let invFieldUsed = null;

                        try {
                            invDet = woRec.getCurrentSublistSubrecord({ sublistId: 'item', fieldId: 'inventorydetail' });
                            invFieldUsed = 'inventorydetail';
                        } catch (e1) {
                            try {
                                log.debug({
                                    title: 'COS Repack: inventorydetail subrecord not available',
                                    details: JSON.stringify({ ..._ctx, error: String(e1) })
                                });
                            } catch (_e) {}
                        }

                        if (!invDet) {
                            try {
                                invDet = woRec.getCurrentSublistSubrecord({ sublistId: 'item', fieldId: 'componentinventorydetail' });
                                invFieldUsed = 'componentinventorydetail';
                            } catch (e2) {
                                try {
                                    log.debug({
                                        title: 'COS Repack: componentinventorydetail subrecord not available',
                                        details: JSON.stringify({ ..._ctx, error: String(e2) })
                                    });
                                } catch (_e) {}
                            }
                        }

                        if (!invDet) {
                            try {
                                log.error({
                                    title: 'COS Repack: NO inventory detail subrecord on this component line',
                                    details: JSON.stringify(_ctx)
                                });
                            } catch (_e) {}
                            return;
                        }

                        try {
                            log.debug({
                                title: 'COS Repack: inventory detail subrecord acquired',
                                details: JSON.stringify({ ..._ctx, invFieldUsed })
                            });
                        } catch (_e) {}

                        // Clear existing assignments
                        try {
                            const c = invDet.getLineCount({ sublistId: 'inventoryassignment' }) || 0;
                            for (let i = c - 1; i >= 0; i--) {
                                try { invDet.removeLine({ sublistId: 'inventoryassignment', line: i, ignoreRecalc: true }); } catch (_e) {}
                            }
                            try {
                                log.debug({
                                    title: 'COS Repack: cleared inventoryassignment lines',
                                    details: JSON.stringify({ ..._ctx, cleared: c })
                                });
                            } catch (_e) {}
                        } catch (eclr) {
                            try {
                                log.debug({
                                    title: 'COS Repack: failed clearing inventoryassignment',
                                    details: JSON.stringify({ ..._ctx, error: String(eclr) })
                                });
                            } catch (_e) {}
                        }

                        let assignedLines = 0;

                        // Ensure lots sum matches component qty (best effort)
                        const targetQty = Number((_ctx && _ctx.qty) || 0);
                        if (targetQty > 0) {
                            try {
                                let sum = 0;
                                for (let i = 0; i < lotsArr.length; i++) sum += Number((lotsArr[i] && lotsArr[i].qty) || 0);
                                const diff = Math.round((targetQty - sum) * 1000000) / 1000000;
                                if (Math.abs(diff) > 0.000001) {
                                    for (let j = lotsArr.length - 1; j >= 0; j--) {
                                        const q0 = Number((lotsArr[j] && lotsArr[j].qty) || 0);
                                        if (q0 > 0) {
                                            lotsArr[j].qty = Math.round((q0 + diff) * 1000000) / 1000000;
                                            break;
                                        }
                                    }
                                    try {
                                        log.debug({ title: 'COS Repack: lot qty adjusted to match component qty', details: JSON.stringify({ ..._ctx, targetQty, sumBefore: sum, diff }) });
                                    } catch (_e) {}
                                }
                            } catch (_e) {}
                        }

                        lotsArr.forEach((l, idx) => {
                            if (!l) return;
                            const q = Number(l.qty || 0);
                            if (!(q > 0)) return;

                            const key = String(l.key || '');
                            const parts = key ? key.split('|') : [];
                            const lotId = parts[0] ? Number(parts[0]) : null;
                            const binId = parts[1] ? Number(parts[1]) : null;
                            const statusId = parts[2] ? Number(parts[2]) : null;

                            try {
                                invDet.selectNewLine({ sublistId: 'inventoryassignment' });

                                let lotFieldUsed = null;
                                if (lotId) {
                                    const lotFieldCandidates = ['issueinventorynumber', 'inventorynumber', 'receiptinventorynumber'];
                                    for (let lf = 0; lf < lotFieldCandidates.length; lf++) {
                                        const fid = lotFieldCandidates[lf];
                                        try {
                                            invDet.setCurrentSublistValue({ sublistId: 'inventoryassignment', fieldId: fid, value: lotId });
                                            // Verify it "sticks" (some fieldIds will silently reject)
                                            try {
                                                const v = invDet.getCurrentSublistValue({ sublistId: 'inventoryassignment', fieldId: fid });
                                                if (v) { lotFieldUsed = fid; break; }
                                            } catch (_v) {
                                                // If getCurrentSublistValue isn't available, assume set succeeded
                                                lotFieldUsed = fid; break;
                                            }
                                        } catch (_e) {}
                                    }
                                }
                                if (binId) {
                                    try { invDet.setCurrentSublistValue({ sublistId: 'inventoryassignment', fieldId: 'binnumber', value: binId }); } catch (_e) {}
                                }
                                if (statusId) {
                                    try { invDet.setCurrentSublistValue({ sublistId: 'inventoryassignment', fieldId: 'inventorystatus', value: statusId }); } catch (_e) {}
                                }

                                invDet.setCurrentSublistValue({ sublistId: 'inventoryassignment', fieldId: 'quantity', value: q });
                                invDet.commitLine({ sublistId: 'inventoryassignment' });
                                assignedLines++;

                                try {
                                    log.debug({
                                        title: 'COS Repack: inventoryassignment committed',
                                        details: JSON.stringify({ ..._ctx, idx, key, qty: q, lotId, binId, statusId, lotFieldUsed })
                                    });
                                } catch (_e) {}
                            } catch (eas) {
                                try {
                                    log.error({
                                        title: 'COS Repack: inventoryassignment add failed',
                                        details: JSON.stringify({ ..._ctx, idx, key, qty: q, error: String(eas) })
                                    });
                                } catch (_e) {}
                            }
                        });

                        try {
                            log.debug({
                                title: 'COS Repack: tryPopulateLineInventoryDetail done',
                                details: JSON.stringify({ ..._ctx, invFieldUsed, assignedLines })
                            });
                        } catch (_e) {}
                    } catch (e) {
                        try {
                            log.error({
                                title: 'COS Repack: tryPopulateLineInventoryDetail exception',
                                details: JSON.stringify({ ..._ctx, error: String(e) })
                            });
                        } catch (_e) {}
                    }
                }

                invInputs.forEach((inp) => {
                    if (!inp || !inp.input_item_internalid) return;
                    const qty = Number(inp.input_item_quantity || 0);
                    if (qty <= 0) return;

                    const itemIdStr = String(inp.input_item_internalid);
                    const lotsArr = Array.isArray(inp.input_item_lots) ? inp.input_item_lots : [];

                    try {
                        if (lineByItemId[itemIdStr] != null) {
                            woRec.selectLine({ sublistId: 'item', line: Number(lineByItemId[itemIdStr]) });

                            // // Blank out allocation strategies (value 2)
                            // try { woRec.setCurrentSublistValue({ sublistId: 'item', fieldId: 'defaultorderallocationstrategy', value: "" }); } catch (_e) {}
                            // try { woRec.setCurrentSublistValue({ sublistId: 'item', fieldId: 'orderallocationstrategy', value: "" }); } catch (_e) {}

                            try {
                                log.debug({ title: 'COS Repack: setting component qty', details: JSON.stringify({ ...contextInfo, itemId: itemIdStr, qty, lineMode: (lineByItemId[itemIdStr] != null) ? 'existing' : 'new' }) });
                            } catch (_e) {}
                            woRec.setCurrentSublistValue({ sublistId: 'item', fieldId: 'quantity', value: qty });

                            // Track lots on the component line (best-effort)
                            tryPopulateLineInventoryDetail(lotsArr, { ...contextInfo, itemId: itemIdStr, qty });

                            woRec.commitLine({ sublistId: 'item' });
                        } else {
                            woRec.selectNewLine({ sublistId: 'item' });
                            woRec.setCurrentSublistValue({ sublistId: 'item', fieldId: 'item', value: Number(inp.input_item_internalid) });

                            // // Blank out allocation strategies (value 2)
                            // try { woRec.setCurrentSublistValue({ sublistId: 'item', fieldId: 'defaultorderallocationstrategy', value: "" }); } catch (_e) {}
                            // try { woRec.setCurrentSublistValue({ sublistId: 'item', fieldId: 'orderallocationstrategy', value: "" }); } catch (_e) {}

                            try {
                                log.debug({ title: 'COS Repack: setting component qty', details: JSON.stringify({ ...contextInfo, itemId: itemIdStr, qty, lineMode: (lineByItemId[itemIdStr] != null) ? 'existing' : 'new' }) });
                            } catch (_e) {}
                            woRec.setCurrentSublistValue({ sublistId: 'item', fieldId: 'quantity', value: qty });

                            tryPopulateLineInventoryDetail(lotsArr, { ...contextInfo, itemId: itemIdStr, qty });

                            woRec.commitLine({ sublistId: 'item' });
                        }
                    } catch (lineErr) {
                        // If item sublist isn't editable (BOM-driven), we still allow WO creation and log the issue.
                        try {
                            log.error({
                                title: 'COS Repack: component line update/add failed',
                                details: JSON.stringify({ ...contextInfo, input_item_internalid: inp.input_item_internalid, error: String(lineErr) })
                            });
                        } catch (_e) {}
                    }
                });


                // Purchase Order components (unique, no lots)
                poInputs.forEach((inp) => {
                    if (!inp || !inp.item_internalid) return;
                    const qty = toNum(inp.quantity);
                    if (!(qty > 0)) return;

                    try {
                        woRec.selectNewLine({ sublistId: 'item' });
                        woRec.setCurrentSublistValue({ sublistId: 'item', fieldId: 'item', value: Number(inp.item_internalid) });

                        // // Blank out allocation strategies (value 2 / blank)
                        // try { woRec.setCurrentSublistValue({ sublistId: 'item', fieldId: 'defaultorderallocationstrategy', value: "" }); } catch (_e) {}
                        // try { woRec.setCurrentSublistValue({ sublistId: 'item', fieldId: 'orderallocationstrategy', value: "" }); } catch (_e) {}

                        try {
                            log.debug({ title: 'COS Repack: setting PO component qty', details: JSON.stringify({ ...contextInfo, itemId: String(inp.item_internalid), qty }) });
                        } catch (_e) {}
                        woRec.setCurrentSublistValue({ sublistId: 'item', fieldId: 'quantity', value: qty });

                        // NOTE: PO components do NOT assign inventory detail here.
                        woRec.commitLine({ sublistId: 'item' });
                    } catch (poLineErr) {
                        try {
                            log.error({
                                title: 'COS Repack: PO component line add failed',
                                details: JSON.stringify({ ...contextInfo, itemId: String(inp.item_internalid), qty, error: String(poLineErr) })
                            });
                        } catch (_e) {}
                    }
                });

                // Debug: confirm WIP value before save
                try { log.debug({ title: 'COS Repack: WO iswip (pre-save)', details: String(woRec.getValue({ fieldId: 'iswip' })) }); } catch (_e) {}

                const woId = woRec.save({ enableSourcing: true, ignoreMandatoryFields: false });
                // Debug: verify persisted WIP value
                try {
                    const woVerify = record.load({ type: record.Type.WORK_ORDER, id: woId, isDynamic: false });
                    const wipPersisted = woVerify.getValue({ fieldId: 'iswip' });
                    log.debug({ title: 'COS Repack: WO iswip (persisted)', details: String(wipPersisted) });
                } catch (_e) {}
                results.push({ index: idx, workorderId: woId, output_item_internalid: woObj.output_item_internalid, output_item_quantity: woObj.output_item_quantity });

            } catch (err) {
                try {
                    log.error({
                        title: 'COS Repack: workorder create failed',
                        details: JSON.stringify({ ...contextInfo, error: String(err) })
                    });
                } catch (_e) {}
                results.push({ index: idx, workorderId: null, output_item_internalid: woObj && woObj.output_item_internalid, error: String(err) });
            }
        });

        return results;
    }

    function safeParseJson(raw) {
        try {
            if (!raw || typeof raw !== 'string') return null;
            const t = raw.trim();
            if (!t) return null;
            return JSON.parse(t);
        } catch (e) {
            return null;
        }
    }

    // Returns the first value that is a non-empty string (after trim). Otherwise returns ''.
    function firstNonEmptyString() {
        for (var i = 0; i < arguments.length; i++) {
            var v = arguments[i];
            if (v === null || v === undefined) continue;
            var s = String(v);
            if (s && s.trim().length) return s;
        }
        return '';
    }



    function toNum(v) {
        const n = parseFloat(v);
        return isNaN(n) ? 0 : n;
    }

    function round6(n) {
        const x = Number(n);
        if (!isFinite(x)) return 0;
        return Math.round(x * 1e6) / 1e6;
    }

    function round9(n) {
        const x = Number(n);
        if (!isFinite(x)) return 0;
        return Math.round(x * 1e9) / 1e9;
    }

    function fetchConversionMap(itemIds) {
        const map = {};
        if (!itemIds || !itemIds.length) return map;

        try {
            const s = search.create({
                type: search.Type.ITEM,
                filters: [
                    ['internalid', 'anyof', itemIds]
                ],
                columns: [
                    search.createColumn({ name: 'internalid' }),
                    search.createColumn({ name: 'custitem_repack_conversion' })
                ]
            });

            s.run().each((r) => {
                const id = String(r.getValue({ name: 'internalid' }) || '');
                if (!id) return true;
                map[id] = toNum(r.getValue({ name: 'custitem_repack_conversion' }));
                return true;
            });
        } catch (e) {
            try { log.error({ title: 'COS Repack: conversion lookup failed', details: e }); } catch (_e) {}
        }

        return map;
    }


    return { onRequest };
});

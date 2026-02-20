/**
 * @NApiVersion 2.1
 * @NScriptType Suitelet
 */
define(['./COS_LIB_repack','N/record','N/render','N/search'], function (COS_LIB, record, render, search) {

    var xmlEscape = COS_LIB.xmlEscape;


    function safeNum(n) { return COS_LIB.toNum(n); }


    function fmt(n, decimals) {
        var x = safeNum(n);
        var d = (decimals === null || decimals === undefined) ? 3 : decimals;
        return x.toFixed(d);
    }

    function parseJsonMaybe(s) { return COS_LIB.safeParseJson(s); }


    function getAllocForOut(allocMap, outItemId) {
        // allocMap shape expected:
        // { "2807": { total_qty, allocations: { "<outItemId>": qty } } }
        // Return array of {sourceItemId, totalQty, allocQty, itemName?}
        var rows = [];
        if (!allocMap) return rows;
        for (var srcId in allocMap) {
            if (!allocMap.hasOwnProperty(srcId)) continue;
            var src = allocMap[srcId] || {};
            var allocations = src.allocations || {};
            var allocQty = allocations[outItemId] !== undefined ? allocations[outItemId] : 0;
            rows.push({
                sourceItemId: srcId,
                sourceName: src.item_name || src.item_text || '', // best-effort
                totalQty: src.total_qty !== undefined ? src.total_qty : src.totalQty,
                allocQty: allocQty
            });
        }
        return rows;
    }

    function buildHeaderSection(subsTxt, locTxt, speciesTxt) {
        return ''
            + '<table class="kv" width="100%" cellspacing="0" cellpadding="4">'
            + '  <tr><td class="k">Subsidiary</td><td class="v">' + xmlEscape(subsTxt) + '</td></tr>'
            + '  <tr><td class="k">Location</td><td class="v">' + xmlEscape(locTxt) + '</td></tr>'
            + '  <tr><td class="k">Repack Species</td><td class="v">' + xmlEscape(speciesTxt) + '</td></tr>'
            + '</table>';
    }


    /**
     * Build distribution card matching the screenshot:
     * For each output: "OUTPUT NAME | idx (share%)"
     * Then a 2-col table: Input | Allocated Qty
     */
    function buildDistributionCard(summary) {
        var outs = (summary && Array.isArray(summary.outputs)) ? summary.outputs : [];
        var inputsArr = (summary && Array.isArray(summary.inputs)) ? summary.inputs : [];
        // Map input item id -> display name for quick lookup
        var inputNameById = {};
        for (var i0 = 0; i0 < inputsArr.length; i0++) {
            var it = inputsArr[i0] || {};
            var iid = String(it.id || it.item_internalid || it.input_item_internalid || '');
            if (!iid) continue;
            inputNameById[iid] = it.name || it.item_name || it.item_text || inputNameById[iid] || ('Item ' + iid);
        }

        var dist = summary && summary.distribution ? summary.distribution : null;
        var alloc = dist ? dist.allocations : null;

        if (!outs || !outs.length) {
            return '<div class="muted">No outputs found in summary payload.</div>';
        }
        if (!alloc || typeof alloc !== 'object') {
            return '<div class="muted">No allocation map found in summary payload.</div>';
        }

        // Two possible shapes observed in COS:
        // Shape A (VIEW UI / common): alloc[<outId>][<inId>] = qty
        // Shape B (older / alternative): alloc[<inId>] = { item_name, total_qty, allocations: { <outId>: qty } }
        function rowsForOutput(outId) {
            var rows = [];

            // Detect Shape A
            var maybeOutMap = alloc[outId];
            if (maybeOutMap && typeof maybeOutMap === 'object' && !Array.isArray(maybeOutMap) && !maybeOutMap.allocations) {
                for (var inId in maybeOutMap) {
                    if (!maybeOutMap.hasOwnProperty(inId)) continue;
                    var q = maybeOutMap[inId];
                    if (safeNum(q) > 0) {
                        var nmA = inputNameById[String(inId)] || ('Item ' + inId);
                        rows.push({ name: nmA, allocQty: q });
                    }
                }
                return rows;
            }

            // Fallback: Shape B
            for (var srcId in alloc) {
                if (!alloc.hasOwnProperty(srcId)) continue;
                var src = alloc[srcId] || {};
                var allocations = src.allocations || {};
                var q2 = allocations[outId] !== undefined ? allocations[outId] : 0;
                if (safeNum(q2) > 0) {
                    var nmB = src.item_name || src.item_text || inputNameById[String(srcId)] || ('Item ' + srcId);
                    rows.push({ name: nmB, allocQty: q2 });
                }
            }
            return rows;
        }

        var html = '<div class="card">';
        for (var i = 0; i < outs.length; i++) {
            var o = outs[i] || {};
            var outId = String(o.id || o.item_internalid || o.output_item_internalid || '');
            var outName = o.name || o.item_name || o.item_text || ('Item ' + outId);

            // share percent display
            var share = (o.share !== undefined ? o.share : o.output_share);
            var sharePct = (safeNum(share) * 100);
            var shareTxt = fmt(sharePct, 6) + '%';

            html += ''
                + '<div class="outBlock">'
                +   '<div class="outHeader">'
                +     '<span class="outTitle">' + xmlEscape(outName) + '</span>'
                +     '<span class="outMeta">' + xmlEscape(String(i + 1)) + ' &nbsp;(' + xmlEscape(shareTxt) + ')</span>'
                +   '</div>'
                +   '<table class="miniTable" width="100%" cellspacing="0" cellpadding="4">'
                +     '<tr><th align="left">Input</th><th align="right">Allocated Qty</th></tr>';

            var rows = rowsForOutput(outId);

            if (!rows.length) {
                html += '<tr><td class="muted">No inputs allocated.</td><td align="right">0</td></tr>';
            } else {
                rows.sort(function (a, b) {
                    var an = (a.name || '').toLowerCase();
                    var bn = (b.name || '').toLowerCase();
                    return an < bn ? -1 : (an > bn ? 1 : 0);
                });
                for (var r = 0; r < rows.length; r++) {
                    html += '<tr>'
                        + '<td>' + xmlEscape(rows[r].name) + '</td>'
                        + '<td align="right">' + xmlEscape(fmt(rows[r].allocQty, 6)) + '</td>'
                        + '</tr>';
                }
            }

            html += '</table></div>';
        }
        html += '</div>';
        return html;
    }

    function lookupItemConversion(itemId, convCache) {
        if (!itemId) return 0;
        if (convCache[itemId] !== undefined) return convCache[itemId];

        var conv = 0;
        try {
            var lf = search.lookupFields({
                type: 'item',
                id: itemId,
                columns: ['custitem_repack_conversion']
            });
            // NetSuite returns number as string sometimes
            conv = lf && lf.custitem_repack_conversion ? safeNum(lf.custitem_repack_conversion) : 0;
        } catch (e) {
            conv = 0;
        }

        convCache[itemId] = conv;
        return conv;
    }

    function buildWorkordersTableFromSearch(repackId) {
        var rows = [];
        var convCache = {};

        search.create({
            type: search.Type.WORK_ORDER,
            filters: [
                ['mainline', 'is', 'T'], 'and',
                ['custbody_cos_createdfromrepack', 'anyof', String(repackId)]
            ],
            columns: [
                search.createColumn({ name: 'tranid' }),
                search.createColumn({ name: 'item' }),
                search.createColumn({ name: 'quantity' })
            ]
        }).run().each(function (r) {
            var assemblyId = r.getValue({ name: 'item' });
            var assemblyText = r.getText({ name: 'item' }) || '';
            var qty = safeNum(r.getValue({ name: 'quantity' }));
            var conv = lookupItemConversion(assemblyId, convCache);
            var weight = qty * conv;

            rows.push({
                tranid: r.getValue({ name: 'tranid' }) || '',
                assemblyText: assemblyText,
                qty: qty,
                weight: weight
            });
            return true;
        });

        if (!rows.length) {
            return '<div class="muted">No work orders found for this repack.</div>';
        }

        var html = '';
        html += '<table class="tbl2" width="100%" cellspacing="0" cellpadding="4">';
        html += '<tr>'
            + '<th align="left">Work Order #</th>'
            + '<th align="left">Assembly Item</th>'
            + '<th align="right">Assembly Qty</th>'
            + '<th align="right">Assembly Weight</th>'
            + '</tr>';

        for (var i = 0; i < rows.length; i++) {
            var w = rows[i];
            // Match screenshot: WO#1, WO#2...
            var label = 'WO#' + (i + 1);

            // Weight: show 0 decimals if it's basically an integer, else 3
            var wDec = (Math.abs(w.weight - Math.round(w.weight)) < 0.000001) ? 0 : 3;

            html += '<tr>'
                + '<td>' + xmlEscape(label) + '</td>'
                + '<td>' + xmlEscape(w.assemblyText) + '</td>'
                + '<td align="right">' + xmlEscape(fmt(w.qty, 0)) + '</td>'
                + '<td align="right">' + xmlEscape(fmt(w.weight, wDec)) + '</td>'
                + '</tr>';
        }

        html += '</table>';
        return html;
    }

    function onRequest(context) {
        if (context.request.method !== 'GET') {
            context.response.write('Only GET is supported.');
            return;
        }

        var rectype = context.request.parameters.rectype || "customrecord_cos_repack";
        var recid = context.request.parameters.recid || context.request.parameters.repackid;

        if (!rectype || !recid) {
            context.response.write('Missing rectype/recid.');
            return;
        }

        // Load repack record
        var repRec = record.load({
            type: rectype,
            id: recid,
            isDynamic: false
        });

        // Header fields (TEXT equivalent)
        var subsTxt = repRec.getText({ fieldId: COS_LIB.CONST.FIELD.SUBSIDIARY }) || '';
        var locTxt = repRec.getText({ fieldId: COS_LIB.CONST.FIELD.LOCATION }) || '';
        var speciesTxt = repRec.getText({ fieldId: COS_LIB.CONST.FIELD.SPECIES }) || '';

        // Summary payload
        var summaryStr = repRec.getValue({ fieldId: COS_LIB.CONST.FIELD.SUMMARY_PAYLOAD }) || '';
        var summary = parseJsonMaybe(summaryStr) || {};

        var headerHtml = buildHeaderSection(subsTxt, locTxt, speciesTxt);
        var distHtml = buildDistributionCard(summary);
        var wosHtml = buildWorkordersTableFromSearch(recid);

        var xml =
            '<?xml version="1.0"?>' +
            '<!DOCTYPE pdf PUBLIC "-//big.faceless.org//report" "report-1.1.dtd">' +
            '<pdf>' +
            '<head>' +
            '  <style type="text/css">' +
            '    body { font-family: Helvetica, Arial, sans-serif; font-size: 10px; }' +
            '    .muted { color: #666666; }' +
            '    .sectionTitle { font-size: 12px; font-weight: bold; padding: 6px 8px; border: 1px solid #3b3b3b; background-color: #e7eefc; }' +
            '    table.kv { border-collapse: collapse; }' +
            '    table.kv td { border: 1px solid #3b3b3b; }' +
            '    table.kv td.k { width: 25%; font-weight: bold; background-color: #f3f6ff; }' +
            '    table.kv td.v { }' +
            '    .card { border: 1px solid #cfcfcf; background-color: #ffffff; padding: 10px; margin-top: 10px; }' +
            '    .outBlock { border: 1px solid #e0e0e0; margin-bottom: 10px; }' +
            '    .outHeader { background-color: #f2f2f2; padding: 6px 8px; }' +
            '    .outTitle { font-weight: bold; }' +
            '    .outMeta { float: right; }' +
            '    table.miniTable { border-collapse: collapse; }' +
            '    table.miniTable th { background-color: #fafafa; border-bottom: 1px solid #e0e0e0; }' +
            '    table.miniTable td, table.miniTable th { padding: 6px 8px; }' +
            '    table.miniTable td { border-bottom: 1px solid #f0f0f0; }' +
            '    .woTitle { font-weight: bold; font-size: 12px; margin-top: 12px; }' +
            '    table.tbl2 { border-collapse: collapse; margin-top: 6px; }' +
            '    table.tbl2 th { background-color: #e7eefc; border: 1px solid #3b3b3b; }' +
            '    table.tbl2 td, table.tbl2 th { border: 1px solid #3b3b3b; padding: 6px 8px; }' +
            '  </style>' +
            '</head>' +
            '<body>' +

            ' Repack #' + (repRec.getValue({fieldId : "id"}) || repRec.getValue({fieldId : "internalid"})) + ' ' +
            headerHtml +

            distHtml +

            '  <div class="woTitle">Work Orders</div>' +
            wosHtml +

            '</body>' +
            '</pdf>';

        var pdfFile = render.xmlToPdf({ xmlString: xml });

        context.response.writeFile({
            file: pdfFile,
            isInline: true
        });
    }

    return { onRequest: onRequest };
});

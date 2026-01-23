/**
 * @NApiVersion 2.x
 * @NScriptType Suitelet
 */
define(['N/record', 'N/render'], function (record, render) {

    function xmlEscape(s) {
        if (s === null || s === undefined) return '';
        return String(s)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&apos;');
    }

    function safeNum(n) {
        var x = parseFloat(n);
        return isFinite(x) ? x : 0;
    }

    function fmt(n, decimals) {
        var x = safeNum(n);
        var d = (decimals === null || decimals === undefined) ? 3 : decimals;
        return x.toFixed(d);
    }

    function parseJsonMaybe(s) {
        if (!s) return null;
        try { return JSON.parse(s); } catch (e) { return null; }
    }

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

    function buildOutputsSummary(summary) {
        var outs = (summary && summary.outputs) ? summary.outputs : [];
        if (!outs || !outs.length) {
            return '<div class="muted">No outputs found in summary payload.</div>';
        }

        var html = '';
        html += '<table class="tbl" width="100%" cellspacing="0" cellpadding="4">';
        html += '<tr>'
            + '<th>Output</th>'
            + '<th align="right">Qty</th>'
            + '<th align="right">Conv</th>'
            + '<th align="right">Share</th>'
            + '</tr>';

        for (var i = 0; i < outs.length; i++) {
            var o = outs[i] || {};
            var outName = o.item_name || o.item_text || ('Item ' + (o.item_internalid || ''));
            var outQty = (o.qty !== undefined ? o.qty : o.output_qty);
            var outConv = (o.conversion !== undefined ? o.conversion : o.output_conversion);
            var share = (o.share !== undefined ? o.share : o.output_share);

            html += '<tr>'
                + '<td>' + xmlEscape(outName) + '</td>'
                + '<td align="right">' + xmlEscape(fmt(outQty, 3)) + '</td>'
                + '<td align="right">' + xmlEscape(fmt(outConv, 6)) + '</td>'
                + '<td align="right">' + xmlEscape(fmt(safeNum(share) * 100, 2)) + '%</td>'
                + '</tr>';
        }
        html += '</table>';
        return html;
    }

    function buildAllocationDetail(summary) {
        var outs = (summary && summary.outputs) ? summary.outputs : [];
        var dist = summary && summary.distribution ? summary.distribution : null;

        // Inventory allocations
        var invAllocMap = dist && dist.allocations ? dist.allocations : null;
        // Purchase allocations
        var poAllocMap = dist && (dist.purchaseAllocations || dist.poAllocations) ? (dist.purchaseAllocations || dist.poAllocations) : null;

        if (!outs || !outs.length) return '<div class="muted">No allocation detail (no outputs).</div>';
        if (!invAllocMap && !poAllocMap) return '<div class="muted">No allocation maps found in summary payload.</div>';

        var html = '';

        for (var i = 0; i < outs.length; i++) {
            var o = outs[i] || {};
            var outId = String(o.item_internalid || o.output_item_internalid || '');
            var outName = o.item_name || o.item_text || ('Item ' + outId);

            html += '<div class="subttl">Allocations for: ' + xmlEscape(outName) + '</div>';

            html += '<table class="tbl" width="100%" cellspacing="0" cellpadding="4">';
            html += '<tr>'
                + '<th>Source</th>'
                + '<th>Type</th>'
                + '<th align="right">Total Qty</th>'
                + '<th align="right">Allocated Qty</th>'
                + '</tr>';

            // Inventory rows
            var invRows = getAllocForOut(invAllocMap, outId);
            for (var a = 0; a < invRows.length; a++) {
                var r = invRows[a];
                var nm = r.sourceName || ('Item ' + r.sourceItemId);
                html += '<tr>'
                    + '<td>' + xmlEscape(nm) + '</td>'
                    + '<td>INPUT</td>'
                    + '<td align="right">' + xmlEscape(fmt(r.totalQty, 3)) + '</td>'
                    + '<td align="right">' + xmlEscape(fmt(r.allocQty, 3)) + '</td>'
                    + '</tr>';
            }

            // PO rows
            var poRows = getAllocForOut(poAllocMap, outId);
            for (var b = 0; b < poRows.length; b++) {
                var pr = poRows[b];
                var pnm = pr.sourceName || ('Item ' + pr.sourceItemId);
                html += '<tr>'
                    + '<td>' + xmlEscape(pnm) + '</td>'
                    + '<td>PO</td>'
                    + '<td align="right">' + xmlEscape(fmt(pr.totalQty, 3)) + '</td>'
                    + '<td align="right">' + xmlEscape(fmt(pr.allocQty, 3)) + '</td>'
                    + '</tr>';
            }

            html += '</table>';
        }

        return html;
    }

    function buildWorkordersTable(summary) {
        // Best-effort: look for summary.meta.workorders
        var meta = summary && summary.meta ? summary.meta : null;
        var wos = meta && meta.workorders ? meta.workorders : null;

        if (!wos || !wos.length) {
            return '<div class="muted">No workorders found in payload (summary.meta.workorders).</div>';
        }

        var html = '';
        html += '<table class="tbl" width="100%" cellspacing="0" cellpadding="4">';
        html += '<tr>'
            + '<th>Work Order</th>'
            + '<th>Assembly</th>'
            + '<th align="right">Assembly Qty</th>'
            + '</tr>';

        for (var i = 0; i < wos.length; i++) {
            var w = wos[i] || {};
            var woId = w.id || w.workorderid || w.internalid || '';
            var woTran = w.tranid || w.tranId || ('WO ' + woId);
            var asmName = w.assembly_item_name || w.assemblyName || w.assembly_item_text || '';
            var asmQty = w.assembly_qty !== undefined ? w.assembly_qty : w.qty;

            html += '<tr>'
                + '<td>' + xmlEscape(String(woTran)) + '</td>'
                + '<td>' + xmlEscape(String(asmName || '')) + '</td>'
                + '<td align="right">' + xmlEscape(fmt(asmQty, 3)) + '</td>'
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
        var subsTxt = repRec.getText({ fieldId: 'custrecord_cos_rep_subsidiary' }) || '';
        var locTxt = repRec.getText({ fieldId: 'custrecord_cos_rep_location' }) || '';
        var speciesTxt = repRec.getText({ fieldId: 'custrecord_cos_rep_species' }) || '';

        // Summary payload
        var summaryStr = repRec.getValue({ fieldId: 'custrecord_cos_rep_summary_payload' }) || '';
        var summary = parseJsonMaybe(summaryStr) || {};

        var headerHtml = buildHeaderSection(subsTxt, locTxt, speciesTxt);
        var outputsHtml = buildOutputsSummary(summary);
        var allocHtml = buildAllocationDetail(summary);
        var wosHtml = buildWorkordersTable(summary);

        var xml =
            '<?xml version="1.0"?>' +
            '<!DOCTYPE pdf PUBLIC "-//big.faceless.org//report" "report-1.1.dtd">' +
            '<pdf>' +
            '<head>' +
            '  <style type="text/css">' +
            '    body { font-family: Helvetica, Arial, sans-serif; font-size: 10px; }' +
            '    .ttl { font-size: 16px; font-weight: bold; margin-bottom: 6px; }' +
            '    .sec { margin-top: 12px; }' +
            '    .secttl { font-size: 12px; font-weight: bold; margin: 8px 0 4px 0; }' +
            '    .subttl { font-size: 10px; font-weight: bold; margin: 8px 0 4px 0; }' +
            '    .muted { color: #666666; }' +
            '    table.tbl { border: 1px solid #cccccc; }' +
            '    table.tbl th { background-color: #eeeeee; border-bottom: 1px solid #cccccc; }' +
            '    table.tbl td, table.tbl th { border-right: 1px solid #cccccc; }' +
            '    table.kv td.k { width: 25%; font-weight: bold; background-color: #f7f7f7; border: 1px solid #dddddd; }' +
            '    table.kv td.v { border: 1px solid #dddddd; }' +
            '  </style>' +
            '</head>' +
            '<body>' +
            '  <div class="ttl">Repack Print</div>' +

            '  <div class="sec">' +
            '    <div class="secttl">Repack Header</div>' +
            headerHtml +
            '  </div>' +

            '  <div class="sec">' +
            '    <div class="secttl">Repack Summary</div>' +
            '    <div class="subttl">Outputs</div>' +
            outputsHtml +
            '    <div class="subttl">Allocations</div>' +
            allocHtml +
            '  </div>' +

            '  <div class="sec">' +
            '    <div class="secttl">Work Orders</div>' +
            wosHtml +
            '  </div>' +

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

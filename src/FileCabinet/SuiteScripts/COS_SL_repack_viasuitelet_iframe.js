/**
 * @NApiVersion 2.1
 * @NScriptType Suitelet
 */
define(['N/search'], function (search) {

    function onRequest(context) {
        var req = context.request;
        var res = context.response;

        var itemId = req.parameters.itemId || '';
        var itemText = req.parameters.itemText || '';
        var repLocationId = req.parameters.repLocationId || '';

        if (!itemId) {
            res.write(buildErrorHtml('Missing required parameter: itemId'));
            return;
        }

        if (!repLocationId) {
            res.write(buildErrorHtml('Please select a Location on the Repack record before choosing lots.'));
            return;
        }

        var lots = getLotsForItem(itemId, repLocationId);

        res.write(buildHtml({
            itemId: itemId,
            itemText: itemText,
            lots: lots
        }));
    }

    function getLotsForItem(itemId, repLocationId) {
        var rows = [];

        var filters = [
            ['item', 'anyof', itemId],
            'AND',
            ['inventorynumber', 'noneof', '@NONE@'],
            'AND',
            ['available', 'greaterthan', '0'],
            'AND',
            ['location', 'anyof', repLocationId]
        ];

        var s = search.create({
            type: 'inventorybalance',
            filters: filters,
            columns: [
                search.createColumn({ name: 'inventorynumber' }),
                search.createColumn({ name: 'binnumber' }),
                search.createColumn({ name: 'available' })
            ]
        });

        s.run().each(function (r) {
            rows.push({
                lotId: String(r.getValue({ name: 'inventorynumber' }) || ''),
                lotText: String(r.getText({ name: 'inventorynumber' }) || ''),
                binId: String(r.getValue({ name: 'binnumber' }) || ''),
                binText: String(r.getText({ name: 'binnumber' }) || ''),
                available: String(r.getValue({ name: 'available' }) || '0')
            });
            return true;
        });

        return rows;
    }

    function escapeHtml(s) {
        return String(s || '').replace(/[&<>"']/g, function (c) {
            return {
                '&': '&amp;',
                '<': '&lt;',
                '>': '&gt;',
                '"': '&quot;',
                "'": '&#39;'
            }[c];
        });
    }

    function buildErrorHtml(msg) {
        return (
            '<!doctype html>' +
            '<html><head><meta charset="utf-8" />' +
            '<title>Select Lots</title>' +
            '<style>body{font-family:Arial,sans-serif;padding:16px;}</style>' +
            '</head><body>' +
            '<h3>Error</h3>' +
            '<div style="color:#b00;">' + escapeHtml(msg) + '</div>' +
            '</body></html>'
        );
    }

    function buildHtml(opts) {
        var itemId = opts.itemId;
        var itemText = opts.itemText;
        var lots = opts.lots || [];

        var rowsHtml = '';
        for (var i = 0; i < lots.length; i++) {
            var lot = lots[i];
            rowsHtml +=
                '<tr>' +
                '<td style="text-align:center;">' +
                '<input type="checkbox" class="lot_cb" data-lotid="' + escapeHtml(lot.lotId) + '" data-bin="' + escapeHtml(lot.binText || lot.binId) + '" />' +
                '</td>' +
                '<td>' + escapeHtml(lot.lotId) + '</td>' +
                '<td>' + escapeHtml(lot.lotText) + '</td>' +
                '<td>' + escapeHtml(lot.binText || lot.binId) + '</td>' +
                '<td style="text-align:right;">' + escapeHtml(lot.available) + '</td>' +
                '<td style="text-align:right;">' +
                '<input type="text" class="lot_qty" data-lotid="' + escapeHtml(lot.lotId) + '" style="width:110px;" disabled />' +
                '</td>' +
                '</tr>';
        }

        if (!rowsHtml) {
            rowsHtml =
                '<tr><td colspan="6" style="padding:10px;color:#666;font-size:12px;">No available lots found for this item at the selected location.</td></tr>';
        }

        return (
            '<!doctype html>' +
            '<html>' +
            '<head>' +
            '<meta charset="utf-8" />' +
            '<title>Select Lots</title>' +
            '<style>' +
            'body{margin:0;font-family:Arial,sans-serif;background:#fff;}' +
            '.header{padding:10px 12px;border-bottom:1px solid #ddd;background:#f7f7f7;}' +
            '.title{font-weight:bold;font-size:14px;}' +
            '.sub{font-size:12px;color:#666;margin-top:2px;}' +
            'table{width:100%;border-collapse:collapse;font-size:12px;}' +
            'th,td{border-bottom:1px solid #eee;padding:8px 10px;}' +
            'th{background:#eee;text-align:left;font-weight:bold;}' +
            '.footer{position:sticky;bottom:0;background:#f7f7f7;border-top:1px solid #ddd;padding:10px 12px;display:flex;gap:8px;}' +
            'button{padding:6px 14px;cursor:pointer;}' +
            '</style>' +
            '</head>' +
            '<body>' +

            '<div class="header">' +
            '<div class="title">Select Lots</div>' +
            '<div class="sub">Item: ' + escapeHtml(itemText || itemId) + '</div>' +
            '</div>' +

            '<div style="padding:12px;">' +
            '<table>' +
            '<thead>' +
            '<tr>' +
            '<th style="width:40px;"></th>' +
            '<th style="width:160px;">Lot Internal ID</th>' +
            '<th>Lot Number</th>' +
            '<th style="width:160px;">Bin</th>' +
            '<th style="width:160px;text-align:right;">Available</th>' +
            '<th style="width:160px;text-align:right;">Qty to Use</th>' +
            '</tr>' +
            '</thead>' +
            '<tbody>' + rowsHtml + '</tbody>' +
            '</table>' +
            '</div>' +

            '<div class="footer">' +
            '<button id="btnOk" type="button">OK</button>' +
            '<button id="btnClose" type="button">Close</button>' +
            '</div>' +

            '<script>' +
            '(function(){' +
            'function postClose(){ window.parent.postMessage({ type: "COS_REPACK_MODAL_CLOSE" }, "*"); }' +

            'function gather(){' +
            'var out = [];' +
            'var cbs = document.querySelectorAll("input.lot_cb");' +
            'for(var i=0;i<cbs.length;i++){' +
            'var cb = cbs[i];' +
            'if(!cb.checked) continue;' +
            'var lotId = cb.getAttribute("data-lotid") || "";' +
            'var bin = cb.getAttribute("data-bin") || "";' +
            'var qtyEl = document.querySelector("input.lot_qty[data-lotid=\"" + lotId + "\"]");' +
            'var qty = qtyEl ? qtyEl.value : "";' +
            'out.push({ lotId: lotId, bin: bin, qty: qty });' +
            '}' +
            'return out;' +
            '}' +

            'function postSubmit(){' +
            'window.parent.postMessage({' +
            'type: "COS_REPACK_MODAL_SUBMIT",' +
            'payload: { itemId: ' + JSON.stringify(itemId) + ', lots: gather() }' +
            '}, "*");' +
            '}' +

            'var cbs = document.querySelectorAll("input.lot_cb");' +
            'for(var i=0;i<cbs.length;i++){' +
            '(function(cb){' +
            'cb.addEventListener("change", function(){' +
            'var lotId = cb.getAttribute("data-lotid") || "";' +
            'var qtyEl = document.querySelector("input.lot_qty[data-lotid=\"" + lotId + "\"]");' +
            'if(!qtyEl) return;' +
            'qtyEl.disabled = !cb.checked;' +
            'if(!cb.checked){ qtyEl.value = ""; }' +
            '});' +
            '})(cbs[i]);' +
            '}' +

            'var ok = document.getElementById("btnOk");' +
            'var close = document.getElementById("btnClose");' +
            'if(ok) ok.addEventListener("click", postSubmit);' +
            'if(close) close.addEventListener("click", postClose);' +
            'document.addEventListener("keydown", function(e){ if(e.key === "Escape"){ postClose(); } });' +
            '})();' +
            '</script>' +

            '</body>' +
            '</html>'
        );
    }

    return { onRequest: onRequest };
});

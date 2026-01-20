/**
 * @NApiVersion 2.1
 * @NScriptType Suitelet
 */
define(['N/search'], (search) => {

    const onRequest = (context) => {
        const req = context.request;
        const res = context.response;

        const itemId = req.parameters.itemId || '';
        const itemText = req.parameters.itemText || '';

        if (!itemId) {
            res.write(buildErrorHtml('Missing required parameter: itemId'));
            return;
        }

        // Fetch lot rows (lot internalid + lot text + available qty)
        const lots = getLotsForItem(itemId);

        res.write(buildHtml({
            itemId,
            itemText,
            lots
        }));
    };

    function getLotsForItem(itemId) {
        const rows = [];

        // Inventory Balance is the simplest place to get:
        // - inventorynumber (lot/serial)
        // - available
        //
        // NOTE: Column IDs can vary by account/features; this is the standard approach.
        // If your account uses inventory status, you can also add status filtering/columns later.
        const s = search.create({
            type: 'inventorybalance',
            filters: [
                ['item', 'anyof', itemId],
                'AND',
                ['inventorynumber', 'noneof', '@NONE@'],
                'AND',
                ['available', 'greaterthan', '0']
            ],
            columns: [
                search.createColumn({ name: 'inventorynumber' }),
                search.createColumn({ name: 'available' })
            ]
        });

        s.run().each((r) => {
            const lotId = r.getValue({ name: 'inventorynumber' });
            const lotText = r.getText({ name: 'inventorynumber' }) || '';
            const available = r.getValue({ name: 'available' });

            // Sometimes inventorybalance returns multiple rows per lot (e.g. location/status);
            // For now we just list rows as-is. Later we can aggregate by lotId if needed.
            rows.push({
                lotId: String(lotId || ''),
                lotText: String(lotText || ''),
                available: String(available || '0')
            });

            return true;
        });

        return rows;
    }

    function escapeHtml(s) {
        return String(s ?? '').replace(/[&<>"']/g, (c) => ({
            '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
        }[c]));
    }

    function buildErrorHtml(msg) {
        return (
            '<!doctype html><html><head><meta charset="utf-8"/>' +
            '<title>Select Lots</title>' +
            '<style>body{font-family:Arial,sans-serif;padding:16px;}</style>' +
            '</head><body>' +
            '<h3>Error</h3>' +
            '<div style="color:#b00;">' + escapeHtml(msg) + '</div>' +
            '</body></html>'
        );
    }

    function buildHtml(opts) {
        const itemId = opts.itemId;
        const itemText = opts.itemText;
        const lots = Array.isArray(opts.lots) ? opts.lots : [];

        let rowsHtml = '';
        for (let i = 0; i < lots.length; i++) {
            const lot = lots[i];

            rowsHtml +=
                '<tr>' +
                '<td style="text-align:center;">' +
                '<input type="checkbox" class="lot_cb" data-lotid="' + escapeHtml(lot.lotId) + '" />' +
                '</td>' +
                '<td>' + escapeHtml(lot.lotId) + '</td>' +
                '<td>' + escapeHtml(lot.lotText) + '</td>' +
                '<td style="text-align:right;">' + escapeHtml(lot.available) + '</td>' +
                '<td style="text-align:right;">' +
                '<input type="text" class="lot_qty" data-lotid="' + escapeHtml(lot.lotId) + '" style="width:110px;" disabled />' +
                '</td>' +
                '</tr>';
        }

        const emptyHtml =
            '<div style="padding:10px;color:#666;font-size:12px;">No available lots found for this item.</div>';

        return (
            '<!doctype html>' +
            '<html>' +
            '<head>' +
            '<meta charset="utf-8"/>' +
            '<title>Select Lots</title>' +
            '<style>' +
            'body{margin:0;font-family:Arial,sans-serif;background:#fff;}' +
            '.header{padding:10px 12px;border-bottom:1px solid #ddd;background:#f7f7f7;}' +
            '.title{font-weight:bold;font-size:14px;}' +
            '.sub{font-size:12px;color:#666;margin-top:2px;}' +
            '.wrap{padding:12px;}' +
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

            '<div class="wrap">' +

            (lots.length
                    ? (
                        '<table>' +
                        '<thead>' +
                        '<tr>' +
                        '<th style="width:40px;"></th>' +
                        '<th style="width:160px;">Lot Internal ID</th>' +
                        '<th>Lot Number</th>' +
                        '<th style="width:160px;text-align:right;">Available</th>' +
                        '<th style="width:160px;text-align:right;">Qty to Use</th>' +
                        '</tr>' +
                        '</thead>' +
                        '<tbody>' + rowsHtml + '</tbody>' +
                        '</table>'
                    )
                    : emptyHtml
            ) +

            '</div>' +

            '<div class="footer">' +
            '<button id="btnOk" type="button">OK</button>' +
            '<button id="btnClose" type="button">Close</button>' +
            '</div>' +

            '<script>' +
            '(function(){' +
            'var ITEM_ID = ' + JSON.stringify(itemId) + ';' +
            'var ITEM_TEXT = ' + JSON.stringify(itemText) + ';' +

            'function postClose(){' +
            'window.parent.postMessage({ type: "COS_REPACK_MODAL_CLOSE" }, "*");' +
            '}' +

            'function gather(){' +
            'var out = [];' +
            'var cbs = document.querySelectorAll("input.lot_cb");' +
            'for(var i=0;i<cbs.length;i++){' +
            'var cb = cbs[i];' +
            'if(!cb.checked) continue;' +
            'var lotId = cb.getAttribute("data-lotid") || "";' +
            'var qtyEl = document.querySelector("input.lot_qty[data-lotid=\\"" + lotId + "\\"]");' +
            'var qty = qtyEl ? qtyEl.value : "";' +
            'var tr = cb.closest("tr");' +
            'var lotText = "";' +
            'var available = "";' +
            'if(tr){' +
            'var tds = tr.querySelectorAll("td");' +
            'if(tds && tds.length >= 4){' +
            'lotText = (tds[2] && tds[2].textContent) ? tds[2].textContent.trim() : "";' +
            'available = (tds[3] && tds[3].textContent) ? tds[3].textContent.trim() : "";' +
            '}' +
            '}' +
            'out.push({ lotId: lotId, lotText: lotText, available: available, qty: qty });' +
            '}' +
            'return out;' +
            '}' +

            'function postSubmit(){' +
            'var lots = gather();' +
            'window.parent.postMessage({' +
            'type: "COS_REPACK_MODAL_SUBMIT",' +
            'payload: {' +
            'itemId: ITEM_ID,' +
            'itemText: ITEM_TEXT,' +
            'lots: lots' +
            '}' +
            '}, "*");' +
            '}' +

            // Enable qty field when checkbox selected
            'var cbs = document.querySelectorAll("input.lot_cb");' +
            'for(var i=0;i<cbs.length;i++){' +
            '(function(cb){' +
            'cb.addEventListener("change", function(){' +
            'var lotId = cb.getAttribute("data-lotid") || "";' +
            'var qtyEl = document.querySelector("input.lot_qty[data-lotid=\\"" + lotId + "\\"]");' +
            'if(!qtyEl) return;' +
            'qtyEl.disabled = !cb.checked;' +
            'if(cb.checked && !qtyEl.value){' +
            // default qty to available if you want; leaving blank is also fine.
            'var tr = cb.closest("tr");' +
            'if(tr){' +
            'var tds = tr.querySelectorAll("td");' +
            'var avail = (tds && tds[3] && tds[3].textContent) ? tds[3].textContent.trim() : "";' +
            'qtyEl.value = avail;' +
            '}' +
            '}' +
            'if(!cb.checked){ qtyEl.value = ""; }' +
            '});' +
            '})(cbs[i]);' +
            '}' +

            'var ok = document.getElementById("btnOk");' +
            'var close = document.getElementById("btnClose");' +
            'if(ok) ok.addEventListener("click", postSubmit);' +
            'if(close) close.addEventListener("click", postClose);' +
            'document.addEventListener("keydown", function(e){ if(e.key==="Escape"){ postClose(); } });' +
            '})();' +
            '</script>' +

            '</body>' +
            '</html>'
        );
    }

    return { onRequest };

});

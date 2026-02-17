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

        var prefillParam = req.parameters.prefill || '';
        var maxQtyParam = req.parameters.maxQty || '';

        if (!itemId) {
            res.write(buildErrorHtml('Missing required parameter: itemId'));
            return;
        }
        if (!repLocationId) {
            res.write(buildErrorHtml('Please select a Location on the Repack record before choosing lots.'));
            return;
        }

        var rows = getLotsForItem(itemId, repLocationId);

        res.write(buildHtml({
            itemId: itemId,
            itemText: itemText,
            repLocationId: repLocationId,
            prefillParam: prefillParam,
            maxQty: maxQtyParam,
            rows: rows
        }));
    }

    function getLotsForItem(itemId, repLocationId) {
        var out = [];

        var s = search.create({
            type: 'inventorybalance',
            filters: [
                ['item', 'anyof', itemId],
                'AND',
                ['location', 'anyof', repLocationId],
                'AND',
                ['inventorynumber', 'noneof', '@NONE@'],
                'AND',
                ['available', 'greaterthan', '0']
            ],
            columns: [
                search.createColumn({ name: 'inventorynumber' }),
                search.createColumn({ name: 'binnumber' }),
                search.createColumn({ name: 'status' }),
                search.createColumn({ name: 'available' })
            ]
        });

        s.run().each(function (r) {
            out.push({
                lotId: String(r.getValue({ name: 'inventorynumber' }) || ''),
                lotText: String(r.getText({ name: 'inventorynumber' }) || ''),
                binId: String(r.getValue({ name: 'binnumber' }) || ''),
                binText: String(r.getText({ name: 'binnumber' }) || ''),
                statusId: String(r.getValue({ name: 'status' }) || ''),
                statusText: String(r.getText({ name: 'status' }) || ''),
                available: String(r.getValue({ name: 'available' }) || '0')
            });
            return true;
        });

        return out;
    }

    function escapeHtml(s) {
        return String(s || '').replace(/[&<>"']/g, function (c) {
            return { '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c];
        });
    }

    function buildErrorHtml(msg) {
        return ''
            + '<!doctype html><html><head><meta charset="utf-8"/>'
            + '<title>Select Lots</title>'
            + '<style>body{font-family:Arial,sans-serif;padding:16px;}</style>'
            + '</head><body>'
            + '<h3>Error</h3>'
            + '<div style="color:#b00;">' + escapeHtml(msg) + '</div>'
            + '</body></html>';
    }

    function buildHtml(opts) {
        var itemId = opts.itemId;
        var itemText = opts.itemText;
        var repLocationId = opts.repLocationId;
        var prefillParam = opts.prefillParam || '';
        var maxQtyParam = opts.maxQty || '';
        var rows = opts.rows || [];

        // Build status options from results
        var statusMap = {};
        for (var i = 0; i < rows.length; i++) {
            var stId = rows[i].statusId || '';
            var stText = rows[i].statusText || '';
            if (stId && stText) statusMap[stId] = stText;
        }
        var statusOpts = '<option value="">All</option>';
        Object.keys(statusMap).sort(function(a,b){
            var ta = (statusMap[a]||'').toLowerCase();
            var tb = (statusMap[b]||'').toLowerCase();
            if (ta < tb) return -1;
            if (ta > tb) return 1;
            return 0;
        }).forEach(function(id){
            statusOpts += '<option value="' + escapeHtml(id) + '">' + escapeHtml(statusMap[id]) + '</option>';
        });

        var bodyRows = '';
        for (var j = 0; j < rows.length; j++) {
            var r = rows[j];
            // unique key per row: lotId|binId|statusId
            var key = (r.lotId || '') + '|' + (r.binId || '') + '|' + (r.statusId || '');
            bodyRows += ''
                + '<tr class="lot_tr" data-key="' + escapeHtml(key) + '" data-statusid="' + escapeHtml(r.statusId) + '" data-available="' + escapeHtml(r.available) + '">'
                +   '<td style="text-align:center;">'
                +     '<input type="checkbox" class="lot_cb" data-key="' + escapeHtml(key) + '" />'
                +   '</td>'
                +   '<td>' + escapeHtml(r.lotId) + '</td>'
                +   '<td>' + escapeHtml(r.lotText) + '</td>'
                +   '<td>' + escapeHtml(r.binText || r.binId) + '</td>'
                +   '<td>' + escapeHtml(r.statusText) + '</td>'
                +   '<td style="text-align:right;">' + escapeHtml(r.available) + '</td>'
                +   '<td style="text-align:right;">'
                +     '<input type="text" class="lot_qty" data-key="' + escapeHtml(key) + '" style="width:110px;" disabled />'
                +   '</td>'
                + '</tr>';
        }

        if (!bodyRows) {
            bodyRows = '<tr><td colspan="7" style="padding:10px;color:#666;font-size:12px;">No available lots found for this item at the selected location.</td></tr>';
        }

        return ''
            + '<!doctype html><html><head><meta charset="utf-8"/>'
            + '<title>Select Lots</title>'
            + '<style>'
            + 'body{margin:0;font-family:Arial,sans-serif;background:#fff;}'
            + '.header{padding:10px 12px;border-bottom:1px solid #ddd;background:#f7f7f7;}'
            + '.title{font-weight:bold;font-size:14px;}'
            + '.sub{font-size:12px;color:#666;margin-top:2px;}'
            + '.toolbar{padding:10px 12px;border-bottom:1px solid #ddd;background:#fff;display:flex;gap:10px;align-items:center;}'
            + 'label{font-size:12px;color:#333;}'
            + 'select{padding:4px 6px;}'
            + 'table{width:100%;border-collapse:collapse;font-size:12px;}'
            + 'th,td{border-bottom:1px solid #eee;padding:8px 10px;vertical-align:middle;}'
            + 'th{background:#eee;text-align:left;font-weight:bold;position:sticky;top:0;z-index:2;}'
            + '.wrap{padding:12px;max-height:calc(100vh - 150px);overflow:auto;}'
            + '.footer{position:sticky;bottom:0;background:#f7f7f7;border-top:1px solid #ddd;padding:10px 12px;display:flex;gap:8px;}'
            + 'button{padding:6px 14px;cursor:pointer;}'
            + '.msg{margin-left:auto;font-size:12px;color:#b00;display:none;}'
            + '</style>'
            + '</head><body>'

            + '<div class="header">'
            +   '<div class="title">Select Lots</div>'
            +   '<div class="sub">Item: ' + escapeHtml(itemText || itemId) + ' | Location: ' + escapeHtml(repLocationId) + '</div>'
            + '</div>'

            + '<div class="toolbar">'
            +   '<label for="statusFilter">Inventory Status:</label>'
            +   '<select id="statusFilter">' + statusOpts + '</select>'
            +   '<div id="msg" class="msg"></div>'
            + '</div>'

            + '<div class="wrap">'
            +   '<table>'
            +     '<thead>'
            +       '<tr>'
            +         '<th style="width:40px;"></th>'
            +         '<th style="width:140px;">Lot ID</th>'
            +         '<th>Lot Number</th>'
            +         '<th style="width:140px;">Bin</th>'
            +         '<th style="width:180px;">Status</th>'
            +         '<th style="width:140px;text-align:right;">Available</th>'
            +         '<th style="width:160px;text-align:right;">Qty to Use</th>'
            +       '</tr>'
            +     '</thead>'
            +     '<tbody id="tbody">' + bodyRows + '</tbody>'
            +   '</table>'
            + '</div>'

            + '<div class="footer">'
            +   '<button id="btnOk" type="button">OK</button>'
            +   '<button id="btnClose" type="button">Close</button>'
            + '</div>'

            + '<script>'
            + '(function(){'
            + '  var ITEM_ID = ' + JSON.stringify(itemId) + ';'
            + '  var ITEM_TEXT = ' + JSON.stringify(itemText) + ';'
            + '  var MAX_QTY_RAW = ' + JSON.stringify(maxQtyParam) + ';'
            + '  var MAX_QTY = parseFloat(MAX_QTY_RAW); if (isNaN(MAX_QTY)) MAX_QTY = 0;'
            + '  var PREFILL_RAW = ' + JSON.stringify(prefillParam) + ';'
            + '  var PREFILL_MAP = {};'
            + '  try { if (PREFILL_RAW) { var decoded = decodeURIComponent(PREFILL_RAW); var arr = JSON.parse(decoded); if (arr && arr.length) { for (var pi=0; pi<arr.length; pi++){ var it = arr[pi]; if (it && it.key) PREFILL_MAP[String(it.key)] = it; } } } } catch(e) {}'
            + '  var msgEl = document.getElementById("msg");'
            + '  function showMsg(t){ if(!msgEl) return; msgEl.style.display = t ? "block" : "none"; msgEl.textContent = t || ""; }'
            + '  function postClose(){ window.parent.postMessage({ type: "COS_REPACK_MODAL_CLOSE" }, "*"); }'
            + '  function toNum(v){ var n = parseFloat(v); return isNaN(n) ? NaN : n; }'
            + '  function getRowByKey(key){ return document.querySelector("tr.lot_tr[data-key=\\\"" + key + "\\\"]"); }'
            + '  function getQtyElByKey(key){ return document.querySelector("input.lot_qty[data-key=\\\"" + key + "\\\"]"); }'
            + '  function onCbChange(cb){'
            + '    var key = cb.getAttribute("data-key") || "";'
            + '    var tr = getRowByKey(key);'
            + '    var qtyEl = getQtyElByKey(key);'
            + '    if(!tr || !qtyEl) return;'
            + '    var availStr = tr.getAttribute("data-available") || "0";'
            + '    var avail = parseFloat(availStr);'
            + '    if (isNaN(avail)) avail = 0;'
            + '    qtyEl.disabled = !cb.checked;'
            + '    if (cb.checked){ /* leave as-is; user may type */ }'
            + '    else { qtyEl.value = ""; }'
            + '  }'
            + '  function onQtyInput(qtyEl){'
            + '    var v = String(qtyEl.value || "").trim();'
            + '    if (!v){ showMsg(""); return; }'
            + '    var n = toNum(v);'
            + '    if (isNaN(n)){ showMsg("Quantity must be a number."); return; }'
            + '    if (n < 0){ showMsg("Quantity cannot be negative."); return; }'
            + '    showMsg("");'
            + '  }'
            + '  function onQtyBlur(qtyEl){'
            + '    var key = qtyEl.getAttribute("data-key") || "";'
            + '    var tr = getRowByKey(key);'
            + '    if (!tr) return;'
            + '    var avail = toNum(tr.getAttribute("data-available") || "");'
            + '    if (isNaN(avail)) return;'
            + '    var v = String(qtyEl.value || "").trim();'
            + '    if (!v) return;'
            + '    var n = toNum(v);'
            + '    if (isNaN(n)) return;'
            + '    if (n > avail){'
            + '      alert("Only " + avail + " is available for this lot.");'
            + '      qtyEl.value = String(avail);'
            + '    }'
            + '  }'
            + '  function gather(){'
            + '    var out = [];'
            + '    var cbs = document.querySelectorAll("input.lot_cb");'
            + '    for (var i=0;i<cbs.length;i++){'
            + '      var cb = cbs[i];'
            + '      if (!cb.checked) continue;'
            + '      var key = cb.getAttribute("data-key") || "";'
            + '      var tr = getRowByKey(key);'
            + '      var qtyEl = getQtyElByKey(key);'
            + '      if(!tr || !qtyEl) continue;'
            + '      var tds = tr.querySelectorAll("td");'
            + '      var lotId = (tds[1] && tds[1].textContent) ? tds[1].textContent.trim() : "";'
            + '      var lotText = (tds[2] && tds[2].textContent) ? tds[2].textContent.trim() : "";'
            + '      var binText = (tds[3] && tds[3].textContent) ? tds[3].textContent.trim() : "";'
            + '      var statusText = (tds[4] && tds[4].textContent) ? tds[4].textContent.trim() : "";'
            + '      var available = (tds[5] && tds[5].textContent) ? tds[5].textContent.trim() : "";'
            + '      var qty = qtyEl.value || "";'
            + '      out.push({ key: key, lotId: lotId, lotText: lotText, bin: binText, status: statusText, available: available, qty: qty });'
            + '    }'
            + '    return out;'
            + '  }'
            + '  function validateBeforeSubmit(){'
            + '    var lots = gather();'
            + '    var total = 0;'
            + '    for (var i=0;i<lots.length;i++){'
            + '      var qv = String(lots[i].qty||"").trim();'
            + '      if (!qv){ showMsg("Please enter quantity for all selected rows."); return false; }'
            + '      var qn = toNum(qv);'
            + '      if (isNaN(qn)){ showMsg("Quantity must be a number."); return false; }'
            + '      if (qn < 0){ showMsg("Quantity cannot be negative."); return false; }'
            + '      total += qn;'
            + '    }'
            + '    if (MAX_QTY > 0 && total > MAX_QTY + 1e-9){'
            + '      showMsg("Total Qty to Use (" + total + ") exceeds allowed (" + MAX_QTY + "). Please reduce quantities.");'
            + '      return false;'
            + '    }'
            + '    showMsg(""); return true;'
            + '  }'
            + '  function postSubmit(){'
            + '    if (!validateBeforeSubmit()) return;'
            + '    window.parent.postMessage({ type: "COS_REPACK_MODAL_SUBMIT", payload: { itemId: ITEM_ID, itemText: ITEM_TEXT, lots: gather() } }, "*");'
            + '  }'
            + '  var cbs = document.querySelectorAll("input.lot_cb");'
            + '  for (var i=0;i<cbs.length;i++){ (function(cb){ cb.addEventListener("change", function(){ onCbChange(cb); }); })(cbs[i]); }'
            + '  var qtys = document.querySelectorAll("input.lot_qty");'
            + '  for (var j=0;j<qtys.length;j++){ (function(q){ q.addEventListener("input", function(){ onQtyInput(q); }); q.addEventListener("blur", function(){ onQtyBlur(q); }); })(qtys[j]); }'
            + '  function applyPrefill(){'
            + '    try {'
            + '      var cbs2 = document.querySelectorAll("input.lot_cb");'
            + '      for (var ii=0; ii<cbs2.length; ii++) {'
            + '        var cbx = cbs2[ii];'
            + '        var key = cbx.getAttribute("data-key") || "";'
            + '        if (!key) continue;'
            + '        var pf = PREFILL_MAP[key];'
            + '        if (!pf) continue;'
            + '        cbx.checked = true;'
            + '        onCbChange(cbx);'
            + '        var qEl = getQtyElByKey(key);'
            + '        if (qEl) {'
            + '          if (pf.qty != null) qEl.value = String(pf.qty);'
            + '          onQtyInput(qEl);'
            + '        }'
            + '      }'
            + '    } catch(e) {}'
            + '  }'
            + '  applyPrefill();'
            + '  var statusSel = document.getElementById("statusFilter");'
            + '  if (statusSel){ statusSel.addEventListener("change", function(){'
            + '    var val = statusSel.value || "";'
            + '    var trs = document.querySelectorAll("tr.lot_tr");'
            + '    for (var i=0;i<trs.length;i++){'
            + '      var tr = trs[i];'
            + '      var sid = tr.getAttribute("data-statusid") || "";'
            + '      tr.style.display = (!val || val === sid) ? "" : "none";'
            + '    }'
            + '  }); }'
            + '  var ok = document.getElementById("btnOk");'
            + '  var close = document.getElementById("btnClose");'
            + '  if (ok) ok.addEventListener("click", postSubmit);'
            + '  if (close) close.addEventListener("click", postClose);'
            + '  document.addEventListener("keydown", function(e){ if(e.key === "Escape"){ postClose(); } });'
            + '})();'
            + '</script>'

            + '</body></html>';
    }

    return { onRequest: onRequest };
});

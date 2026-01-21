/**
 * @NApiVersion 2.1
 * @NScriptType UserEventScript
 */

define(['N/ui/serverWidget','N/url'], (serverWidget, url) => {

    const beforeLoad = (scriptContext) => {
        const { form, type } = scriptContext;

        if (
            type !== scriptContext.UserEventType.VIEW &&
            type !== scriptContext.UserEventType.EDIT &&
            type !== scriptContext.UserEventType.CREATE
        ) {
            return;
        }

        form.addTab({
            id: 'custpage_cos_input_output',
            label: 'Repack Builder'
        });

        // Keep client-side UX: item list updates on fieldChanged/pageInit
        form.clientScriptModulePath = './COS_CS_repack_viasuitelet.js';

        // UI-only payload fields
        const outputsPayload = form.addField({
            id: 'custpage_cos_outputs_payload',
            type: serverWidget.FieldType.LONGTEXT,
            label: 'Outputs Payload'
        });
        outputsPayload.updateDisplayType({ displayType: serverWidget.FieldDisplayType.HIDDEN });

        const inputsPayload = form.addField({
            id: 'custpage_cos_inputs_payload',
            type: serverWidget.FieldType.LONGTEXT,
            label: 'Inputs Payload'
        });
        inputsPayload.updateDisplayType({ displayType: serverWidget.FieldDisplayType.HIDDEN });

        const summaryPayload = form.addField({
            id: 'custpage_cos_summary_payload',
            type: serverWidget.FieldType.LONGTEXT,
            label: 'Repack Summary Payload'
        });
        summaryPayload.updateDisplayType({ displayType: serverWidget.FieldDisplayType.HIDDEN });


        const inputLotsPayload = form.addField({
            id: 'custpage_cos_input_lots_payload',
            type: serverWidget.FieldType.LONGTEXT,
            label: 'Input Lots Payload'
        });
        inputLotsPayload.updateDisplayType({ displayType: serverWidget.FieldDisplayType.HIDDEN });

        // Suitelet base URL for lot selection (iframe modal)
        // NOTE: Update scriptId/deploymentId to match your existing Suitelet deployment.
        const suiteletBaseUrl = url.resolveScript({
            scriptId: 'customscript_cos_repack_popup_sl',
            deploymentId: 'customdeploy_cos_repack_popup_sl'
        });

        const htmlField = form.addField({
            id: 'custpage_cos_io_html',
            type: serverWidget.FieldType.INLINEHTML,
            label: ' ',
            container: 'custpage_cos_input_output'
        });

        htmlField.defaultValue = `
<div style="padding:10px;border:1px solid #ccc;border-radius:6px;margin-bottom:12px;">
  <strong>Repack Builder</strong><br/>
  <small style="color:#666;">Step-by-step: select Outputs → select Inputs → review Summary.</small>
</div>

<!-- STEP 1: OUTPUTS -->
<div id="cos_out_section" style="border:1px solid #ddd;border-radius:6px;overflow:hidden;">
  <div style="background:#2f3f53;color:#fff;padding:10px 12px;">
    <div style="font-weight:bold;">Step 1: Select Outputs</div>
    <div style="font-size:12px;opacity:0.9;">Choose output items and quantities</div>
  </div>

  <div style="padding:10px 12px;background:#f7f7f7;border-bottom:1px solid #ddd;display:flex;gap:8px;align-items:center;">
    <input id="cos_out_search" type="text" placeholder="Search outputs" style="flex:1;padding:6px;" />
    <span id="cos_out_count" style="font-size:12px;color:#333;"></span>
  </div>

  <div class="cos_tbl_hdr" style="display:grid;grid-template-columns:38px 2.2fr 1fr 120px 110px 110px 110px 110px 110px;gap:8px;padding:8px 12px;font-weight:bold;font-size:12px;background:#eee;border-bottom:1px solid #ddd;align-items:center;">
    <div></div>
    <div>Item</div>
    <div style="text-align:right;">Qty</div>
    <div style="text-align:right;">Conversion</div>
    <div style="text-align:right;">Available</div>
    <div style="text-align:right;">On Hand</div>
    <div style="text-align:right;">Committed</div>
    <div style="text-align:right;">On Order</div>
    <div style="text-align:right;">Backordered</div>
  </div>

  <div id="cos_out_rows"></div>
</div>

<div style="margin:10px 0 14px 0;display:flex;justify-content:flex-start;gap:10px;align-items:center;">
  <button id="cos_btn_prepare_inputs" type="button" disabled style="padding:8px 12px;cursor:pointer;">
    Step 2: Prepare Inputs
  </button>
  <span id="cos_prepare_hint" style="font-size:12px;color:#666;"></span>
</div>

<!-- STEP 2: INPUTS + PURCHASE ORDERS -->
<div id="cos_step2_wrap" style="display:none;">
  <div style="display:flex;flex-direction:column;gap:12px;align-items:stretch;">

    <!-- INPUTS -->
    <div id="cos_in_section" style="border:1px solid #ddd;border-radius:6px;overflow:hidden;">
      <div style="background:#2f3f53;color:#fff;padding:10px 12px;">
        <div style="font-weight:bold;">Step 2: Select Inputs</div>
        <div style="font-size:12px;opacity:0.9;">Choose which items to consume as inputs</div>
      </div>

      <div style="padding:10px 12px;background:#f7f7f7;border-bottom:1px solid #ddd;display:flex;gap:8px;align-items:center;">
        <input id="cos_in_search" type="text" placeholder="Search inputs" style="flex:1;padding:6px;" />
        <span id="cos_in_count" style="font-size:12px;color:#333;"></span>
      </div>

      <div class="cos_tbl_hdr" style="display:grid;grid-template-columns:38px 2.2fr 1fr 120px 110px 110px 110px 110px 110px 120px;gap:8px;padding:8px 12px;font-weight:bold;font-size:12px;background:#eee;border-bottom:1px solid #ddd;align-items:center;">
        <div></div>
        <div>Item</div>
        <div style="text-align:right;">Qty</div>
        <div style="text-align:right;">Conversion</div>
        <div style="text-align:right;">Available</div>
        <div style="text-align:right;">On Hand</div>
        <div style="text-align:right;">Committed</div>
        <div style="text-align:right;">On Order</div>
        <div style="text-align:right;">Backordered</div>
        <div style="text-align:right;">Lots</div>
      </div>

      <div id="cos_in_rows"></div>
    </div>

    <!-- PURCHASE ORDERS (placeholder only) -->
    <div id="cos_po_section" style="border:1px solid #ddd;border-radius:6px;overflow:hidden;">
      <div style="background:#2f3f53;color:#fff;padding:10px 12px;">
        <div style="font-weight:bold;">Purchase Orders</div>
        <div style="font-size:12px;opacity:0.9;">(Coming next) Define POs for this repack</div>
      </div>

      <div style="padding:12px;background:#fff;">
        <div style="font-size:12px;color:#666;line-height:1.4;">
          This section will allow users to define purchase orders associated to the repack.
          <br/><br/>
          For now this is a placeholder.
        </div>
      </div>
    </div>

  </div>

  <div style="margin:10px 0 14px 0;display:flex;justify-content:flex-start;gap:10px;align-items:center;">
    <button id="cos_btn_build_summary" type="button" disabled style="padding:8px 12px;cursor:pointer;">
      Step 3: Build Repack Summary
    </button>
    <span id="cos_summary_hint" style="font-size:12px;color:#666;"></span>
  </div>
</div>

<!-- STEP 3: SUMMARY -->
<div id="cos_summary_section" style="display:none;border:1px solid #ddd;border-radius:6px;overflow:hidden;margin-bottom:12px;">
  <div style="background:#2f3f53;color:#fff;padding:10px 12px;">
    <div style="font-weight:bold;">Repack Summary</div>
    <div style="font-size:12px;opacity:0.9;">Review outputs and inputs before proceeding</div>
  </div>

  <div id="cos_summary_body" style="background:#fff;"></div>
</div>


<!-- LOT SELECTION MODAL (iframe) -->
<div id="cos_modal_overlay" style="display:none;position:fixed;inset:0;background:rgba(0,0,0,0.35);z-index:99998;"></div>
<div id="cos_modal" style="display:none;position:fixed;top:6%;left:50%;transform:translateX(-50%);width:92%;max-width:1200px;height:80%;background:#fff;border-radius:6px;box-shadow:0 10px 30px rgba(0,0,0,0.35);z-index:99999;overflow:hidden;font-family:Arial, sans-serif;">
  <div style="display:flex;justify-content:space-between;align-items:center;padding:10px 12px;background:#3f5166;color:#fff;font-weight:bold;font-size:14px;">
    <div id="cos_modal_title">Select Lots</div>
    <button id="cos_modal_close_x" type="button" style="background:transparent;border:0;color:#fff;font-size:18px;cursor:pointer;line-height:1;">×</button>
  </div>
  <iframe id="cos_modal_iframe" src="about:blank" style="border:0;width:100%;height:calc(100% - 44px);"></iframe>
</div>

<style>
  .cos_tbl_row{display:grid;grid-template-columns:38px 2.2fr 1fr 120px 110px 110px 110px 110px 110px;gap:8px;padding:8px 12px;font-size:12px;border-bottom:1px solid #eee;align-items:center;background:#fff;}

  .cos_tbl_row_input{display:grid;grid-template-columns:38px 2.2fr 1fr 120px 110px 110px 110px 110px 110px 120px;gap:8px;padding:8px 12px;font-size:12px;border-bottom:1px solid #eee;align-items:center;background:#fff;}
  .cos_tbl_row_input:nth-child(even){background:#fafafa;}
  .cos_tbl_row_input button{padding:6px 10px;cursor:pointer;}

  .cos_tbl_row:nth-child(even){background:#fafafa;}
  .cos_tbl_row input[type="text"]{padding:6px;width:140px;text-align:right;}
  .cos_tbl_row input[type="checkbox"]{width:16px;height:16px;}
  .cos_empty{padding:10px 12px;color:#666;font-size:12px;}
  .cos_badge{display:inline-block;padding:2px 6px;border-radius:10px;background:#f1f3f6;font-size:11px;color:#333;}

  .cos_sum_grid{display:grid;grid-template-columns:1fr 1fr;gap:12px;padding:12px;}
  .cos_sum_box{border:1px solid #e3e3e3;border-radius:6px;overflow:hidden;}
  .cos_sum_box_hdr{padding:8px 10px;background:#f7f7f7;border-bottom:1px solid #e3e3e3;font-weight:bold;font-size:12px;}
  .cos_sum_row{display:grid;grid-template-columns: 2fr 1fr;gap:8px;padding:8px 10px;border-bottom:1px solid #eee;font-size:12px;align-items:center;background:#fff;}
  .cos_sum_row:nth-child(even){background:#fafafa;}
  .cos_sum_qty{text-align:right;white-space:nowrap;}
</style>

<script>
(function(){
  // Suitelet base url injected by UE
  var SUITELET_BASE_URL = ${JSON.stringify(suiteletBaseUrl)};
  // State
  var inputLotsByItemId = {}; // itemId -> lots[]
  function syncInputLotsHidden(){
    try{
      var h = byId('custpage_cos_input_lots_payload');
      if (h) h.value = JSON.stringify(inputLotsByItemId);
    }catch(e){}
  }
  function loadInputLotsHidden(){
    try{
      var h = byId('custpage_cos_input_lots_payload');
      if (h && h.value){
        var obj = JSON.parse(h.value);
        if (obj && typeof obj === 'object') inputLotsByItemId = obj;
      }
    }catch(e){}
  }

  var currentLotsItem = null; // item object for currently open modal

  var allItems = [];
  var lastMeta = {};
  var outputsSelected = {}; // id -> {id, name, qty}
  var inputsSelected = {};  // id -> {id, name, qty}
  var inputsPrepared = false;

  function byId(id){ return document.getElementById(id); }

  loadInputLotsHidden();


  // Modal helpers (lots selection)
  function buildUrl(baseUrl, params){
    var q = [];
    for (var k in params){
      if (!Object.prototype.hasOwnProperty.call(params, k)) continue;
      q.push(encodeURIComponent(k) + '=' + encodeURIComponent(params[k] == null ? '' : String(params[k])));
    }
    if (!q.length) return baseUrl;
    return baseUrl + (baseUrl.indexOf('?') >= 0 ? '&' : '?') + q.join('&');
  }

  function openLotsModal(item){
    currentLotsItem = item || null;
    var overlay = byId('cos_modal_overlay');
    var modal = byId('cos_modal');
    var iframe = byId('cos_modal_iframe');
    var title = byId('cos_modal_title');
    if (!overlay || !modal || !iframe) return;

    if (title) title.textContent = 'Select Lots - ' + (item && item.name ? item.name : '');

    // Read parent form Location (custrecord_cos_rep_location)
    // var locEl = document.getElementById('custrecord_cos_rep_location');
    var locEl = {value: window.nlapiGetFieldValue('custrecord_cos_rep_location')};
    var repLocationId = '';
    if (locEl) {
      // Works for <select> and hidden inputs
      repLocationId = locEl.value || '';
    }

    var prevLots = (item && item.id) ? (inputLotsByItemId[String(item.id)] || []) : [];
    var prefill = '';
    try { prefill = encodeURIComponent(JSON.stringify(prevLots)); } catch(e) { prefill = ''; }

    var iframeUrl = buildUrl(SUITELET_BASE_URL, {
      mode: 'input',
      itemId: item ? item.id : '',
      itemText: item ? item.name : '',
      repLocationId: repLocationId,
      prefill: prefill
    });

    iframe.src = iframeUrl;
    overlay.style.display = 'block';
    modal.style.display = 'block';
    document.body.style.overflow = 'hidden';
  }

  function closeLotsModal(){
    var overlay = byId('cos_modal_overlay');
    var modal = byId('cos_modal');
    var iframe = byId('cos_modal_iframe');
    if (modal) modal.style.display = 'none';
    if (overlay) overlay.style.display = 'none';
    if (iframe) iframe.src = 'about:blank';
    document.body.style.overflow = '';
  }

  function normalizeItems(items){
    if (!Array.isArray(items)) return [];
    return items
      .filter(function(it){ return it && (it.id || it.internalid); })
      .map(function(it){
        return {
          id: String(it.id || it.internalid),
          name: String(it.name || it.itemid || it.text || it.value || it.id),
          conversion: (it.conversion != null ? String(it.conversion) : ''),
          available: (it.available != null ? String(it.available) : ''),
          onhand: (it.onhand != null ? String(it.onhand) : ''),
          committed: (it.committed != null ? String(it.committed) : ''),
          onorder: (it.onorder != null ? String(it.onorder) : ''),
          backordered: (it.backordered != null ? String(it.backordered) : '')
        };
      });
  }

  function applySearch(items, query){
    var q = (query || '').toLowerCase().trim();
    if (!q) return items;
    return items.filter(function(it){
      return (it.name || '').toLowerCase().indexOf(q) >= 0 || (it.id || '').indexOf(q) >= 0;
    });
  }

  function toNum(v){ var n = parseFloat(v); return isNaN(n) ? 0 : n; }
  function roundNice(n){
    if (n == null) return '';
    var x = Number(n);
    if (!isFinite(x)) return '';
    var s = String(x);
    if (s.indexOf('.') >= 0) s = x.toFixed(6).replace(/\.?0+$/,'');
    return s;
  }

  function suggestInputs(){
    try{
      var outKeys = Object.keys(outputsSelected);
      if (!outKeys.length) return;
      var required = 0;
      outKeys.forEach(function(k){
        var o = outputsSelected[k];
        if (!o) return;
        var it = allItems.find(function(x){ return String(x.id) === String(o.id); });
        var conv = it ? toNum(it.conversion) : 0;
        var qty = toNum(o.qty);
        required += qty * conv;
      });
      if (required <= 0) return;
      var exclude = {};
      outKeys.forEach(function(k){ exclude[String(k)] = true; });
      var candidates = allItems.filter(function(it){
        if (!it || !it.id) return false;
        if (exclude[String(it.id)]) return false;
        return toNum(it.conversion) > 0 && toNum(it.available) > 0;
      }).map(function(it){
        return { id:String(it.id), name:String(it.name||it.id), conv:toNum(it.conversion), avail:toNum(it.available) };
      }).sort(function(a,b){ return (b.conv - a.conv) || a.name.localeCompare(b.name); });
      inputsSelected = {};
      var remaining = required;
      for (var i=0;i<candidates.length && remaining > 0;i++){
        var c = candidates[i];
        var maxNeed = Math.floor(remaining / c.conv);
        if (maxNeed <= 0) continue;
        var useQty = Math.min(maxNeed, Math.floor(c.avail));
        if (useQty <= 0) continue;
        inputsSelected[c.id] = { id:c.id, name:c.name, qty: roundNice(useQty) };
        remaining -= useQty * c.conv;
      }
      if (remaining > 0){
        var tail = candidates.slice().sort(function(a,b){ return (a.conv - b.conv) || a.name.localeCompare(b.name); });
        for (var j=0;j<tail.length && remaining > 0;j++){
          var t = tail[j];
          var already = inputsSelected[t.id] ? toNum(inputsSelected[t.id].qty) : 0;
          var availLeft = Math.floor(t.avail) - already;
          if (availLeft <= 0) continue;
          var need = Math.ceil(remaining / t.conv);
          if (need <= 0) need = 1;
          var add = Math.min(need, availLeft);
          if (add <= 0) continue;
          var newQty = already + add;
          inputsSelected[t.id] = { id:t.id, name:t.name, qty: roundNice(newQty) };
          remaining -= add * t.conv;
        }
      }
      syncHidden();
      updateCounts();
    }catch(e){}
  }

  function countSelected(map){
    return Object.keys(map).length;
  }

  function syncHidden(){
    syncInputLotsHidden();
    var outF = byId('custpage_cos_outputs_payload');
    var inF  = byId('custpage_cos_inputs_payload');
    var sumF = byId('custpage_cos_summary_payload');

    if (outF) {
      var outs = Object.keys(outputsSelected).map(function(k){ return outputsSelected[k]; });
      outF.value = JSON.stringify({ outputs: outs, meta: lastMeta || {} });
    }
    if (inF) {
      var ins = Object.keys(inputsSelected).map(function(k){ return inputsSelected[k]; });
      inF.value = JSON.stringify({ inputs: ins, meta: lastMeta || {} });
    }
    if (sumF) {
      // Keep summary field always updated as a combined snapshot
      var outs2 = Object.keys(outputsSelected).map(function(k){ return outputsSelected[k]; });
      var ins2  = Object.keys(inputsSelected).map(function(k){ return inputsSelected[k]; });
      sumF.value = JSON.stringify({ outputs: outs2, inputs: ins2, meta: lastMeta || {} });
    }
  }

  function updateStepButtons(){
    var btnPrep = byId('cos_btn_prepare_inputs');
    var prepHint = byId('cos_prepare_hint');
    var btnSum = byId('cos_btn_build_summary');
    var sumHint = byId('cos_summary_hint');

    var outCount = countSelected(outputsSelected);
    var inCount  = countSelected(inputsSelected);

    if (btnPrep) btnPrep.disabled = (outCount === 0);
    if (prepHint) prepHint.textContent = (outCount === 0) ? 'Select at least one output to continue.' : 'Ready to select inputs.';

    if (btnSum) btnSum.disabled = (!inputsPrepared || inCount === 0);
    if (sumHint) {
      if (!inputsPrepared) sumHint.textContent = 'Prepare inputs first.';
      else sumHint.textContent = (inCount === 0) ? 'Select at least one input to build summary.' : 'Ready to build summary.';
    }
  }

  function renderTable(rowsEl, items, selectionMap, searchQuery, excludeIds){
    if (!rowsEl) return;
    var isInputTable = (rowsEl.id === 'cos_in_rows');
    var exclude = excludeIds || {};

    var filtered = applySearch(items, searchQuery);
    filtered = filtered.filter(function(it){ return !exclude[it.id]; });

    if (!allItems.length) {
      rowsEl.innerHTML = '<div class="cos_empty">No items found for the selected Repack Species.</div>';
      return;
    }

    if (!filtered.length) {
      rowsEl.innerHTML = '<div class="cos_empty">No matching items.</div>';
      return;
    }

    rowsEl.innerHTML = '';

    filtered.forEach(function(it){
      var row = document.createElement('div');
      row.className = isInputTable ? 'cos_tbl_row_input' : 'cos_tbl_row';

      // checkbox
      var c1 = document.createElement('div');
      var cb = document.createElement('input');
      cb.type = 'checkbox';
      cb.checked = !!selectionMap[it.id];
      c1.appendChild(cb);

      // name
      var c2 = document.createElement('div');
      c2.textContent = it.name;

      // qty
      var cConv = document.createElement('div');
      cConv.style.textAlign = 'right';
      cConv.textContent = (it.conversion != null ? it.conversion : '');

      var cAvail = document.createElement('div');
      cAvail.style.textAlign = 'right';
      cAvail.textContent = (it.available != null ? it.available : '');

      var cOnHand = document.createElement('div');
      cOnHand.style.textAlign = 'right';
      cOnHand.textContent = (it.onhand != null ? it.onhand : '');

      var cCommitted = document.createElement('div');
      cCommitted.style.textAlign = 'right';
      cCommitted.textContent = (it.committed != null ? it.committed : '');

      var cOnOrder = document.createElement('div');
      cOnOrder.style.textAlign = 'right';
      cOnOrder.textContent = (it.onorder != null ? it.onorder : '');

      var cBackordered = document.createElement('div');
      cBackordered.style.textAlign = 'right';
      cBackordered.textContent = (it.backordered != null ? it.backordered : '');


      var c3 = document.createElement('div');
      c3.style.textAlign = 'right';
      var qty = document.createElement('input');
      qty.type = 'text';
      qty.placeholder = '0';
      qty.value = selectionMap[it.id] ? String(selectionMap[it.id].qty || '') : '';
      qty.disabled = !selectionMap[it.id];
      c3.appendChild(qty);

      // events
      cb.addEventListener('change', function(){
        if (cb.checked) {
          selectionMap[it.id] = { id: it.id, name: it.name, qty: qty.value ? qty.value : '1' };
          qty.disabled = false;
          if (!qty.value) qty.value = '1';
        } else {
          delete selectionMap[it.id];
          qty.disabled = true;
          qty.value = '';
        }
        syncHidden();
        updateCounts();
        updateStepButtons();

        // If outputs changed and inputs already prepared, refresh inputs list (exclude outputs)
        if (rowsEl.id === 'cos_out_rows' && inputsPrepared) {
          renderInputs();
        }
      });

      qty.addEventListener('input', function(){
        if (!selectionMap[it.id]) return;
        selectionMap[it.id].qty = qty.value;
        syncHidden();
      });

      if (isInputTable) {
        var c4 = document.createElement('div');
        c4.style.textAlign = 'right';
        var btnLots = document.createElement('button');
        btnLots.type = 'button';
        btnLots.textContent = 'Select Lots';
        var span = document.createElement('span');
        span.style.marginLeft = '8px';
        span.style.fontSize = '12px';
        span.style.color = '#666';
        span.setAttribute('data-lot-sum', String(it.id));
        var sel = inputLotsByItemId[String(it.id)];
        if (sel && sel.length) { span.textContent = '(' + sel.length + ' selected)'; } else { span.textContent = ''; }
        btnLots.addEventListener('click', function(e){
          e.preventDefault();
          e.stopPropagation();
          openLotsModal(it);
        });
        c4.appendChild(btnLots);
        c4.appendChild(span);
        row.appendChild(c1);
        row.appendChild(c2);
        row.appendChild(c3);
        row.appendChild(cConv);
        row.appendChild(cAvail);
        row.appendChild(cOnHand);
        row.appendChild(cCommitted);
        row.appendChild(cOnOrder);
        row.appendChild(cBackordered);
        row.appendChild(c4);
      } else {
        row.appendChild(c1);
        row.appendChild(c2);
        row.appendChild(c3);
        row.appendChild(cConv);
        row.appendChild(cAvail);
        row.appendChild(cOnHand);
        row.appendChild(cCommitted);
        row.appendChild(cOnOrder);
        row.appendChild(cBackordered);
      }
      rowsEl.appendChild(row);
    });
  }

  function updateCounts(){
    var outCountEl = byId('cos_out_count');
    var inCountEl  = byId('cos_in_count');

    if (outCountEl) outCountEl.textContent = countSelected(outputsSelected) + ' selected';
    if (inCountEl)  inCountEl.textContent  = countSelected(inputsSelected) + ' selected';
  }

  function renderOutputs(){
    var outRows = byId('cos_out_rows');
    var outQ = byId('cos_out_search') ? byId('cos_out_search').value : '';
    renderTable(outRows, allItems, outputsSelected, outQ, {});
    updateCounts();
    updateStepButtons();
  }

  function renderInputs(){
    var inRows = byId('cos_in_rows');
    var inQ = byId('cos_in_search') ? byId('cos_in_search').value : '';

    // Exclude selected outputs from the input list for clarity
    var exclude = {};
    Object.keys(outputsSelected).forEach(function(k){ exclude[k] = true; });

    renderTable(inRows, allItems, inputsSelected, inQ, exclude);
    updateCounts();
    updateStepButtons();
  }

  
  function resetStep2And3(){
    // Clear inputs and any UI built from them
    inputsSelected = {};
    inputsPrepared = false;

    // Clear step2 input search box and rows
    try {
      var inSearch = byId('cos_in_search');
      if (inSearch) inSearch.value = '';
    } catch(e) {}

    try {
      var inRows = byId('cos_in_rows');
      if (inRows) inRows.innerHTML = '';
    } catch(e) {}

    // Hide step2 container until shown again
    try {
      var step2 = byId('cos_step2_wrap');
      if (step2) step2.style.display = 'none';
    } catch(e) {}

    // Clear summary UI (step3)
    try {
      var sumBody = byId('cos_summary_body');
      if (sumBody) sumBody.innerHTML = '';
    } catch(e) {}

    try {
      var sumSection = byId('cos_summary_section');
      if (sumSection) sumSection.style.display = 'none';
    } catch(e) {}

    try {
      var sumHint = byId('cos_summary_hint');
      if (sumHint) sumHint.textContent = 'Prepare inputs first.';
    } catch(e) {}

    // Update buttons/hidden fields
    updateStepButtons();
    syncHidden();
  }

function showStep2(){
    var wrap = byId('cos_step2_wrap');
    if (wrap) wrap.style.display = 'block';
    inputsPrepared = true;

    // Auto-suggest inputs when Step 2 is prepared
    suggestInputs();

    renderInputs();

    var sumSection = byId('cos_summary_section');
    if (sumSection) sumSection.style.display = 'none';

    updateStepButtons();
  }

  function renderSummary(){
    var summarySection = byId('cos_summary_section');
    var body = byId('cos_summary_body');
    if (!summarySection || !body) return;

    var outs = Object.keys(outputsSelected).map(function(k){ return outputsSelected[k]; });
    var ins  = Object.keys(inputsSelected).map(function(k){ return inputsSelected[k]; });

    if (!outs.length || !ins.length) {
      body.innerHTML = '<div class="cos_empty">Select at least one output and one input to build the summary.</div>';
      summarySection.style.display = 'block';
      syncHidden();
      return;
    }

    function buildBox(title, rows){
      var html = '';
      html += '<div class="cos_sum_box">';
      html += '<div class="cos_sum_box_hdr">' + title + ' <span class="cos_badge">' + rows.length + '</span></div>';
      rows.forEach(function(r){
        html += '<div class="cos_sum_row">';
        html += '<div>' + r.name + '</div>';
        html += '<div class="cos_sum_qty">' + (r.qty || '') + '</div>';
        html += '</div>';
      });
      html += '</div>';
      return html;
    }

    var html2 = '';
    html2 += '<div class="cos_sum_grid">';
    html2 += buildBox('Outputs', outs);
    html2 += buildBox('Inputs', ins);
    html2 += '</div>';

    body.innerHTML = html2;
    summarySection.style.display = 'block';
    syncHidden();

    // Scroll into view for step-by-step UX
    try { summarySection.scrollIntoView({ behavior: 'smooth', block: 'start' }); } catch(e) {}
  }

  // Wire UI events (search, buttons)
  function wireUiOnce(){
    var outSearch = byId('cos_out_search');
    var inSearch  = byId('cos_in_search');
    var btnPrep   = byId('cos_btn_prepare_inputs');
    var btnSum    = byId('cos_btn_build_summary');

    if (outSearch && !outSearch._cosBound) {
      outSearch._cosBound = true;
      outSearch.addEventListener('input', function(){ renderOutputs(); });
    }

    if (inSearch && !inSearch._cosBound) {
      inSearch._cosBound = true;
      inSearch.addEventListener('input', function(){ if (inputsPrepared) renderInputs(); });
    }

    if (btnPrep && !btnPrep._cosBound) {
      btnPrep._cosBound = true;
      btnPrep.addEventListener('click', function(){
        resetStep2And3();
        showStep2();
        // Scroll to step2
        try { byId('cos_in_section').scrollIntoView({ behavior: 'smooth', block: 'start' }); } catch(e) {}
      });
    }

    if (btnSum && !btnSum._cosBound) {
      btnSum._cosBound = true;
      btnSum.addEventListener('click', function(){
        renderSummary();
      });
    }
    // Modal close wiring
    var closeX = byId('cos_modal_close_x');
    var overlay = byId('cos_modal_overlay');
    if (closeX && !closeX._cosBound) {
      closeX._cosBound = true;
      closeX.addEventListener('click', function(){ closeLotsModal(); });
    }
    if (overlay && !overlay._cosBound) {
      overlay._cosBound = true;
      overlay.addEventListener('click', function(){ closeLotsModal(); });
    }

  }

  function resetAll(){
    outputsSelected = {};
    inputsSelected = {};
    inputsPrepared = false;

    // Hide step2 + summary
    var wrap2 = byId('cos_step2_wrap');
    if (wrap2) wrap2.style.display = 'none';

    var sumSection = byId('cos_summary_section');
    if (sumSection) sumSection.style.display = 'none';

    syncHidden();
    updateCounts();
    updateStepButtons();
  }


  // Listen for iframe suitelet messages (optional)
  window.addEventListener('message', function(event){
    try{
      var data = event.data;
      if (!data || typeof data !== 'object') return;
      if (data.type === 'COS_REPACK_MODAL_CLOSE') {
        closeLotsModal();
        return;
      }
      if (data.type === 'COS_REPACK_MODAL_SUBMIT') {
        try {
          if (data.payload && data.payload.itemId) {
            inputLotsByItemId[String(data.payload.itemId)] = (data.payload.lots || []);
            syncInputLotsHidden();
          } else if (currentLotsItem && currentLotsItem.id) {
            inputLotsByItemId[String(currentLotsItem.id)] = (data.payload && data.payload.lots) ? data.payload.lots : [];
            syncInputLotsHidden();
          }

          // Update inline summary badge for the current item (if present)
          var itemKey = (data.payload && data.payload.itemId) ? String(data.payload.itemId) : (currentLotsItem && currentLotsItem.id ? String(currentLotsItem.id) : '');
          if (itemKey) {
            var el = document.querySelector('[data-lot-sum="' + itemKey + '"]');
            if (el) {
              var arr = inputLotsByItemId[itemKey] || [];
              el.textContent = arr.length ? '(' + arr.length + ' selected)' : '';
            }
          }
        } catch (e) {}
        closeLotsModal();
        return;
      }
    } catch(e){}
  });

  // Expose for Client Script
  window.COS_REPACK_UI = window.COS_REPACK_UI || {};

  window.COS_REPACK_UI.setItems = function(items, meta){
    lastMeta = meta || {};
    allItems = normalizeItems(items);

    // Reset the step flow whenever species/items change
    resetAll();

    wireUiOnce();
    renderOutputs();
  };

  // initial wire
  wireUiOnce();
  updateStepButtons();
  updateCounts();
  syncHidden();

})();
</script>
`;
    };

    return { beforeLoad };

});
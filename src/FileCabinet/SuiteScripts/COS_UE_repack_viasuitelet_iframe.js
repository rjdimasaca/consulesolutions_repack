/**
 * @NApiVersion 2.1
 * @NScriptType UserEventScript
 */

define(['N/ui/serverWidget'], (serverWidget) => {

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

  <div class="cos_tbl_hdr" style="display:grid;grid-template-columns:38px 2.2fr 1fr;gap:8px;padding:8px 12px;font-weight:bold;font-size:12px;background:#eee;border-bottom:1px solid #ddd;align-items:center;">
    <div></div>
    <div>Item</div>
    <div style="text-align:right;">Qty</div>
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
  <div style="display:grid;grid-template-columns: 2fr 1fr;gap:12px;align-items:start;">

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

      <div class="cos_tbl_hdr" style="display:grid;grid-template-columns:38px 2.2fr 1fr;gap:8px;padding:8px 12px;font-weight:bold;font-size:12px;background:#eee;border-bottom:1px solid #ddd;align-items:center;">
        <div></div>
        <div>Item</div>
        <div style="text-align:right;">Qty</div>
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

<style>
  .cos_tbl_row{display:grid;grid-template-columns:38px 2.2fr 1fr;gap:8px;padding:8px 12px;font-size:12px;border-bottom:1px solid #eee;align-items:center;background:#fff;}
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
  // State
  var allItems = [];
  var lastMeta = {};
  var outputsSelected = {}; // id -> {id, name, qty}
  var inputsSelected = {};  // id -> {id, name, qty}
  var inputsPrepared = false;

  function byId(id){ return document.getElementById(id); }

  function normalizeItems(items){
    if (!Array.isArray(items)) return [];
    return items
      .filter(function(it){ return it && (it.id || it.internalid); })
      .map(function(it){
        return {
          id: String(it.id || it.internalid),
          name: String(it.name || it.itemid || it.text || it.value || it.id)
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

  function countSelected(map){
    return Object.keys(map).length;
  }

  function syncHidden(){
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
      row.className = 'cos_tbl_row';

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

      row.appendChild(c1);
      row.appendChild(c2);
      row.appendChild(c3);
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

  function showStep2(){
    var wrap = byId('cos_step2_wrap');
    if (wrap) wrap.style.display = 'block';
    inputsPrepared = true;
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
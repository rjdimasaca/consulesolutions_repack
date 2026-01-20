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

        // Subtab
        form.addTab({
            id: 'custpage_cos_input_output',
            label: 'Inputs and Outputs'
        });

        // Client script drives interactive filtering + item search
        // Update this path to your File Cabinet path if needed.
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

        // Inline UI
        const htmlField = form.addField({
            id: 'custpage_cos_io_html',
            type: serverWidget.FieldType.INLINEHTML,
            label: ' ',
            container: 'custpage_cos_input_output'
        });

        htmlField.defaultValue = `
      <div style="padding:10px;border:1px solid #ccc;border-radius:6px;margin-bottom:12px;">
        <strong>Repack Builder</strong><br/>
        <small style="color:#666;">Step-by-step: select Outputs first, then prepare Inputs.</small>
      </div>

      <!-- OUTPUTS -->
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

      <!-- INPUTS (hidden until prepared) -->
      <div id="cos_in_section" style="display:none;border:1px solid #ddd;border-radius:6px;overflow:hidden;">
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

      <style>
        .cos_tbl_row{display:grid;grid-template-columns:38px 2.2fr 1fr;gap:8px;padding:8px 12px;font-size:12px;border-bottom:1px solid #eee;align-items:center;background:#fff;}
        .cos_tbl_row:nth-child(even){background:#fafafa;}
        .cos_tbl_row input[type="text"]{padding:6px;width:140px;text-align:right;}
        .cos_tbl_row input[type="checkbox"]{width:16px;height:16px;}
        .cos_muted{color:#666;}
        .cos_empty{padding:10px 12px;color:#666;font-size:12px;}
      </style>

      <script>
        (function(){
          // State
          var allItems = [];
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

          function syncHidden(){
            var outF = byId('custpage_cos_outputs_payload');
            var inF = byId('custpage_cos_inputs_payload');

            if (outF) {
              var outs = Object.keys(outputsSelected).map(function(k){ return outputsSelected[k]; });
              outF.value = JSON.stringify({ outputs: outs });
            }
            if (inF) {
              var ins = Object.keys(inputsSelected).map(function(k){ return inputsSelected[k]; });
              inF.value = JSON.stringify({ inputs: ins });
            }
          }

          function countSelected(map){
            return Object.keys(map).length;
          }

          function updatePrepareButton(){
            var btn = byId('cos_btn_prepare_inputs');
            var hint = byId('cos_prepare_hint');
            var c = countSelected(outputsSelected);
            if (!btn) return;

            btn.disabled = (c === 0);
            if (hint) {
              hint.textContent = c === 0 ? 'Select at least one output to continue.' : 'Ready to select inputs.';
            }
          }

          function applySearch(items, query){
            var q = (query || '').toLowerCase().trim();
            if (!q) return items;
            return items.filter(function(it){
              return (it.name || '').toLowerCase().indexOf(q) >= 0 || (it.id || '').indexOf(q) >= 0;
            });
          }

          function renderTable(rowsEl, items, selectionMap, mode, excludeIds){
            if (!rowsEl) return;
            var exclude = excludeIds || {};

            if (!items.length) {
              rowsEl.innerHTML = '<div class="cos_empty">No items found for the selected Repack Species.</div>';
              return;
            }

            // Build DOM to avoid quoting issues
            rowsEl.innerHTML = '';

            items.forEach(function(it){
              if (exclude[it.id]) return;

              var row = document.createElement('div');
              row.className = 'cos_tbl_row';

              var c1 = document.createElement('div');
              var cb = document.createElement('input');
              cb.type = 'checkbox';
              cb.checked = !!selectionMap[it.id];
              c1.appendChild(cb);

              var c2 = document.createElement('div');
              c2.textContent = it.name;

              var c3 = document.createElement('div');
              c3.style.textAlign = 'right';
              var qty = document.createElement('input');
              qty.type = 'text';
              qty.placeholder = '0';
              qty.disabled = !cb.checked;
              qty.value = cb.checked ? String(selectionMap[it.id].qty || '') : '';
              c3.appendChild(qty);

              cb.addEventListener('change', function(){
                if (cb.checked) {
                  selectionMap[it.id] = { id: it.id, name: it.name, qty: qty.value || '1' };
                  qty.disabled = false;
                  if (!qty.value) qty.value = '1';
                } else {
                  delete selectionMap[it.id];
                  qty.disabled = true;
                  qty.value = '';
                }

                syncHidden();
                if (mode === 'outputs') updatePrepareButton();
                updateCounts();
              });

              qty.addEventListener('input', function(){
                if (!cb.checked) return;
                selectionMap[it.id] = { id: it.id, name: it.name, qty: qty.value };
                syncHidden();
              });

              row.appendChild(c1);
              row.appendChild(c2);
              row.appendChild(c3);
              rowsEl.appendChild(row);
            });
          }

          function updateCounts(){
            var outCount = byId('cos_out_count');
            var inCount = byId('cos_in_count');
            if (outCount) outCount.textContent = countSelected(outputsSelected) ? (countSelected(outputsSelected) + ' selected') : '';
            if (inCount) inCount.textContent = countSelected(inputsSelected) ? (countSelected(inputsSelected) + ' selected') : '';
          }

          function renderOutputs(){
            var rowsEl = byId('cos_out_rows');
            var q = (byId('cos_out_search') && byId('cos_out_search').value) || '';
            var filtered = applySearch(allItems, q);
            renderTable(rowsEl, filtered, outputsSelected, 'outputs', null);
            updatePrepareButton();
            updateCounts();
          }

          function renderInputs(){
            var rowsEl = byId('cos_in_rows');
            var q = (byId('cos_in_search') && byId('cos_in_search').value) || '';
            var filtered = applySearch(allItems, q);

            // exclude outputs by default to reduce confusion
            var exclude = {};
            Object.keys(outputsSelected).forEach(function(k){ exclude[k] = true; });

            renderTable(rowsEl, filtered, inputsSelected, 'inputs', exclude);
            updateCounts();
          }

          // Button: Prepare Inputs
          var prepareBtn = byId('cos_btn_prepare_inputs');
          if (prepareBtn) {
            prepareBtn.addEventListener('click', function(){
              inputsPrepared = true;
              var inSec = byId('cos_in_section');
              if (inSec) inSec.style.display = 'block';
              renderInputs();
            });
          }

          // Search boxes
          var outSearch = byId('cos_out_search');
          if (outSearch) outSearch.addEventListener('input', renderOutputs);
          var inSearch = byId('cos_in_search');
          if (inSearch) inSearch.addEventListener('input', function(){
            if (!inputsPrepared) return;
            renderInputs();
          });

          // Public API for client script
          window.COS_REPACK_UI = window.COS_REPACK_UI || {};
          window.COS_REPACK_UI.setItems = function(items, meta){
            allItems = normalizeItems(items);
            // When species changes, clear selections (step-by-step UX)
            outputsSelected = {};
            inputsSelected = {};
            inputsPrepared = false;

            var inSec = byId('cos_in_section');
            if (inSec) inSec.style.display = 'none';

            syncHidden();
            renderOutputs();
          };

          // Initialize counts/btn
          updatePrepareButton();
          updateCounts();
          syncHidden();
        })();
      </script>
    `;
    };

    return { beforeLoad };
});

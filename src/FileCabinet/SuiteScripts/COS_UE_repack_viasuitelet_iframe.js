/**
 * @NApiVersion 2.1
 * @NScriptType UserEventScript
 */

define(['N/ui/serverWidget','N/url','N/search','N/log','N/record'], (serverWidget, url, search, log, record) => {

    // Suitelet used by the "Print Repack" button (VIEW mode)
    // NOTE: replace these IDs if your Script/Deployment IDs differ in your account.
    const PRINT_REPACK_SL_SCRIPTID = 'customscript_cos_sl_repack_print';
    const PRINT_REPACK_SL_DEPLOYID = 'customdeploy_cos_sl_repack_print';


    // Suitelet used by the "Create Work Orders" button (VIEW mode)
    // NOTE: replace these IDs if your Script/Deployment IDs differ in your account.
    const CREATE_WO_SL_SCRIPTID = 'customscript_cos_sl_repack_actions';
    const CREATE_WO_SL_DEPLOYID = 'customdeploy_cos_sl_repack_actions';

    // Repack status field + values
    const REPACK_STATUS_FIELDID = 'custrecord_cos_rep_status';
    const REPACK_STATUS_DRAFT = '1';
    const REPACK_STATUS_WO_CREATED = '2';

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


        // Client Script (also needed in VIEW mode for the Create Work Orders iframe modal)
        form.clientScriptModulePath = './COS_CS_repack.js';

// VIEW MODE: Read-only Repack Summary (rendered to match the interactive Step 3 UI)
        // In VIEW mode the user won't interact; we just rebuild the Summary HTML from saved payload fields.
        if (type === scriptContext.UserEventType.VIEW) {
            const rec = scriptContext.newRecord;

            // Add "Print Repack" button (VIEW mode only)
            try {
                const printUrl = url.resolveScript({
                    scriptId: PRINT_REPACK_SL_SCRIPTID,
                    deploymentId: PRINT_REPACK_SL_DEPLOYID,
                    params: {
                        repackid: rec.id
                    }
                });

                form.addButton({
                    id: 'custpage_cos_print_repack',
                    label: 'Print Repack',
                    functionName: 'printCosRepackPdf'
                });

                const inline = form.addField({
                    id: 'custpage_cos_print_repack_inline',
                    type: serverWidget.FieldType.INLINEHTML,
                    label: ' '
                });

                inline.defaultValue = '<script type="text/javascript">' +
                    'function printCosRepackPdf(){' +
                    '  try {' +
                    '    var u = ' + JSON.stringify(printUrl) + ';' +
                    '    window.open(u, "_blank", "width=1100,height=800,scrollbars=yes,resizable=yes");' +
                    '  } catch (e) { console && console.log && console.log("Print Repack failed", e); }' +
                    '}' +
                    '</script>';

                // Add "Create Work Orders" button (VIEW mode only) - only when status is Draft (1)
                try {
                    let repStatus = '';
                    try { repStatus = rec.getValue({ fieldId: REPACK_STATUS_FIELDID }); } catch (_e) {}
                    const repStatusStr = (repStatus === null || repStatus === undefined) ? '' : String(repStatus);

                    log.debug("repStatusStr", repStatusStr);
                    if (repStatusStr === '' || repStatusStr === REPACK_STATUS_DRAFT) {
                        const createWoUrl = url.resolveScript({
                            scriptId: CREATE_WO_SL_SCRIPTID,
                            deploymentId: CREATE_WO_SL_DEPLOYID,
                            params: {
                                repackid: rec.id,
                                rectype: rec.type,
                                action: 'createWO'
                            }
                        });


                        // Pass the resolved Suitelet URL to the client script (VIEW mode cannot call url.resolveScript client-side reliably)
                        const woUrlFld = form.addField({
                            id: 'custpage_cos_createwo_url',
                            type: serverWidget.FieldType.LONGTEXT,
                            label: 'Create WO URL'
                        });
                        woUrlFld.updateDisplayType({ displayType: serverWidget.FieldDisplayType.HIDDEN });
                        woUrlFld.defaultValue = String(createWoUrl || '');
                        form.addButton({
                            id: 'custpage_cos_create_workorders',
                            label: 'Create Work Orders',
                            functionName: 'cosOpenCreateWoModal'
                        });
                    }
                } catch (e) {
                    try { log.error({ title: 'Create Work Orders button failed', details: e }); } catch (_e) {}
                }

            } catch (e) {
                log.error({ title: 'Print Repack button failed', details: e });
            }


            let summaryStr = '';
            let lotsStr = '';
            try { summaryStr = rec.getValue({ fieldId: 'custrecord_cos_rep_summary_payload' }) || ''; } catch (e) {}
            try { lotsStr = rec.getValue({ fieldId: 'custrecord_cos_rep_input_lots_payload' }) || ''; } catch (e) {}

            const htmlField = form.addField({
                id: 'custpage_cos_view_summary_html',
                type: serverWidget.FieldType.INLINEHTML,
                label: ' ',
                container: 'custpage_cos_input_output'
            });

            // NOTE: we purposely use the same markup + CSS classes as the interactive summary section,
            // so VIEW mode looks identical and doesn't alienate users.
            const viewHtml = `
<div id="cos_summary_section" style="border:1px solid #ddd;border-radius:6px;overflow:hidden;margin-bottom:12px;">
  <div style="background:#2f3f53;color:#fff;padding:10px 12px;">
    <div style="font-weight:bold;">Repack Summary</div>
    <div style="font-size:12px;opacity:0.9;">Review outputs and inputs before proceeding</div>
  </div>

  <div id="cos_summary_body" style="background:#fff;"></div>
</div>

<style>
  .cos_empty{padding:10px 12px;color:#666;font-size:12px;}
  .cos_badge{display:inline-block;padding:2px 6px;border-radius:10px;background:#f1f3f6;font-size:11px;color:#333;}
  .cos_sum_grid{display:grid;grid-template-columns:1fr 1fr;gap:12px;padding:12px;}
  .cos_sum_box{border:1px solid #e3e3e3;border-radius:6px;overflow:hidden;}
  .cos_sum_box_hdr{padding:8px 10px;background:#f7f7f7;border-bottom:1px solid #e3e3e3;font-weight:bold;font-size:12px;}
  .cos_sum_row{display:grid;grid-template-columns: 2fr 1fr;gap:8px;padding:8px 10px;border-bottom:1px solid #eee;font-size:12px;align-items:center;background:#fff;}
  .cos_sum_row:nth-child(even){background:#fafafa;}
  .cos_sum_qty{text-align:right;white-space:nowrap;}

  .cos_dist_wrap{padding:12px;border-top:1px solid #eee;background:#fff;}
  .cos_dist_title{font-weight:bold;font-size:12px;margin-bottom:6px;}
  .cos_dist_sub{font-size:12px;color:#666;margin-bottom:10px;line-height:1.4;}
  .cos_dist_grid{display:grid;grid-template-columns:1fr;gap:12px;}
  .cos_dist_row{display:grid;grid-template-columns: 2fr 1fr 90px;gap:8px;padding:8px 10px;border-bottom:1px solid #eee;font-size:12px;align-items:center;background:#fff;}
  .cos_dist_row:nth-child(even){background:#fafafa;}
  .cos_dist_right{text-align:right;white-space:nowrap;}
  .cos_dist_small{font-size:11px;color:#666;}
  .cos_dist_toggle{float:right;cursor:pointer;color:#0070d2;font-size:11px;margin-left:8px;user-select:none;}
  .cos_dist_body{margin-top:2px;}
</style>

<script>
(function(){
  var SUMMARY_RAW = ${JSON.stringify(summaryStr || '')};
  var LOTS_RAW = ${JSON.stringify(lotsStr || '')};

  function safeParse(raw){
    try{
      if (!raw || typeof raw !== 'string') return null;
      var t = raw.trim();
      if (!t) return null;
      var p = JSON.parse(t);
      if (typeof p === 'string') {
        try { return JSON.parse(p); } catch(_e) { return p; }
      }
      return p;
    }catch(e){ return null; }
  }

  function toNum(v){ var n = parseFloat(v); return isNaN(n) ? 0 : n; }
  function roundNice(n){
    var x = Number(n);
    if (!isFinite(x)) return 0;
    // match interactive: show integers cleanly, otherwise up to 6 decimals
    var r = Math.round(x * 1e6) / 1e6;
    return (Math.abs(r - Math.round(r)) < 1e-9) ? String(Math.round(r)) : String(r);
  }

  function byId(id){ return document.getElementById(id); }

  var summary = safeParse(SUMMARY_RAW) || {};
  var lotsObj = safeParse(LOTS_RAW) || {};
  if (!lotsObj || typeof lotsObj !== 'object') lotsObj = {};

  // match interactive variable name
  var inputLotsByItemId = lotsObj;

  var body = byId('cos_summary_body');
  if (!body){
    return;
  }

  var outs = Array.isArray(summary.outputs) ? summary.outputs : [];
  var ins  = Array.isArray(summary.inputs) ? summary.inputs : [];
  // Purchase Order lines are stored by the interactive UI under summary.purchase
  var pos  = Array.isArray(summary.purchase) ? summary.purchase : (Array.isArray(summary.purchaseOrder) ? summary.purchaseOrder : []);

  if (!outs.length || (!ins.length && !pos.length)){
    body.innerHTML = '<div class="cos_empty">No saved summary to display. Build the summary and save the record.</div>';
    return;
  }

  function normalizeRow(r){
    if (!r) return { id:'', name:'', qty:'' };
    return {
      id: (r.id != null ? String(r.id) : ''),
      name: (r.name || r.itemName || r.text || ''),
      qty: (r.qty != null ? String(r.qty) : '')
    };
  }

  outs = outs.map(normalizeRow);
  ins  = ins.map(normalizeRow);
  pos  = (Array.isArray(pos) ? pos : []).map(normalizeRow);

  function buildBox(title, rows){
    var html = '';
    html += '<div class="cos_sum_box">';
    html += '<div class="cos_sum_box_hdr">' + title + ' <span class="cos_badge">' + rows.length + '</span></div>';
    rows.forEach(function(r){
      html += '<div class="cos_sum_row">';
      html += '<div>' + (r.name || '') + '</div>';
      html += '<div class="cos_sum_qty">' + (r.qty || '') + '</div>';
      html += '</div>';
    });
    html += '</div>';
    return html;
  }

  // Shares / requirements
  // Prefer saved distribution.shares if present, otherwise compute like interactive:
  // share based on reqBase = qty * conv, fallback to qty if missing.
  var outReqs = [];
  var totalReqBase = 0;

  var outConvById = {};
  try{
    var convMap = (summary && summary.meta && summary.meta.conversions) ? summary.meta.conversions : null;
    if (convMap && typeof convMap === 'object') outConvById = convMap;
  }catch(e){}

  outs.forEach(function(o){
    var qty = toNum(o.qty);
    var conv = 0;
    // payload enrichment may store conv on each output row
    if (summary && Array.isArray(summary.outputs)){
      try{
        for (var i=0;i<summary.outputs.length;i++){
          var so = summary.outputs[i];
          if (so && String(so.id) === String(o.id) && so.conv != null){
            conv = toNum(so.conv);
            break;
          }
        }
      }catch(e){}
    }
    if (!conv && outConvById && outConvById[String(o.id)] != null){
      conv = toNum(outConvById[String(o.id)]);
    }
    var reqBase = qty * conv;
    outReqs.push({ id:o.id, name:o.name, qty:o.qty, conv:conv, reqBase:reqBase, share:0 });
    totalReqBase += reqBase;
  });

  if (totalReqBase <= 0){
    totalReqBase = 0;
    outReqs.forEach(function(or){
      var q = toNum(or.qty);
      or.reqBase = q;
      totalReqBase += q;
    });
  }

  outReqs.forEach(function(or){
    or.share = (totalReqBase > 0) ? (or.reqBase / totalReqBase) : 0;
  });

  // Allocation map: prefer saved distribution.allocations, else compute like interactive
  var allocMap = {};
  try{
    if (summary && summary.distribution && summary.distribution.allocations && typeof summary.distribution.allocations === 'object'){
      allocMap = summary.distribution.allocations;
    }
  }catch(e){}
  if (!allocMap || typeof allocMap !== 'object') allocMap = {};

  // If allocMap is empty, compute
  if (!Object.keys(allocMap).length){
    outReqs.forEach(function(or){ allocMap[String(or.id)] = {}; });

    ins.forEach(function(inp){
      var inQty = toNum(inp.qty);
      var running = 0;
      for (var i=0;i<outReqs.length;i++){
        var or = outReqs[i];
        var q = 0;
        if (i === outReqs.length - 1){
          q = inQty - running;
        } else {
          q = inQty * (or.share || 0);
          q = toNum(roundNice(q));
          running += q;
        }
        allocMap[String(or.id)][String(inp.id)] = q;
      }
    });
  }

  // Purchase Order allocation map: prefer saved distribution.purchaseAllocations, else compute
  var poAllocMap = {};
  try{
    if (summary && summary.distribution && summary.distribution.purchaseAllocations && typeof summary.distribution.purchaseAllocations === 'object'){
      poAllocMap = summary.distribution.purchaseAllocations;
    }
  }catch(e){}
  if (!poAllocMap || typeof poAllocMap !== 'object') poAllocMap = {};

  if (pos && pos.length && !Object.keys(poAllocMap).length){
    outReqs.forEach(function(or){ poAllocMap[String(or.id)] = {}; });
    pos.forEach(function(p){
      var pQty = toNum(p.qty);
      var running = 0;
      for (var i=0;i<outReqs.length;i++){
        var or = outReqs[i];
        var q = 0;
        if (i === outReqs.length - 1){
          q = pQty - running;
        } else {
          q = pQty * (or.share || 0);
          q = toNum(roundNice(q));
          running += q;
        }
        poAllocMap[String(or.id)][String(p.id)] = q;
      }
    });
  }

  function buildDistBoxUsingMap(outReq){
    var html = '';
    html += '<div class="cos_sum_box">';
    html += '<div class="cos_sum_box_hdr">'
         +  (outReq.name || '') + ' <span class="cos_badge">' + (outReq.qty || '') + '</span>'
         +  ' <span class="cos_dist_small">(' + roundNice((outReq.share || 0) * 100) + '%)</span>'
         +  ' <span class="cos_dist_toggle" data-outid="' + (outReq.id || '') + '">Hide inputs</span></div>';

    html += '<div class="cos_dist_row" style="font-weight:bold;background:#f7f7f7;">'
         +  '<div>Input</div><div class="cos_dist_right">Allocated Qty</div><div class="cos_dist_right">Lots</div>'
         +  '</div>';

    html += '<div id="cos_dist_body_' + (outReq.id || '') + '" class="cos_dist_body">';

    ins.forEach(function(inp){
      var q = (allocMap[String(outReq.id)] && allocMap[String(outReq.id)][String(inp.id)] != null)
        ? allocMap[String(outReq.id)][String(inp.id)]
        : 0;

      var lotArr = inputLotsByItemId[String(inp.id)] || [];
      var lotCount = lotArr && lotArr.length ? String(lotArr.length) : '';

      html += '<div class="cos_dist_row">'
           +  '<div>' + (inp.name || '') + '</div>'
           +  '<div class="cos_dist_right">' + roundNice(q) + '</div>'
           +  '<div class="cos_dist_right">' + (lotCount ? ('(' + lotCount + ')') : '') + '</div>'
           +  '</div>';
    });

    if (pos && pos.length){
      html += '<div class="cos_dist_row" style="font-weight:bold;background:#f7f7f7;">'
           +  '<div>Purchase Order</div><div class="cos_dist_right"></div><div class="cos_dist_right"></div>'
           +  '</div>';

      pos.forEach(function(p){
        var q = (poAllocMap[String(outReq.id)] && poAllocMap[String(outReq.id)][String(p.id)] != null)
          ? poAllocMap[String(outReq.id)][String(p.id)]
          : 0;

        html += '<div class="cos_dist_row">'
             +  '<div>' + (p.name ? ('[PO] ' + p.name) : '[PO]') + '</div>'
             +  '<div class="cos_dist_right">' + roundNice(q) + '</div>'
             +  '<div class="cos_dist_right"></div>'
             +  '</div>';
      });
    }

    html += '</div>'; // .cos_dist_body
    html += '</div>';
    return html;
  }

  function bindDistToggles2(){
    try{
      var toggles = document.querySelectorAll('.cos_dist_toggle');
      if (!toggles || !toggles.length) return;
      toggles.forEach(function(t){
        if (t._cosBound) return;
        t._cosBound = true;
        t.addEventListener('click', function(){
          var outId = t.getAttribute('data-outid') || '';
          if (!outId) return;
          var bodyEl = byId('cos_dist_body_' + outId);
          if (!bodyEl) return;
          var hidden = (bodyEl.style.display === 'none');
          bodyEl.style.display = hidden ? 'block' : 'none';
          t.textContent = hidden ? 'Hide inputs' : 'Show inputs';
        });
      });
    }catch(e){}
  }

  var html2 = '';
  html2 += '<div class="cos_sum_grid">';
  html2 += buildBox('Outputs', outs);
  if (ins.length) html2 += buildBox('Inputs', ins);
  if (pos.length) html2 += buildBox('Purchase Order', pos);
  html2 += '</div>';

  html2 += '<div class="cos_dist_wrap">';
  html2 += '<div class="cos_dist_title">Prorated Distribution of Sources → Outputs</div>';
  html2 += '<div class="cos_dist_sub">Inputs and Purchase Order lines are distributed across outputs based on each of their share of the total requirement (Qty × Conversion). If conversions are missing, the share falls back to output quantities.</div>';
  html2 += '<div class="cos_dist_grid">';
  outReqs.forEach(function(or){
    html2 += buildDistBoxUsingMap(or);
  });
  html2 += '</div>';
  html2 += '</div>';

  body.innerHTML = html2;
  bindDistToggles2();

})();
</script>
`;
            htmlField.defaultValue = viewHtml;

            // No interactive UI in VIEW mode
            return;
        }

// Keep client-side UX: item list updates on fieldChanged/pageInit
        form.clientScriptModulePath = './COS_CS_repack.js';

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

        const poPayload = form.addField({
            id: 'custpage_cos_po_payload',
            type: serverWidget.FieldType.LONGTEXT,
            label: 'PO Payload'
        });
        poPayload.updateDisplayType({ displayType: serverWidget.FieldDisplayType.HIDDEN });

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

        // EDIT mode: prefill hidden custpage payloads from persisted record fields
        if (type === scriptContext.UserEventType.EDIT) {
            try {
                const savedSummary = scriptContext.newRecord.getValue({ fieldId: 'custrecord_cos_rep_summary_payload' }) || '';
                if (savedSummary) summaryPayload.defaultValue = String(savedSummary);
            } catch (e) {}

            try {
                const savedLots = scriptContext.newRecord.getValue({ fieldId: 'custrecord_cos_rep_input_lots_payload' }) || '';
                if (savedLots) inputLotsPayload.defaultValue = String(savedLots);
            } catch (e) {}
        }


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

        const modeStr = (type === scriptContext.UserEventType.EDIT ? 'EDIT' : 'CREATE');

        htmlField.defaultValue = `
<script>window.COS_REPACK_MODE='${modeStr}';</script>
<div style="padding:10px;border:1px solid #ccc;border-radius:6px;margin-bottom:12px;">
  <strong>Repack Builder</strong><br/>
  <small style="color:#666;">Step-by-step: select Outputs → select Inputs → review Summary.</small>
</div>

<!-- STEP 1: OUTPUTS -->
<div id="cos_out_section" class="cos_hide_conversion" style="border:1px solid #ddd;border-radius:6px;overflow:hidden;">
  <div style="background: #00AFEF;color:#fff;padding:10px 12px;">
    <div style="font-weight:bold;">Step 1: Select Outputs</div>
    <div style="font-size:12px;opacity:0.9;">Choose output items and quantities</div>
  </div>

  <div style="padding:10px 12px;background:#f7f7f7;border-bottom:1px solid #ddd;display:flex;gap:8px;align-items:center;">
    <input id="cos_out_search" type="text" placeholder="Search outputs" style="flex:1;padding:6px;" />
    <span id="cos_out_count" style="font-size:12px;color:#333;"></span>
  </div>

  <div class="cos_tbl_hdr" style="display:grid;grid-template-columns:38px 2.2fr 1fr 1fr 120px 110px 110px 110px 110px 110px 110px 110px 110px;gap:8px;padding:8px 12px;font-weight:bold;font-size:12px;background:#eee;border-bottom:1px solid #ddd;align-items:center;">
    <div></div>
    <div>Item</div>
    <div style="text-align:right;">Qty</div>
    <div style="text-align:right;">Weight</div>
    <div class="cos_col_conversion" style="text-align:right;">Conversion</div>
    <div style="text-align:right;">Available</div>
    <div style="text-align:right;">On Hand</div>
    <div style="text-align:right;">Committed</div>
    <div style="text-align:right;">SO Committed</div>
    <div style="text-align:right;">WO Committed</div>
    <div style="text-align:right;">ON PO</div>
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
    <div id="cos_in_section" class="cos_hide_conversion" style="border:1px solid #ddd;border-radius:6px;overflow:hidden;">
      <div style="background:#00AFEF;color:#fff;padding:10px 12px;">
        <div style="font-weight:bold;">Step 2: Select Inputs</div>
        <div style="font-size:12px;opacity:0.9;">Choose which items to consume as inputs</div>
      </div>

      <div style="padding:10px 12px;background:#f7f7f7;border-bottom:1px solid #ddd;display:flex;gap:8px;align-items:center;">
        <input id="cos_in_search" type="text" placeholder="Search inputs" style="flex:1;padding:6px;" />
        <span id="cos_in_count" style="font-size:12px;color:#333;"></span>
      </div>

      <div class="cos_tbl_hdr" style="display:grid;grid-template-columns:38px 2.2fr 1fr 1fr 120px 110px 110px 110px 110px 110px 110px 110px 110px 120px;gap:8px;padding:8px 12px;font-weight:bold;font-size:12px;background:#eee;border-bottom:1px solid #ddd;align-items:center;">
        <div></div>
        <div>Item</div>
        <div style="text-align:right;">Qty</div>
        <div style="text-align:right;">Weight</div>
        <div class="cos_col_conversion" style="text-align:right;">Conversion</div>
        <div style="text-align:right;">Available</div>
        <div style="text-align:right;">On Hand</div>
        <div style="text-align:right;">Committed</div>
        <div style="text-align:right;">SO Committed</div>
        <div style="text-align:right;">WO Committed</div>
        <div style="text-align:right;">ON PO</div>
        <div style="text-align:right;">On Order</div>
        <div style="text-align:right;">Backordered</div>
        <div style="text-align:right;">Lots</div>
      </div>

      <div id="cos_in_rows"></div>
    </div>

    <!-- PURCHASE ORDERS -->
    <div id="cos_po_section" class="cos_hide_conversion" style="border:1px solid #ddd;border-radius:6px;overflow:hidden;display:none;">
      <div style="background:#2f3f53;color:#fff;padding:10px 12px;">
        <div style="font-weight:bold;">Purchase Order</div>
        <div style="font-size:12px;opacity:0.9;">If inventory inputs are insufficient, order the remaining requirement</div>
      </div>

      <div style="padding:10px 12px;background:#f7f7f7;border-bottom:1px solid #ddd;display:flex;gap:8px;align-items:center;">
        <input id="cos_po_search" type="text" placeholder="Search purchase items" style="flex:1;padding:6px;" />
        <span id="cos_po_count" style="font-size:12px;color:#333;"></span>
        <span id="cos_po_hint" style="font-size:12px;color:#666;margin-left:auto;"></span>
      </div>

      <div class="cos_tbl_hdr" style="display:grid;grid-template-columns:38px 2.2fr 1fr 1fr 120px 1fr 1fr;gap:8px;padding:8px 12px;font-weight:bold;font-size:12px;background:#eee;border-bottom:1px solid #ddd;align-items:center;">
        <div></div>
        <div>Item</div>
        <div style="text-align:right;">Order Qty</div>
        <div style="text-align:right;">Order Weight</div>
        <div class="cos_col_conversion" style="text-align:right;">Conversion</div>
        <div style="text-align:right;">Suggested Qty</div>
        <div style="text-align:right;">Suggested Weight</div>
      </div>

      <div id="cos_po_rows"></div>
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
  <div style="background:#00AFEF;color:#fff;padding:10px 12px;">
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
/* Hide Conversion columns (Step 1, Step 2, PO) - keep DOM intact */
.cos_hide_conversion .cos_col_conversion { display:none !important; }

/* Step 1: Outputs (Conversion is 5th column) */
#cos_out_section.cos_hide_conversion .cos_tbl_hdr > div:nth-child(5),
#cos_out_section.cos_hide_conversion .cos_tbl_row > div:nth-child(5) { display:none !important; }
#cos_out_section.cos_hide_conversion .cos_tbl_hdr,
#cos_out_section.cos_hide_conversion .cos_tbl_row{
  grid-template-columns:38px 2.2fr 1fr 1fr 110px 110px 110px 110px 110px 110px 110px 110px !important;
}

/* Step 2: Inputs (Conversion is 5th column) */
#cos_in_section.cos_hide_conversion .cos_tbl_hdr > div:nth-child(5),
#cos_in_section.cos_hide_conversion .cos_tbl_row_input > div:nth-child(5) { display:none !important; }
#cos_in_section.cos_hide_conversion .cos_tbl_hdr,
#cos_in_section.cos_hide_conversion .cos_tbl_row_input{
  grid-template-columns:38px 2.2fr 1fr 1fr 110px 110px 110px 110px 110px 110px 110px 110px 120px !important;
}

/* PO Section (Conversion is 5th column) */
#cos_po_section.cos_hide_conversion .cos_tbl_hdr > div:nth-child(5),
#cos_po_section.cos_hide_conversion .cos_tbl_row_po > div:nth-child(5) { display:none !important; }
#cos_po_section.cos_hide_conversion .cos_tbl_hdr,
#cos_po_section.cos_hide_conversion .cos_tbl_row_po{
  grid-template-columns:38px 2.2fr 1fr 1fr 1fr 1fr !important;
}

  .cos_tbl_row{display:grid;grid-template-columns:38px 2.2fr 1fr 1fr 120px 110px 110px 110px 110px 110px 110px 110px 110px;gap:8px;padding:8px 12px;font-size:12px;border-bottom:1px solid #eee;align-items:center;background:#fff;}

  .cos_tbl_row_input{display:grid;grid-template-columns:38px 2.2fr 1fr 1fr 120px 110px 110px 110px 110px 110px 110px 110px 110px 120px;gap:8px;padding:8px 12px;font-size:12px;border-bottom:1px solid #eee;align-items:center;background:#fff;}
  .cos_tbl_row_input:nth-child(even){background:#fafafa;}
  .cos_tbl_row_input button{padding:6px 10px;cursor:pointer;}

  .cos_tbl_row_po{display:grid;grid-template-columns:38px 2.2fr 1fr 1fr 120px 1fr 1fr;gap:8px;padding:8px 12px;font-size:12px;border-bottom:1px solid #eee;align-items:center;background:#fff;}
  .cos_tbl_row_po:nth-child(even){background:#fafafa;}
  .cos_tbl_row_po input[type="text"]{padding:6px;width:140px;text-align:right;}
  .cos_tbl_row_po input[type="checkbox"]{width:16px;height:16px;}

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
.cos_dist_wrap{padding:12px;border-top:1px solid #eee;background:#fff;}
  .cos_dist_title{font-weight:bold;font-size:12px;margin-bottom:6px;}
  .cos_dist_sub{font-size:12px;color:#666;margin-bottom:10px;line-height:1.4;}
  .cos_dist_grid{display:grid;grid-template-columns:1fr;gap:12px;}
  .cos_dist_row{display:grid;grid-template-columns: 2fr 1fr 90px;gap:8px;padding:8px 10px;border-bottom:1px solid #eee;font-size:12px;align-items:center;background:#fff;}
  .cos_dist_row:nth-child(even){background:#fafafa;}
  .cos_dist_right{text-align:right;white-space:nowrap;}
  .cos_dist_small{font-size:11px;color:#666;}
  .cos_dist_toggle{float:right;cursor:pointer;color:#0070d2;font-size:11px;margin-left:8px;user-select:none;}
  .cos_dist_body{margin-top:2px;}

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
      if (!h) return;
      // In EDIT mode, don't wipe server-prefilled lots before hydration.
      try{
        var mode = String(window.COS_REPACK_MODE || '').toUpperCase();
        if (mode === 'EDIT' && !window.__COS_REPACK_HYDRATED_FROM_RECORD__) {
          var hasPrefill = !!(h.value && String(h.value).trim());
          var isEmptyObj = (!inputLotsByItemId || (typeof inputLotsByItemId === 'object' && !Object.keys(inputLotsByItemId).length));
          if (hasPrefill && isEmptyObj) return;
        }
      }catch(e){}
      h.value = JSON.stringify(inputLotsByItemId);
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
  var inputsSelected = {};
  var poSelected = {};      // id -> {id, name, qty}
  var poSuggested = {};     // id -> {id, name, qty} (auto suggestion)
  var poOverrides = {};     // id -> true if user manually edited PO qty/weight
  // id -> {id, name, qty}
  var inputsPrepared = false;

  function byId(id){ return document.getElementById(id); }

  // Prorated distribution: collapsible input allocations per output
  function bindDistToggles(){
    try{
      var toggles = document.querySelectorAll('.cos_dist_toggle');
      if (!toggles || !toggles.length) return;
      toggles.forEach(function(t){
        if (t._cosBound) return;
        t._cosBound = true;
        t.addEventListener('click', function(e){
          try{ e.preventDefault(); e.stopPropagation(); }catch(_e){}
          var outId = t.getAttribute('data-outid') || '';
          var body = byId('cos_dist_body_' + outId);
          if (!body) return;
          var isHidden = (body.style.display === 'none');
          body.style.display = isHidden ? 'block' : 'none';
          t.textContent = isHidden ? 'Hide inputs' : 'Show inputs';
        });
      });
    }catch(e){}
  }


  
  loadInputLotsHidden();

  // Attempt to hydrate selections from saved payload (EDIT mode)
  function hydrateFromRecordIfPossible(){
    // Only hydrate in EDIT mode (VIEW has its own renderer)
    try {
      if (String(window.COS_REPACK_MODE || '').toUpperCase() === 'VIEW') return;
    } catch(e){}

    var h = byId('custpage_cos_summary_payload');
    if (!h || !h.value) return;

    var parsed = null;
    try {
      parsed = JSON.parse(h.value);
      // sometimes the hidden value is a JSON string that contains JSON
      if (typeof parsed === 'string' && parsed) parsed = JSON.parse(parsed);
    } catch(e) {
      return;
    }
    if (!parsed || typeof parsed !== 'object') return;

    // Resolve arrays from multiple possible shapes
    var outsArr = parsed.outputs || (parsed.data && parsed.data.outputs) || parsed.outs || [];
    var insArr  = parsed.inputs  || (parsed.data && parsed.data.inputs)  || parsed.ins  || [];

    if (!Array.isArray(outsArr)) outsArr = [];
    if (!Array.isArray(insArr))  insArr = [];

    // Build selection maps
    var outMap = {};
    outsArr.forEach(function(o){
      if (!o) return;
      var id = String(o.id || o.itemId || o.internalid || o.internalId || '');
      if (!id) return;
      var name = String(o.name || o.itemName || o.text || '');
      var qty  = (o.qty != null ? String(o.qty) : (o.quantity != null ? String(o.quantity) : ''));
      // conversion may come from saved payload, else try from items list
      var conv = (o.conversion != null ? String(o.conversion) : '');
      if (!conv) {
        var it = allItems.find(function(x){ return String(x.id) === id; });
        if (it && it.conversion != null) conv = String(it.conversion);
      }
      outMap[id] = { id: id, name: name, qty: qty, conversion: conv };
    });

    var inMap = {};
    insArr.forEach(function(i){
      if (!i) return;
      var id = String(i.id || i.itemId || i.internalid || i.internalId || '');
      if (!id) return;
      var name = String(i.name || i.itemName || i.text || '');
      var qty  = (i.qty != null ? String(i.qty) : (i.quantity != null ? String(i.quantity) : ''));
      var conv = (i.conversion != null ? String(i.conversion) : '');
      if (!conv) {
        var it = allItems.find(function(x){ return String(x.id) === id; });
        if (it && it.conversion != null) conv = String(it.conversion);
      }
      inMap[id] = { id: id, name: name, qty: qty, conversion: conv };
    });

    // If there's nothing to hydrate, skip
    if (!Object.keys(outMap).length && !Object.keys(inMap).length) return;

    outputsSelected = outMap;
    inputsSelected  = inMap;

    // Re-render Step 1 immediately with restored outputs
    try { renderOutputs(); } catch(e) {}

    // Mark step2 prepared if we have inputs
    inputsPrepared = Object.keys(inputsSelected).length > 0;

    // Show step2 + summary (as if user walked through steps)
    if (inputsPrepared) {
      showStep2();
      renderInputs();
    }
    // Only build summary if both sides exist
    if (Object.keys(outputsSelected).length && Object.keys(inputsSelected).length) {
      renderSummary();
    }

    // Ensure buttons/counts/hidden fields reflect hydrated state
    syncHidden();
    updateCounts();
    updatePoSectionVisibility();
    updateStepButtons();

    window.__COS_REPACK_HYDRATED_FROM_RECORD__ = true;
  }




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
          backordered: (it.backordered != null ? String(it.backordered) : ''),
          soCommitted: (it.soCommitted != null ? String(it.soCommitted) : (it.socommitted != null ? String(it.socommitted) : '')),
          woCommitted: (it.woCommitted != null ? String(it.woCommitted) : (it.wocommitted != null ? String(it.wocommitted) : '')),
          onpo: (it.onpo != null ? String(it.onpo) : (it.onPo != null ? String(it.onPo) : ''))
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
      // After suggesting inventory inputs, compute shortage and suggest Purchase Order lines
      updatePurchaseSuggestions();
      syncHidden();
      updateCounts();
      updatePoSectionVisibility();
    }catch(e){}

  function computeRequiredWeight(){
    var outKeys = Object.keys(outputsSelected);
    var required = 0;
    outKeys.forEach(function(k){
      var o = outputsSelected[k];
      if (!o) return;
      var it = allItems.find(function(x){ return String(x.id) === String(o.id); });
      var conv = it ? toNum(it.conversion) : 0;
      var qty = toNum(o.qty);
      required += qty * conv;
    });
    return required;
  }

  function computeIssuedWeight(){
    var inKeys = Object.keys(inputsSelected);
    var issued = 0;
    inKeys.forEach(function(k){
      var i = inputsSelected[k];
      if (!i) return;
      var it = allItems.find(function(x){ return String(x.id) === String(i.id); });
      var conv = it ? toNum(it.conversion) : 0;
      var qty = toNum(i.qty);
      issued += qty * conv;
    });
    return issued;
  }

  function updatePurchaseSuggestions(){
    try{
      var required = computeRequiredWeight();
      if (!(required > 0)) { poSuggested = {}; updatePoSectionVisibility(); return; }

      var issued = computeIssuedWeight();
      var remaining = required - issued;
      if (!(remaining > 0)) {
        // No shortage: clear suggested lines. Keep overridden lines if any.
        poSuggested = {};
        // remove non-overridden selections
        Object.keys(poSelected).forEach(function(id){
          if (!poOverrides[String(id)]) delete poSelected[id];
        });
        syncHidden();
        updatePoSectionVisibility();
        return;
      }

      var exclude = {};
      Object.keys(outputsSelected).forEach(function(k){ exclude[String(k)] = true; });

      // candidates: any item (excluding outputs) with conversion
      var candidates = allItems.filter(function(it){
        if (!it || !it.id) return false;
        if (exclude[String(it.id)]) return false;
        return toNum(it.conversion) > 0;
      }).map(function(it){
        return { id:String(it.id), name:String(it.name||it.id), conv:toNum(it.conversion) };
      }).sort(function(a,b){ return (b.conv - a.conv) || a.name.localeCompare(b.name); });

      if (!candidates.length) { poSuggested = {}; return; }

      // Greedy: use best conversion to minimize qty
      poSuggested = {};
      var rem = remaining;
      for (var i=0;i<candidates.length && rem > 0;i++){
        var c = candidates[i];
        var needQty = Math.ceil(rem / c.conv);
        if (needQty <= 0) continue;
        poSuggested[c.id] = { id:c.id, name:c.name, qty: roundNice(needQty) };
        rem -= needQty * c.conv;
        // single line is usually enough; break to keep UI simple
        break;
      }

      // Apply suggested qty into poSelected unless overridden
      // Also ensure all overridden lines remain.
      Object.keys(poSuggested).forEach(function(id){
        if (!poOverrides[String(id)]) {
          poSelected[id] = { id:id, name:poSuggested[id].name, qty: poSuggested[id].qty };
        } else if (!poSelected[id]) {
          poSelected[id] = { id:id, name:poSuggested[id].name, qty: poSuggested[id].qty };
        }
      });

      // Remove non-suggested, non-overridden lines
      Object.keys(poSelected).forEach(function(id){
        if (poOverrides[String(id)]) return;
        if (!poSuggested[String(id)]) delete poSelected[id];
      });

      // After suggesting inventory inputs, compute shortage and suggest Purchase Order lines
      updatePurchaseSuggestions();
      syncHidden();
      updateCounts();
      updateStepButtons();
    }catch(e){}
  }

  }

  function countSelected(map){
    return Object.keys(map).length;
  }

  function syncHidden(){
    // In EDIT mode, the page may load with server-prefilled hidden payloads.
    // Avoid wiping those values before hydrateFromRecordIfPossible() runs.
    syncInputLotsHidden();
    var outF = byId('custpage_cos_outputs_payload');
    var inF  = byId('custpage_cos_inputs_payload');
    var sumF = byId('custpage_cos_summary_payload');
    var poF  = byId('custpage_cos_po_payload');

    var mode = '';
    try{ mode = String(window.COS_REPACK_MODE || '').toUpperCase(); }catch(e){}
    var preHydrate = (mode === 'EDIT' && !window.__COS_REPACK_HYDRATED_FROM_RECORD__);

    var outs = Object.keys(outputsSelected).map(function(k){ return outputsSelected[k]; });
    var ins  = Object.keys(inputsSelected).map(function(k){ return inputsSelected[k]; });
    var pos  = Object.keys(poSelected).map(function(k){ return poSelected[k]; });
    var pos  = Object.keys(poSelected).map(function(k){ return poSelected[k]; });
    var posSug = Object.keys(poSuggested).map(function(k){ return poSuggested[k]; });

    if (outF) {
      if (!(preHydrate && outF.value && String(outF.value).trim() && !outs.length)) {
        outF.value = JSON.stringify({ outputs: outs, meta: lastMeta || {} });
      }
    }
    if (inF) {
      if (!(preHydrate && inF.value && String(inF.value).trim() && !ins.length)) {
        inF.value = JSON.stringify({ inputs: ins, meta: lastMeta || {} });
      }
    if (poF) {
      // PO payload is stored separately, including suggested lines for transparency
      if (!(preHydrate && poF.value && String(poF.value).trim() && !pos.length)) {
        poF.value = JSON.stringify({ purchase: pos, suggested: posSug, meta: lastMeta || {} });
      }
    }

    }
    if (sumF) {
      // Keep summary field always updated as a combined snapshot, but don't wipe prefill before hydrate.
      if (!(preHydrate && sumF.value && String(sumF.value).trim() && !outs.length && !ins.length)) {
        sumF.value = JSON.stringify({ outputs: outs, inputs: ins, purchase: pos, purchaseSuggested: posSug, meta: lastMeta || {} });
      }
    }
  }

  function updateStepButtons(){
    var btnPrep = byId('cos_btn_prepare_inputs');
    var prepHint = byId('cos_prepare_hint');
    var btnSum = byId('cos_btn_build_summary');
    var sumHint = byId('cos_summary_hint');

    var outCount = countSelected(outputsSelected);
    var inCount  = countSelected(inputsSelected);
    var poCount  = countSelected(poSelected);

    if (btnPrep) btnPrep.disabled = (outCount === 0);
    if (prepHint) prepHint.textContent = (outCount === 0) ? 'Select at least one output to continue.' : 'Ready to select inputs.';

    if (btnSum) btnSum.disabled = (!inputsPrepared || (inCount + poCount) === 0);
    if (sumHint) {
      if (!inputsPrepared) sumHint.textContent = 'Prepare inputs first.';
      else sumHint.textContent = ((inCount + poCount) === 0) ? 'Select at least one input or PO line to build summary.' : 'Ready to build summary.';
    }
  }

  function renderTable(rowsEl, items, selectionMap, searchQuery, excludeIds){
    if (!rowsEl) return;
    var isInputTable = (rowsEl.id === 'cos_in_rows');
    var isPOTable = (rowsEl.id === 'cos_po_rows');
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

    function round3(n){
      if (n == null) return '';
      var x = Number(n);
      if (!isFinite(x)) return '';
      var s = String(x);
      if (s.indexOf('.') >= 0) s = x.toFixed(3).replace(/\.?0+$/,'');
      return s;
    }

    rowsEl.innerHTML = '';

    filtered.forEach(function(it){
      var row = document.createElement('div');
      row.className = isInputTable ? 'cos_tbl_row_input' : (isPOTable ? 'cos_tbl_row_po' : 'cos_tbl_row');

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
      var cQty = document.createElement('div');
      cQty.style.textAlign = 'right';
      var qty = document.createElement('input');
      qty.type = 'text';
      qty.placeholder = '0';
      qty.value = selectionMap[it.id] ? String(selectionMap[it.id].qty || '') : '';
      qty.disabled = !selectionMap[it.id];
      cQty.appendChild(qty);

      // weight (user-entry option; derived from qty and conversion)
      var cWt = document.createElement('div');
      cWt.style.textAlign = 'right';
      var wt = document.createElement('input');
      wt.type = 'text';
      wt.placeholder = '0';
      var convNum = toNum(it.conversion);
      // initial weight if selected
      if (selectionMap[it.id] && convNum > 0){
        wt.value = round3(toNum(selectionMap[it.id].qty) * convNum);
      } else {
        wt.value = '';
      }
      // editable only when selected and conversion is valid
      wt.disabled = (!selectionMap[it.id]) || !(convNum > 0);
      if (!(convNum > 0)) wt.placeholder = '—';
      cWt.appendChild(wt);

      // conversion
      var cConv = document.createElement('div');
      cConv.style.textAlign = 'right';
      cConv.textContent = (it.conversion != null ? it.conversion : '');

      // suggested (PO only)
      var cSugQty = null;
      var cSugWt = null;
      if (isPOTable) {
        cSugQty = document.createElement('div');
        cSugQty.style.textAlign = 'right';
        var sugLine = poSuggested[String(it.id)];
        cSugQty.textContent = (sugLine && sugLine.qty != null) ? String(sugLine.qty) : '';

        cSugWt = document.createElement('div');
        cSugWt.style.textAlign = 'right';
        var convS = toNum(it.conversion);
        if (sugLine && sugLine.qty != null && convS > 0) {
          cSugWt.textContent = round3(toNum(sugLine.qty) * convS);
        } else {
          cSugWt.textContent = '';
        }
      }

      var cAvail = document.createElement('div');
      cAvail.style.textAlign = 'right';
      cAvail.textContent = (it.available != null ? it.available : '');

      var cOnHand = document.createElement('div');
      cOnHand.style.textAlign = 'right';
      cOnHand.textContent = (it.onhand != null ? it.onhand : '');

      var cCommitted = document.createElement('div');
      var cSoCommitted = document.createElement('div');
      var cWoCommitted = document.createElement('div');
      cSoCommitted.style.textAlign = 'right';
      cSoCommitted.textContent = (it.soCommitted != null ? it.soCommitted : (it.socommitted != null ? it.socommitted : ''));

      cWoCommitted.style.textAlign = 'right';
      cWoCommitted.textContent = (it.woCommitted != null ? it.woCommitted : (it.wocommitted != null ? it.wocommitted : ''));

      var cOnPo = document.createElement('div');
      cOnPo.style.textAlign = 'right';
      cOnPo.textContent = (it.onpo != null ? it.onpo : (it.onPo != null ? it.onPo : ''));

      cCommitted.style.textAlign = 'right';
      cCommitted.textContent = (it.committed != null ? it.committed : '');

      var cOnOrder = document.createElement('div');
      cOnOrder.style.textAlign = 'right';
      cOnOrder.textContent = (it.onorder != null ? it.onorder : '');

      var cBackordered = document.createElement('div');
      cBackordered.style.textAlign = 'right';
      cBackordered.textContent = (it.backordered != null ? it.backordered : '');

      // last-edited-wins guards
      var isProg = false;

      function setQtyFromWeight(){
        if (!selectionMap[it.id]) return;
        var conv = toNum(it.conversion);
        if (!(conv > 0)) return;
        var w = toNum(wt.value);
        var q = w / conv;
        isProg = true;
        qty.value = roundNice(q);
        selectionMap[it.id].qty = qty.value;
        // keep weight normalized
        wt.value = round3(toNum(qty.value) * conv);
        isProg = false;
        syncHidden();
      }

      function setWeightFromQty(){
        if (!selectionMap[it.id]) return;
        var conv = toNum(it.conversion);
        if (!(conv > 0)) {
          wt.value = '';
          return;
        }
        var q = toNum(qty.value);
        isProg = true;
        wt.value = round3(q * conv);
        isProg = false;
        syncHidden();
      }

      // events
      cb.addEventListener('change', function(){
        if (cb.checked) {
          selectionMap[it.id] = { id: it.id, name: it.name, qty: qty.value ? qty.value : '1' };
          qty.disabled = false;
          if (!qty.value) qty.value = '1';

          // enable weight only if conv valid
          convNum = toNum(it.conversion);
          wt.disabled = !(convNum > 0) ? true : false;
          if (convNum > 0){
            wt.value = round3(toNum(qty.value) * convNum);
          } else {
            wt.value = '';
          }
        } else {
          delete selectionMap[it.id];
          qty.disabled = true;
          qty.value = '';
          wt.disabled = true;
          wt.value = '';
        }
        syncHidden();
        updateCounts();
        updateStepButtons();

        // Keep purchase suggestions in sync with shortages
        if (inputsPrepared) {
          try{ updatePurchaseSuggestions(); }catch(e){}
          try{ renderPO(); }catch(e){}
          try{ updatePoSectionVisibility(); }catch(e){}
        }

        // If outputs changed and inputs already prepared, refresh inputs list (exclude outputs)
        if (rowsEl.id === 'cos_out_rows' && inputsPrepared) {
          renderInputs();
        }
      });

      qty.addEventListener('blur', function(){
        if (isProg) return;
        if (!selectionMap[it.id]) return;
        selectionMap[it.id].qty = qty.value;
        if (isPOTable) { poOverrides[String(it.id)] = true; }
        // LAST EDITED WINS: qty is source of truth
        setWeightFromQty();

        // Keep PO suggestions in sync when user changes inputs/outputs
        if (isInputTable && inputsPrepared) {
          updatePurchaseSuggestions();
          renderPO();
          updatePoSectionVisibility();
        }
      });

      wt.addEventListener('blur', function(){
        if (isProg) return;
        if (!selectionMap[it.id]) return;
        if (isPOTable) { poOverrides[String(it.id)] = true; }
        // LAST EDITED WINS: weight is source of truth
        setQtyFromWeight();

        if (isInputTable && inputsPrepared) {
          updatePurchaseSuggestions();
          renderPO();
          updatePoSectionVisibility();
        }
      });

      if (isInputTable) {
        var cLots = document.createElement('div');
        cLots.style.textAlign = 'right';
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
        cLots.appendChild(btnLots);
        cLots.appendChild(span);

        row.appendChild(c1);
        row.appendChild(c2);
        row.appendChild(cQty);
        row.appendChild(cWt);
        row.appendChild(cConv);
        row.appendChild(cAvail);
        row.appendChild(cOnHand);
        row.appendChild(cCommitted);
        row.appendChild(cSoCommitted);
        row.appendChild(cWoCommitted);
        row.appendChild(cOnPo);
        row.appendChild(cOnOrder);
        row.appendChild(cBackordered);
        row.appendChild(cLots);
      } else if (isPOTable) {
        row.appendChild(c1);
        row.appendChild(c2);
        row.appendChild(cQty);
        row.appendChild(cWt);
        row.appendChild(cConv);
        row.appendChild(cSugQty);
        row.appendChild(cSugWt);
      } else {
        row.appendChild(c1);
        row.appendChild(c2);
        row.appendChild(cQty);
        row.appendChild(cWt);
        row.appendChild(cConv);
        row.appendChild(cAvail);
        row.appendChild(cOnHand);
        row.appendChild(cCommitted);
        row.appendChild(cSoCommitted);
        row.appendChild(cWoCommitted);
        row.appendChild(cOnPo);
        row.appendChild(cOnOrder);
        row.appendChild(cBackordered);
      }
      rowsEl.appendChild(row);
    });
  }

  function updateCounts(){
    var outCountEl = byId('cos_out_count');
    var inCountEl  = byId('cos_in_count');
    var poCountEl  = byId('cos_po_count');

    if (outCountEl) outCountEl.textContent = countSelected(outputsSelected) + ' selected';
    if (inCountEl)  inCountEl.textContent  = countSelected(inputsSelected) + ' selected';
    if (poCountEl)  poCountEl.textContent  = countSelected(poSelected) + ' selected';
  }


  function updatePoSectionVisibility(){
    try{
      var sec = byId('cos_po_section');
      if (!sec) return;
      var hasSuggested = false;
      var hasSelected  = false;
      try{ hasSuggested = !!(poSuggested && Object.keys(poSuggested).length); }catch(e){}
      try{ hasSelected  = !!(poSelected && Object.keys(poSelected).length); }catch(e){}
      var needed = hasSuggested || hasSelected;
      sec.style.display = needed ? 'block' : 'none';
    }catch(e){}
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

  
  
  function renderPO(){
    var poRows = byId('cos_po_rows');
    var poQ = byId('cos_po_search') ? byId('cos_po_search').value : '';

    // Exclude selected outputs from PO list for clarity
    var exclude = {};
    Object.keys(outputsSelected).forEach(function(k){ exclude[k] = true; });

    renderTable(poRows, allItems, poSelected, poQ, exclude);
    updateCounts();
    updateStepButtons();

    // PO hint about suggested vs overridden
    try{
      var hint = byId('cos_po_hint');
      if (hint){
        var overridden = Object.keys(poOverrides||{}).length;
        hint.textContent = overridden ? ('Overrides: ' + overridden) : 'Suggested lines update automatically unless overridden.';
      }
    }catch(e){}
  }

function resetStep2And3(){
    // Clear inputs and any UI built from them
    inputsSelected = {};
    poSelected = {};
    poSuggested = {};
    poOverrides = {};
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

    try {
      var poSearch = byId('cos_po_search');
      if (poSearch) poSearch.value = '';
    } catch(e) {}

    try {
      var poRows = byId('cos_po_rows');
      if (poRows) poRows.innerHTML = '';

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
    renderPO();

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
    var pos  = Object.keys(poSelected).map(function(k){ return poSelected[k]; });

    if (!outs.length || (!ins.length && !pos.length)) {
      body.innerHTML = '<div class="cos_empty">Select at least one output and at least one input or purchase line to build the summary.</div>';
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
        html += '<div>' + (r.name || '') + '</div>';
        html += '<div class="cos_sum_qty">' + (r.qty || '') + '</div>';
        html += '</div>';
      });
      html += '</div>';
      return html;
    }

    // Build prorated input distribution per output (based on output base requirement share)
    function getItemById(id){
      try{
        for (var i=0;i<allItems.length;i++){
          if (String(allItems[i].id) === String(id)) return allItems[i];
        }
      }catch(e){}
      return null;
    }

    var outReqs = [];
    var totalReqBase = 0;
    outs.forEach(function(o){
      var it = getItemById(o.id);
      var conv = it ? toNum(it.conversion) : 0;
      var qty = toNum(o.qty);
      var reqBase = qty * conv;
      outReqs.push({ id:o.id, name:o.name, qty:o.qty, conv:conv, reqBase:reqBase });
      totalReqBase += reqBase;
    });

    // Fallback: if conversions are missing/zero, prorate by output qty instead of base
    if (totalReqBase <= 0){
      totalReqBase = 0;
      outReqs.forEach(function(or){
        var q = toNum(or.qty);
        or.reqBase = q;
        totalReqBase += q;
      });
    }

    // shares
    outReqs.forEach(function(or){
      or.share = (totalReqBase > 0) ? (or.reqBase / totalReqBase) : 0;
    });

    // allocate each input qty across outputs by share (with rounding adjustment per input)
    function buildDistBox(outReq){
      var html = '';
      html += '<div class="cos_sum_box">';
      html += '<div class="cos_sum_box_hdr">'
           +  (outReq.name || '') + ' <span class="cos_badge">' + (outReq.qty || '') + '</span>'
           +  ' <span class="cos_dist_small">(' + roundNice((outReq.share || 0) * 100) + '%)</span>'
           +  '</div>';

      // header row
      html += '<div class="cos_dist_row" style="font-weight:bold;background:#f7f7f7;">'
           +  '<div>Input</div><div class="cos_dist_right">Allocated Qty</div><div class="cos_dist_right">Lots</div>'
           +  '</div>';

      html += '<div id="cos_dist_body_' + (outReq.id || '') + '" class="cos_dist_body">';

      ins.forEach(function(inp){
        var inQty = toNum(inp.qty);
        var allocQty = inQty * (outReq.share || 0);

        // rounding: keep display nice but stable
        var dispAlloc = roundNice(allocQty);

        // lots count for this input item
        var lotArr = inputLotsByItemId[String(inp.id)] || [];
        var lotCount = lotArr && lotArr.length ? String(lotArr.length) : '';

        html += '<div class="cos_dist_row">'
             +  '<div>' + (inp.name || '') + '</div>'
             +  '<div class="cos_dist_right">' + dispAlloc + '</div>'
             +  '<div class="cos_dist_right">' + (lotCount ? ('(' + lotCount + ')') : '') + '</div>'
             +  '</div>';
      });

      html += '</div>'; // .cos_dist_body

      html += '</div>';
      return html;
    }

    // Optional per-input rounding adjustment to ensure totals match input qty (only affects display)
    // We do it here by rebuilding an allocation map, then reading it when rendering boxes.
    var allocMap = {}; // outId -> inId -> qty
    outReqs.forEach(function(or){ allocMap[String(or.id)] = {}; });

    ins.forEach(function(inp){
      var inQty = toNum(inp.qty);
      var running = 0;
      for (var i=0;i<outReqs.length;i++){
        var or = outReqs[i];
        var q = 0;
        if (i === outReqs.length - 1){
          q = inQty - running;
        } else {
          q = inQty * (or.share || 0);
          // round intermediate to reduce floating drift
          q = toNum(roundNice(q));
          running += q;
        }
        allocMap[String(or.id)][String(inp.id)] = q;
      }
    });

    // Also allocate Purchase Order lines across outputs by the same shares
    var poAllocMap = {}; // outId -> poItemId -> qty
    outReqs.forEach(function(or){ poAllocMap[String(or.id)] = {}; });

    pos.forEach(function(p){
      var pQty = toNum(p.qty);
      var runningP = 0;
      for (var i=0;i<outReqs.length;i++){
        var or = outReqs[i];
        var qP = 0;
        if (i === outReqs.length - 1){
          qP = pQty - runningP;
        } else {
          qP = pQty * (or.share || 0);
          qP = toNum(roundNice(qP));
          runningP += qP;
        }
        poAllocMap[String(or.id)][String(p.id)] = qP;
      }
    });

    function buildDistBoxUsingMap(outReq){
      var html = '';
      html += '<div class="cos_sum_box">';
      html += '<div class="cos_sum_box_hdr">'
           +  (outReq.name || '') + ' <span class="cos_badge">' + (outReq.qty || '') + '</span>'
           +  ' <span class="cos_dist_small">(' + roundNice((outReq.share || 0) * 100) + '%)</span>'
           +  ' <span class="cos_dist_toggle" data-outid="' + (outReq.id || '') + '">Hide inputs</span></div>';

      html += '<div class="cos_dist_row" style="font-weight:bold;background:#f7f7f7;">'
           +  '<div>Input</div><div class="cos_dist_right">Allocated Qty</div><div class="cos_dist_right">Lots</div>'
           +  '</div>';

      html += '<div id="cos_dist_body_' + (outReq.id || '') + '" class="cos_dist_body">';

      ins.forEach(function(inp){
        var q = (allocMap[String(outReq.id)] && allocMap[String(outReq.id)][String(inp.id)] != null)
          ? allocMap[String(outReq.id)][String(inp.id)]
          : 0;

        var lotArr = inputLotsByItemId[String(inp.id)] || [];
        var lotCount = lotArr && lotArr.length ? String(lotArr.length) : '';

        html += '<div class="cos_dist_row">'
             +  '<div>' + (inp.name || '') + '</div>'
             +  '<div class="cos_dist_right">' + roundNice(q) + '</div>'
             +  '<div class="cos_dist_right">' + (lotCount ? ('(' + lotCount + ')') : '') + '</div>'
             +  '</div>';
      });

      if (pos.length){
        html += '<div class="cos_dist_row" style="font-weight:bold;background:#f7f7f7;">'
             +  '<div>Purchase Order</div><div class="cos_dist_right"></div><div class="cos_dist_right"></div>'
             +  '</div>';

        pos.forEach(function(p){
          var pq = (poAllocMap[String(outReq.id)] && poAllocMap[String(outReq.id)][String(p.id)] != null)
            ? poAllocMap[String(outReq.id)][String(p.id)]
            : 0;

          html += '<div class="cos_dist_row">'
               +  '<div>' + (p.name ? ('[PO] ' + p.name) : '[PO]') + '</div>'
               +  '<div class="cos_dist_right">' + roundNice(pq) + '</div>'
               +  '<div class="cos_dist_right"></div>'
               +  '</div>';
        });
      }

      html += '</div>'; // .cos_dist_body

      html += '</div>';
      return html;
    }

    var html2 = '';
    html2 += '<div class="cos_sum_grid">';
    html2 += buildBox('Outputs', outs);
    if (ins.length) html2 += buildBox('Inputs', ins);
    if (pos.length) html2 += buildBox('Purchase Order', pos);
    html2 += '</div>';

    // Totals (weight)
    try {
      var reqW = computeRequiredWeight();
      var issueW = computeIssuedWeight();
      var poW = 0;
      pos.forEach(function(p){
        var itp = allItems.find(function(x){ return String(x.id) === String(p.id); });
        var convp = itp ? toNum(itp.conversion) : 0;
        poW += toNum(p.qty) * convp;
      });
      var coveredW = issueW + poW;
      var diff = coveredW - reqW;
      var diffLabel = (Math.abs(diff) < 0.0005) ? 'Balanced' : (diff < 0 ? 'Short' : 'Over');
      html2 += '<div style="margin:10px 0 12px 0;padding:10px 12px;border:1px solid #eee;border-radius:6px;background:#fafafa;font-size:12px;display:flex;gap:14px;flex-wrap:wrap;">';
      html2 += '<div><b>Required Weight</b>: ' + (reqW.toFixed(3).replace(/\.?0+$/,'')) + '</div>';
      html2 += '<div><b>Issue Weight</b>: ' + (issueW.toFixed(3).replace(/\.?0+$/,'')) + '</div>';
      html2 += '<div><b>PO Weight</b>: ' + (poW.toFixed(3).replace(/\.?0+$/,'')) + '</div>';
      html2 += '<div><b>Covered Weight</b>: ' + (coveredW.toFixed(3).replace(/\.?0+$/,'')) + '</div>';
      html2 += '<div><b>Status</b>: ' + diffLabel + (diffLabel==='Balanced' ? '' : (' (' + diff.toFixed(3).replace(/\.?0+$/,'') + ')')) + '</div>';
      html2 += '</div>';
    } catch(e) {}

    // Distribution section
    html2 += '<div class="cos_dist_wrap">';
    html2 += '<div class="cos_dist_title">Prorated Distribution of Sources → Outputs</div>';
    html2 += '<div class="cos_dist_sub">Inputs and Purchase Order lines are distributed across outputs based on each of their share of the total requirement (Qty × Conversion). If conversions are missing, the share falls back to output quantities.</div>';
    html2 += '<div class="cos_dist_grid">';
    outReqs.forEach(function(or){
      html2 += buildDistBoxUsingMap(or);
    });
    html2 += '</div>';
    html2 += '</div>';

    body.innerHTML = html2;
    bindDistToggles();
    summarySection.style.display = 'block';
    syncHidden();

    // Scroll into view for step-by-step UX
    try { summarySection.scrollIntoView({ behavior: 'smooth', block: 'start' }); } catch(e) {}
  }

  // Wire UI events (search, buttons)
  function wireUiOnce(){
    var outSearch = byId('cos_out_search');
    var inSearch  = byId('cos_in_search');
    var poSearch  = byId('cos_po_search');
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

    if (poSearch && !poSearch._cosBound) {
      poSearch._cosBound = true;
      poSearch.addEventListener('input', function(){ if (inputsPrepared) renderPO(); });
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
    poSelected = {};
    poSuggested = {};
    poOverrides = {};
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

    // Preserve any server-prefilled payload values before resetAll() wipes them via syncHidden()
    var __prefillSummaryVal = '';
    var __prefillLotsVal = '';
    try {
      var __h1 = byId('custpage_cos_summary_payload');
      if (__h1) __prefillSummaryVal = __h1.value || '';
      var __l1 = byId('custpage_cos_input_lots_payload');
      if (__l1) __prefillLotsVal = __l1.value || '';
    } catch(e) {}

    // Reset the step flow whenever species/items change
    resetAll();

    // Restore payload values so EDIT hydration can read them
    try {
      var __h2 = byId('custpage_cos_summary_payload');
      if (__h2 && __prefillSummaryVal) __h2.value = __prefillSummaryVal;
      var __l2 = byId('custpage_cos_input_lots_payload');
      if (__l2 && __prefillLotsVal) __l2.value = __prefillLotsVal;
    } catch(e) {}

    wireUiOnce();
    renderOutputs();

    // EDIT-mode hydration:
    // If the record already has a saved summary payload, rebuild Step 1/2/3 selections
    // after items load (so renderers can resolve item names/conversions).
    try {
      if (!window.__COS_REPACK_HYDRATED_FROM_RECORD__) {
        hydrateFromRecordIfPossible();
      }
    } catch(e) {}
  };

  // initial wire
  wireUiOnce();
  updateStepButtons();
  updateCounts();
  updatePoSectionVisibility();
  syncHidden();

})();
</script>
`;
    };

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

    function buildWorkordersPayload(newRecord) {
        // Read UI payloads (custpage fields) – available on submit context
        const rawSummary = newRecord.getValue({ fieldId: 'custpage_cos_summary_payload' })
            || newRecord.getValue({ fieldId: 'custrecord_cos_rep_summary_payload' })
            || '';
        const rawLots = newRecord.getValue({ fieldId: 'custpage_cos_input_lots_payload' })
            || newRecord.getValue({ fieldId: 'custrecord_cos_rep_input_lots_payload' })
            || '';

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

    var globalScriptContext = null;


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
            const summaryStr = (rawSummary !== null && rawSummary !== undefined)
                ? String(rawSummary || '')
                : String(rec.getValue({ fieldId: 'custrecord_cos_rep_summary_payload' }) || '');

            const lotsStr = (rawLots !== null && rawLots !== undefined)
                ? String(rawLots || '')
                : String(rec.getValue({ fieldId: 'custrecord_cos_rep_input_lots_payload' }) || '');

            const summary = safeParseJson(summaryStr) || {};
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
            if (finalSummaryStr !== null && finalSummaryStr !== undefined) {
                try { rec.setValue({ fieldId: 'custrecord_cos_rep_summary_payload', value: finalSummaryStr }); } catch (_e) {}
            }
            if (lotsStr !== null && lotsStr !== undefined) {
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

    const afterSubmit = (scriptContext) => {
        try {
            globalScriptContext = scriptContext;
            const newRecord = scriptContext.newRecord;
            const payload = buildWorkordersPayload(newRecord);

            // Repack flag: if checked, mark created Work Orders as WIP
            const repackMarkWipRaw = newRecord.getValue({ fieldId: 'custrecord_cos_rep_wip' });
            const repackMarkWip = (repackMarkWipRaw === true || repackMarkWipRaw === 'T' || repackMarkWipRaw === 'true');
            try { log.debug({ title: 'COS Repack: repackMarkWip', details: String(repackMarkWipRaw) + ' => ' + String(repackMarkWip) }); } catch (_e) {}

            // Validate against the submitted summary payload (shape + reconciliation checks)
            const rawSummary = newRecord.getValue({ fieldId: 'custpage_cos_summary_payload' })
                || newRecord.getValue({ fieldId: 'custrecord_cos_rep_summary_payload' })
                || '';
            const validationErrors = validateWorkordersPayload(payload, rawSummary);

            if (validationErrors && validationErrors.length) {
                log.error({
                    title: 'COS Repack: payload validation failed',
                    details: JSON.stringify(validationErrors)
                });

                // Safety: do NOT create Work Orders if validation fails.
                try { log.debug({ title: 'COS Repack: workorder creation skipped', details: 'Validation errors present.' }); } catch (_e) {}
                return;
            }

            log.audit({
                title: 'COS Repack: workorders payload (debug)',
                details: JSON.stringify(payload)
            });

            // NOTE: Work Order creation has been moved to a dedicated button click (Suitelet) in VIEW mode.
// This afterSubmit now only logs the validated payload for debugging, but does NOT create transactions.
            try {
                log.audit({ title: 'COS Repack: workorders payload (debug)', details: JSON.stringify(payload) });
            } catch (_e) {}

            try {
                log.debug({ title: 'COS Repack: afterSubmit complete (no WO creation)', details: JSON.stringify({ workorders: (payload.workorders || []).length, errors: (validationErrors || []).length }) });
            } catch (_e) {}
        } catch (e) {
            try {
                log.error({ title: 'COS Repack: afterSubmit failed', details: e });
            } catch (_e) {}
        }
    };

    /**
     * Create Work Orders from validated payload.
     * Notes:
     * - Lots are intentionally not applied here; inventory detail is typically applied during issue/build.
     * - Component lines are added to the WO's item sublist to match the chosen inputs.
     */
    function createWorkOrdersFromPayload(payload, markWorkordersAsWip) {
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

                woRec.setValue({ fieldId: 'quantity', value: Number(woObj.output_item_quantity) });
                if (woObj.location) {
                    try { woRec.setValue({ fieldId: 'location', value: Number(woObj.location) }); } catch (_e) {}
                }

                if(globalScriptContext.newRecord.id)
                {
                    try
                    {
                        woRec.setValue({ fieldId: 'custbody_cos_createdfromrepack', value: Number(globalScriptContext.newRecord.id) });
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

    return { beforeLoad, beforeSubmit, afterSubmit };

});
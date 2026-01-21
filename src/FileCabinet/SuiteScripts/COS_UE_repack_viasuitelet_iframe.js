/**
 * @NApiVersion 2.1
 * @NScriptType UserEventScript
 */

define(['N/ui/serverWidget','N/url','N/search','N/log','N/record'], (serverWidget, url, search, log, record) => {

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


        // VIEW MODE: Read-only Repack Summary (rendered to match the interactive Step 3 UI)
        // In VIEW mode the user won't interact; we just rebuild the Summary HTML from saved payload fields.
        if (type === scriptContext.UserEventType.VIEW) {
            const rec = scriptContext.newRecord;

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

  if (!outs.length || !ins.length){
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
  html2 += buildBox('Inputs', ins);
  html2 += '</div>';

  html2 += '<div class="cos_dist_wrap">';
  html2 += '<div class="cos_dist_title">Prorated Distribution of Inputs → Outputs</div>';
  html2 += '<div class="cos_dist_sub">Inputs are distributed across outputs based on each of their share of the total requirement (Qty × Conversion). If conversions are missing, the share falls back to output quantities.</div>';
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

      html += '</div>'; // .cos_dist_body

      html += '</div>';
      return html;
    }

    var html2 = '';
    html2 += '<div class="cos_sum_grid">';
    html2 += buildBox('Outputs', outs);
    html2 += buildBox('Inputs', ins);
    html2 += '</div>';

    // Distribution section
    html2 += '<div class="cos_dist_wrap">';
    html2 += '<div class="cos_dist_title">Prorated Distribution of Inputs → Outputs</div>';
    html2 += '<div class="cos_dist_sub">Inputs are distributed across outputs based on each of their share of the total requirement (Qty × Conversion). If conversions are missing, the share falls back to output quantities.</div>';
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

        const subsidiary = newRecord.getValue({ fieldId: 'custrecord_cos_rep_subsidiary' });
        const location = newRecord.getValue({ fieldId: 'custrecord_cos_rep_location' });

        const itemIds = [];
        outputs.forEach(o => { if (o && o.id) itemIds.push(String(o.id)); });
        inputs.forEach(i => { if (i && i.id) itemIds.push(String(i.id)); });

        const convMap = fetchConversionMap(itemIds);

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

        // Allocate each input container qty across outputs using shares.
        // Rounding: round to 6dp and adjust last output per input to keep totals matching.
        const allocationsByOut = {}; // outId -> [ {inputId, qty, lots} ]
        outReq.forEach(o => { allocationsByOut[o.outId] = []; });

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

                allocationsByOut[outId].push({
                    input_item_internalid: Number(inputId),
                    input_item_quantity: alloc,
                    input_item_lots: Array.isArray(lotsMap[inputId]) ? lotsMap[inputId] : []
                });
            });
        });

        const workorders = outReq.map((o) => {
            return {
                subsidiary: subsidiary ? Number(subsidiary) : subsidiary,
                location: location ? Number(location) : location,
                output_item_internalid: Number(o.outId),
                output_item_quantity: o.qty,
                inputs: allocationsByOut[o.outId] || []
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

                if (outputs.length || inputs.length) {
                    const subsidiary = rec.getValue({ fieldId: 'custrecord_cos_rep_subsidiary' }) || '';
                    const location = rec.getValue({ fieldId: 'custrecord_cos_rep_location' }) || '';
                    const species = rec.getValue({ fieldId: 'custrecord_cos_rep_species' }) || '';

                    // Gather itemIds for conversion lookup
                    const itemIds = [];
                    outputs.forEach(o => { if (o && o.id) itemIds.push(String(o.id)); });
                    inputs.forEach(i => { if (i && i.id) itemIds.push(String(i.id)); });

                    const convMap = fetchConversionMap(itemIds);

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

                    const enriched = Object.assign({}, summary, {
                        meta: Object.assign({}, (summary.meta || {}), {
                            speciesId: String(species || ''),
                            locationId: String(location || ''),
                            subsidiaryId: String(subsidiary || ''),
                            enrichedAt: (new Date()).toISOString()
                        }),
                        outputs: outputsEnriched,
                        inputs: inputsEnriched,
                        distribution: {
                            method: 'prorated',
                            totalRequirement: round6(totalReq),
                            shares: shares,
                            allocations: allocations
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

            // Create Work Orders
            const createdWorkOrders = createWorkOrdersFromPayload(payload);
            try {
                log.audit({
                    title: 'COS Repack: workorders created',
                    details: JSON.stringify(createdWorkOrders)
                });
            } catch (_e) {}

            // Per user preference: log the final output marker
            try { log.debug({ title: 'COS Repack: afterSubmit complete', details: JSON.stringify({ workorders: (payload.workorders || []).length, errors: (validationErrors || []).length }) }); } catch (_e) {}
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
    function createWorkOrdersFromPayload(payload) {
        const results = [];
        const workorders = (payload && payload.workorders) ? payload.workorders : [];

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
                try {
                    const existingLineCount = woRec.getLineCount({ sublistId: 'item' }) || 0;
                    for (let i = existingLineCount - 1; i >= 0; i--) {
                        try { woRec.removeLine({ sublistId: 'item', line: i, ignoreRecalc: true }); } catch (_e) {}
                    }
                } catch (_e) {}

                // Components
                const inputs = (woObj && woObj.inputs) ? woObj.inputs : [];
                inputs.forEach((inp) => {
                    if (!inp || !inp.input_item_internalid) return;
                    const qty = Number(inp.input_item_quantity || 0);
                    if (qty <= 0) return;

                    try {
                        woRec.selectNewLine({ sublistId: 'item' });
                        woRec.setCurrentSublistValue({ sublistId: 'item', fieldId: 'item', value: Number(inp.input_item_internalid) });

                        // Blank out allocation strategies (value 2)
                        try { woRec.setCurrentSublistValue({ sublistId: 'item', fieldId: 'defaultorderallocationstrategy', value: "" }); } catch (_e) {}
                        try { woRec.setCurrentSublistValue({ sublistId: 'item', fieldId: 'orderallocationstrategy', value: "" }); } catch (_e) {}

                        woRec.setCurrentSublistValue({ sublistId: 'item', fieldId: 'quantity', value: qty });
                        woRec.commitLine({ sublistId: 'item' });
                    } catch (lineErr) {
                        // If item sublist isn't editable (BOM-driven), we still allow WO creation and log the issue.
                        try {
                            log.error({
                                title: 'COS Repack: component line add failed',
                                details: JSON.stringify({ ...contextInfo, input_item_internalid: inp.input_item_internalid, error: String(lineErr) })
                            });
                        } catch (_e) {}
                    }
                });

                const woId = woRec.save({ enableSourcing: true, ignoreMandatoryFields: false });
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
/**
 * @NApiVersion 2.1
 * @NScriptType UserEventScript
 */
define(['N/ui/serverWidget', 'N/url'], (serverWidget, url) => {

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

        // Hidden payload field (parent stores what the iframe Suitelet returns)
        const payloadField = form.addField({
            id: 'custpage_cos_popup_payload',
            type: serverWidget.FieldType.LONGTEXT,
            label: 'Modal Payload'
        });
        payloadField.updateDisplayType({ displayType: serverWidget.FieldDisplayType.HIDDEN });

        // Resolve Suitelet URL base (no params; we'll append params in browser JS)
        // IMPORTANT: update these IDs to your actual Suitelet script/deployment IDs.
        const suiteletBaseUrl = url.resolveScript({
            scriptId: 'customscript_cos_repack_popup_sl',
            deploymentId: 'customdeploy_cos_repack_popup_sl'
        });

        // HTML field
        const htmlField = form.addField({
            id: 'custpage_cos_io_html',
            type: serverWidget.FieldType.INLINEHTML,
            label: ' ',
            container: 'custpage_cos_input_output'
        });

        // Use DOM APIs in the embedded script to avoid quoting/syntax pitfalls
        htmlField.defaultValue = `
      <div style="padding:10px;border:1px solid #ccc;border-radius:6px;margin-bottom:12px;">
        <strong>Select Inputs or Outputs</strong><br/>
        <small style="color:#666;">Search for the item or inventory you want and add it to this Repack</small>
      </div>

      <!-- Main Grid -->
      <div id="cos_io_wrap" style="border:1px solid #ddd;border-radius:6px;overflow:hidden;">
        <div style="display:flex;gap:8px;align-items:center;padding:10px;background:#f7f7f7;border-bottom:1px solid #ddd;">
          <select id="cos_filter_type" style="padding:4px 6px;">
            <option>Item</option>
            <option>Inventory</option>
          </select>
          <input id="cos_search_text" type="text" placeholder="Search" style="flex:1;padding:6px;" />
          <button id="cos_btn_search" type="button" style="padding:6px 10px;">Search</button>
        </div>

        <div style="
          display:grid;
          grid-template-columns: 28px 2.2fr 1fr 1fr 1fr 1fr 1.4fr;
          font-weight:bold;
          font-size:12px;
          padding:8px 10px;
          background:#eee;
          border-bottom:1px solid #ddd;">
          <div></div>
          <div>Item</div>
          <div>On Hand</div>
          <div>Available</div>
          <div>Committed</div>
          <div>On Order</div>
          <div style="text-align:right;">Add Item As</div>
        </div>

        <div id="cos_io_rows"></div>
      </div>
      
      <!-- Repack Details Section -->
        <div id="cos_repack_details_wrap" style="margin-top:14px;border:1px solid #ddd;border-radius:6px;overflow:hidden;">
          <div style="background:#2f3f53;color:#fff;padding:10px 12px;">
            <div style="font-weight:bold;">Repack Details</div>
            <div style="font-size:12px;opacity:0.9;">Items included in this Repack</div>
          </div>
        
          <div id="cos_repack_details_body" style="background:#fff;">
            <div style="padding:10px 12px;color:#666;font-size:12px;">
              No selections yet. Choose an Input/Output to add details.
            </div>
          </div>
        </div>

      <!-- Modal Overlay -->
      <div id="cos_modal_overlay" style="
        display:none;
        position:fixed;
        inset:0;
        background:rgba(0,0,0,0.35);
        z-index:99998;
      "></div>

      <!-- Modal Window -->
      <div id="cos_modal" style="
        display:none;
        position:fixed;
        top:5%;
        left:50%;
        transform:translateX(-50%);
        width:92%;
        max-width:1200px;
        height:85%;
        background:#fff;
        border-radius:6px;
        box-shadow:0 10px 30px rgba(0,0,0,0.35);
        z-index:99999;
        overflow:hidden;
        font-family:Arial, sans-serif;
      ">
        <div style="
          display:flex;
          justify-content:space-between;
          align-items:center;
          padding:10px 12px;
          background:#3f5166;
          color:#fff;
          font-weight:bold;
          font-size:14px;
        ">
          <div id="cos_modal_title">Details</div>
          <button id="cos_modal_close_x" type="button" style="
            background:transparent;border:0;color:#fff;font-size:18px;cursor:pointer;line-height:1;
          ">×</button>
        </div>

        <div style="height:calc(100% - 44px);display:flex;flex-direction:column;">
          <div style="padding:8px 12px;background:#f7f7f7;border-bottom:1px solid #ddd;font-size:12px;color:#333;">
            <span id="cos_modal_subtitle">Loading...</span>
          </div>

          <iframe
            id="cos_modal_iframe"
            src="about:blank"
            style="border:0;width:100%;height:100%;flex:1;"
          ></iframe>
        </div>
      </div>

      <style>
        #cos_io_wrap .cos-row {
          display:grid;
          grid-template-columns: 28px 2.2fr 1fr 1fr 1fr 1fr 1.4fr;
          padding:8px 10px;
          font-size:12px;
          background:#fff;
          border-bottom:1px solid #eee;
          align-items:center;
          cursor:pointer;
        }
        #cos_io_wrap .cos-row:hover { background:#fafafa; }

        #cos_io_wrap .cos-caret {
          width:18px;height:18px;
          display:flex;align-items:center;justify-content:center;
          border:1px solid #ccc;border-radius:4px;
          background:#f6f6f6;font-size:11px;
          user-select:none;
        }

        #cos_io_wrap .cos-details {
          display:none;
          padding:10px 10px 12px 38px;
          background:#fcfcfc;
          border-bottom:1px solid #eee;
          font-size:12px;
          color:#333;
        }
        #cos_io_wrap .cos-details .box {
          border:1px solid #e3e3e3;border-radius:6px;background:#fff;padding:10px;
        }

        #cos_io_wrap .cos-actions {
          justify-self:end;
          display:flex;
          gap:6px;
          align-items:center;
        }
        #cos_io_wrap .cos-actions button {
          padding:5px 10px;
          cursor:pointer;
        }

        #cos_io_wrap .cos-open .cos-details { display:block; }
        #cos_io_wrap .cos-open .cos-caret { background:#e9f2ff;border-color:#b9d3ff; }
        
        
        #cos_repack_details_wrap .rd-header {
          display:grid;
          grid-template-columns: 90px 2.2fr 1fr 38px 38px;
          gap:8px;
          padding:8px 12px;
          font-weight:bold;
          font-size:12px;
          background:#eee;
          border-bottom:1px solid #ddd;
          align-items:center;
        }
        #cos_repack_details_wrap .rd-row {
          display:grid;
          grid-template-columns: 90px 2.2fr 1fr 38px 38px;
          gap:8px;
          padding:8px 12px;
          font-size:12px;
          border-bottom:1px solid #eee;
          align-items:center;
        }
        #cos_repack_details_wrap .rd-row:nth-child(even) { background:#fafafa; }
        #cos_repack_details_wrap .rd-type { color:#666; text-transform:lowercase; }
        #cos_repack_details_wrap .rd-qty { text-align:right; white-space:nowrap; }
        #cos_repack_details_wrap .rd-remove {
          text-align:right;
        }
        #cos_repack_details_wrap .rd-remove button {
          background:transparent;
          border:0;
          color:#b00;
          font-size:16px;
          cursor:pointer;
          line-height:1;
        }
        #cos_repack_details_wrap .rd-group-title {
          padding:8px 12px;
          font-weight:bold;
          border-bottom:1px solid #ddd;
          background:#f7f7f7;
        }
        #cos_repack_details_wrap .rd-subtle {
          color:#666;
          font-size:11px;
        }
        
        #cos_repack_details_wrap .rd-edit {
          text-align:right;
        }
        #cos_repack_details_wrap .rd-edit button {
          background:transparent;
          border:0;
          cursor:pointer;
          font-size:16px;
          line-height:1;
          padding:2px 6px;
          color:#444;
        }
        #cos_repack_details_wrap .rd-edit button:hover {
          color:#111;
        }
        
        
        
      </style>

      <script>
        (function () {
          var SUITELET_BASE_URL = ${JSON.stringify(suiteletBaseUrl)};

          // Mock rows for visualization (expand as you like)
          var rows = [
            { id:"CHEM-GA50",   name:"CHEM-GA50",   onhand:"5,141.008 lb", available:"3,259.139 lb", committed:"1,881.868 lb", onorder:"0 lb",
              extra:{ location:"Main Warehouse", lot:"Nov 8 2025", status:"Good", prefStock:"0 lb", buildPoint:"0 lb", notes:"Example details for CHEM-GA50." } },
            { id:"CHEM-GA50-P", name:"CHEM-GA50-P", onhand:"11 ea",        available:"11 ea",        committed:"0 ea",        onorder:"30 ea",
              extra:{ location:"Crossdock", lot:"Nov 8 2025", status:"Good", prefStock:"0 ea", buildPoint:"0 ea", notes:"Example details for CHEM-GA50-P." } },
            { id:"CHEM-GA50-D", name:"CHEM-GA50-D", onhand:"13 ea",        available:"13 ea",        committed:"0 ea",        onorder:"1 ea",
              extra:{ location:"Main Warehouse", lot:"Nov 8 2025", status:"Good", prefStock:"0 ea", buildPoint:"0 ea", notes:"Example details for CHEM-GA50-D." } },
            { id:"CHEM-GA50-T", name:"CHEM-GA50-T", onhand:"5.018 ea",     available:"5.018 ea",     committed:"0 ea",        onorder:"0 ea",
              extra:{ location:"Main Warehouse", lot:"Nov 8 2025", status:"Good", prefStock:"0 ea", buildPoint:"0 ea", notes:"Example details for CHEM-GA50-T." } },
            { id:"CHEM-X100",   name:"CHEM-X100",   onhand:"1,250.000 lb", available:"980.000 lb",    committed:"120.000 lb",   onorder:"200.000 lb",
              extra:{ location:"Secondary Warehouse", lot:"Nov 7 2025", status:"Good", prefStock:"100 lb", buildPoint:"50 lb", notes:"Example details for CHEM-X100." } },
            { id:"CHEM-X200",   name:"CHEM-X200",   onhand:"825.500 lb",   available:"600.250 lb",    committed:"50.000 lb",    onorder:"0 lb",
              extra:{ location:"Main Warehouse", lot:"Nov 6 2025", status:"Hold", prefStock:"75 lb", buildPoint:"25 lb", notes:"Example details for CHEM-X200." } },
            { id:"CHEM-Y010",   name:"CHEM-Y010",   onhand:"200 ea",       available:"154 ea",        committed:"30 ea",        onorder:"80 ea",
              extra:{ location:"Crossdock", lot:"Nov 5 2025", status:"Good", prefStock:"20 ea", buildPoint:"10 ea", notes:"Example details for CHEM-Y010." } },
            { id:"CHEM-Z999",   name:"CHEM-Z999",   onhand:"45 ea",        available:"12 ea",         committed:"10 ea",        onorder:"60 ea",
              extra:{ location:"Main Warehouse", lot:"Nov 4 2025", status:"Good", prefStock:"15 ea", buildPoint:"5 ea", notes:"Example details for CHEM-Z999." } }
          ];

          var container = document.getElementById("cos_io_rows");
          if (!container) return;

          function makeEl(tag, className, text) {
            var el = document.createElement(tag);
            if (className) el.className = className;
            if (text !== undefined && text !== null) el.textContent = String(text);
            return el;
          }

          function setKV(grid, k, v) {
            var kEl = document.createElement("div");
            kEl.innerHTML = "<b>" + k + "</b>";
            var vEl = makeEl("div", "", v);
            grid.appendChild(kEl);
            grid.appendChild(vEl);
          }

          function toggleGroup(groupEl) {
            var rowEl = groupEl.querySelector(".cos-row");
            var detailsEl = groupEl.querySelector(".cos-details");
            var caretEl = groupEl.querySelector(".cos-caret");

            var isOpen = groupEl.classList.toggle("cos-open");
            rowEl.setAttribute("aria-expanded", String(isOpen));
            detailsEl.setAttribute("aria-hidden", String(!isOpen));
            caretEl.textContent = isOpen ? "▼" : "▶";
          }

          function buildUrl(baseUrl, params) {
            // Works even if base already has query string
            var q = [];
            for (var k in params) {
              if (!params.hasOwnProperty(k)) continue;
              q.push(encodeURIComponent(k) + "=" + encodeURIComponent(params[k] == null ? "" : String(params[k])));
            }
            if (q.length === 0) return baseUrl;
            return baseUrl + (baseUrl.indexOf("?") >= 0 ? "&" : "?") + q.join("&");
          }

          // Modal controls
          var overlayEl = document.getElementById("cos_modal_overlay");
          var modalEl = document.getElementById("cos_modal");
          var iframeEl = document.getElementById("cos_modal_iframe");
          var titleEl = document.getElementById("cos_modal_title");
          var subtitleEl = document.getElementById("cos_modal_subtitle");

          function openModal(mode, row, inv) {
              titleEl.textContent = mode === "input" ? "Input" : "Output";
              subtitleEl.textContent = (row && row.name) ? row.name : "Details";
            
              // Load Suitelet into iframe (now includes optional inventory context)
              var iframeUrl = buildUrl(SUITELET_BASE_URL, {
                mode: mode,
                itemId: row ? row.id : "",
                itemText: row ? row.name : "",
                invLot: inv && inv.lot ? inv.lot : "",
                invStatus: inv && inv.status ? inv.status : "",
                invAvailable: inv && (inv.available !== undefined) ? String(inv.available) : "",
                invUom: inv && inv.uom ? inv.uom : ""
              });
            
              iframeEl.src = iframeUrl;
            
              overlayEl.style.display = "block";
              modalEl.style.display = "block";
              document.body.style.overflow = "hidden";
            }


          function closeModal() {
            modalEl.style.display = "none";
            overlayEl.style.display = "none";
            document.body.style.overflow = "";

            // Optional: stop Suitelet running when modal closes
            iframeEl.src = "about:blank";
          }

          document.getElementById("cos_modal_close_x").addEventListener("click", closeModal);
          overlayEl.addEventListener("click", closeModal);
          document.addEventListener("keydown", function (e) {
            if (e.key === "Escape" && modalEl.style.display === "block") closeModal();
          });

          // Listen for Suitelet iframe -> parent message payload
          // Suitelet must do: window.parent.postMessage({ type:'COS_REPACK_MODAL_SUBMIT', payload: {...} }, '*');
          // --- Repack Details State ---
var repackState = {
  entries: [] // each entry is one "work order" style submission
};

function getHiddenPayloadField() {
  return document.getElementById("custpage_cos_popup_payload");
}

function syncHiddenField() {
  var hidden = getHiddenPayloadField();
  if (hidden) hidden.value = JSON.stringify(repackState);
}

function addEntryFromPayload(payload) {
  // Normalize payload (defensive)
  var entry = {
    id: String(Date.now()) + "_" + Math.floor(Math.random() * 100000),
    mode: payload && payload.mode ? payload.mode : "input",
    input: payload && payload.input ? payload.input : {},
    outputs: (payload && payload.outputs && payload.outputs.length) ? payload.outputs : []
  };

  repackState.entries.push(entry);
  syncHiddenField();
  renderRepackDetails();
}

function removeEntry(entryId) {
  repackState.entries = repackState.entries.filter(function (e) { return e.id !== entryId; });
  syncHiddenField();
  renderRepackDetails();
}

function formatQty(qty, uomText) {
  var q = (qty == null) ? "" : String(qty);
  var u = (uomText == null) ? "" : String(uomText);
  return (q && u) ? (q + " " + u) : (q || "");
}

function renderRepackDetails() {
  var body = document.getElementById("cos_repack_details_body");
  if (!body) return;

  if (!repackState.entries.length) {
    body.innerHTML =
      '<div style="padding:10px 12px;color:#666;font-size:12px;">' +
      'No selections yet. Choose an Input/Output to add details.' +
      '</div>';
    return;
  }

  // For now, treat each payload submission as a "New Work Order" group
  var html = '';

  repackState.entries.forEach(function (entry, idx) {
    var inputText = entry.input && entry.input.itemText ? entry.input.itemText : (entry.input && entry.input.itemId ? entry.input.itemId : "—");
    var lotText = entry.input && entry.input.lotText ? entry.input.lotText : "";
    var statusText = entry.input && entry.input.statusText ? entry.input.statusText : "";
    var inputQty = entry.input && entry.input.qty ? entry.input.qty : "";
    var inputUom = entry.input && entry.input.uomText ? entry.input.uomText : "";

    var inputLineLabel = inputText;
    var inputSub = [];
    if (lotText && lotText !== "-") inputSub.push("Lot: " + lotText);
    if (statusText) inputSub.push("Status: " + statusText);

    html +=
      '<div class="rd-group-title">' +
        'New Work Order <span class="rd-subtle">(Entry ' + (idx + 1) + ')</span>' +
      '</div>' +

    '<div class="rd-header">' +
            '<div>TYPE</div>' +
        '<div>ITEM</div>' +
        '<div style="text-align:right;">QTY</div>' +
        '<div></div>' +
        '<div></div>' +
    '</div>' +

      // OUTPUT lines (if any)
      (entry.outputs || []).map(function (o) {
        var outId = o.outputId || "—";
        var outQty = o.qty || "";
        return (
          '<div class="rd-row">' +
            '<div class="rd-type">output</div>' +
            '<div>' + outId + '</div>' +
            '<div class="rd-qty">' + outQty + '</div>' +
            '<div></div>' +
          '</div>'
        );
      }).join('') +

      // INPUT line
      '<div class="rd-row">' +
          '<div class="rd-type">input</div>' +
          '<div>' +
            inputLineLabel +
            (inputSub.length ? ('<div class="rd-subtle">' + inputSub.join(' • ') + '</div>') : '') +
          '</div>' +
          '<div class="rd-qty">' + formatQty(inputQty, inputUom) + '</div>' +
        
          // Remove button
          '<div class="rd-remove">' +
            '<button type="button" data-rm="' + entry.id + '" title="Remove">×</button>' +
          '</div>' +
        
          // Edit/reopen icon button (checkbox-like)
          '<div class="rd-edit">' +
            '<button type="button" data-edit="' + entry.id + '" title="Edit">' +
              '☑' +
            '</button>' +
          '</div>' +
        '</div>'
       +

      // Quick add placeholders (just visual)
      '<div style="padding:8px 12px;border-bottom:1px solid #eee;background:#fff;color:#2a5db0;font-size:12px;">' +
        '+ New Input' +
      '</div>' +
      '<div style="padding:8px 12px;border-bottom:1px solid #ddd;background:#fff;color:#2a5db0;font-size:12px;">' +
        '+ New Output' +
      '</div>';
  });

  body.innerHTML = html;

  // Wire remove buttons
  Array.prototype.slice.call(body.querySelectorAll('button[data-rm]')).forEach(function (btn) {
    btn.addEventListener('click', function (e) {
      e.preventDefault();
      var id = btn.getAttribute('data-rm');
      removeEntry(id);
    });
  });
  
  Array.prototype.slice.call(body.querySelectorAll('button[data-edit]')).forEach(function (btn) {
  btn.addEventListener('click', function (e) {
    e.preventDefault();
    e.stopPropagation();

    var entryId = btn.getAttribute('data-edit');
    var entry = repackState.entries.find(function (x) { return x.id === entryId; });
    if (!entry) return;

    // Minimal: reopen modal using entry input info (no prefill yet)
    var rowStub = {
      id: (entry.input && entry.input.itemId) ? entry.input.itemId : "",
      name: (entry.input && entry.input.itemText) ? entry.input.itemText : ""
    };

    openModal("input", rowStub); // later we’ll pass the entry to prefill
  });
});

  
}

// --- Listen for iframe Suitelet messages ---
window.addEventListener("message", function (event) {
  try {
    var data = event.data;
    if (!data || typeof data !== "object") return;

    if (data.type === "COS_REPACK_MODAL_SUBMIT") {
      // store to hidden field (raw payload) if you still want it:
      // var hiddenField = document.getElementById("custpage_cos_popup_payload");
      // if (hiddenField) hiddenField.value = JSON.stringify(data.payload || {});

      addEntryFromPayload(data.payload || {});
      closeModal(); // your existing closeModal() already defined
      return;
    }

    if (data.type === "COS_REPACK_MODAL_CLOSE") {
      closeModal();
      return;
    }
  } catch (err) {
    console && console.error && console.error(err);
  }
});

// Initial render in case hidden field already has content
(function initRepackDetailsFromHidden() {
  try {
    var hidden = getHiddenPayloadField();
    if (!hidden || !hidden.value) return;

    // If the hidden field contains repackState JSON, reload it
    var parsed = JSON.parse(hidden.value);
    if (parsed && parsed.entries && Array.isArray(parsed.entries)) {
      repackState = parsed;
      renderRepackDetails();
    }
  } catch (e) {
    // ignore
  }
})();

          
          
          // Dummy inventory-by-item (lot rows)
            var inventoryByItemId = {
              "CHEM-GA50": [
                { lot: "Nov 8 2025",  status: "Good",            available: 341.008, uom: "lb", pounds: 341.008 },
                { lot: "Nov 16 2025", status: "Good",            available: 800.000, uom: "lb", pounds: 800.000 },
                { lot: "Nov 20 2025", status: "Good",            available: 400.000, uom: "lb", pounds: 400.000 },
                { lot: "Nov 22 2025", status: "Requires Rework", available: 1000.000, uom: "lb", pounds: 1000.000 },
                { lot: "Nov 24 2025", status: "Good",            available: 2200.000, uom: "lb", pounds: 2200.000 }
              ],
              "CHEM-GA50-P": [
                { lot: "-", status: "Good", available: 11, uom: "ea", pounds: "-" }
              ],
              "CHEM-GA50-D": [
                { lot: "-", status: "Good", available: 13, uom: "ea", pounds: "-" }
              ],
              "CHEM-GA50-T": [
                { lot: "-", status: "Good", available: 5.018, uom: "ea", pounds: "-" }
              ]
            };


          // Render rows
          rows.forEach(function (r) {
            var group = makeEl("div", "cos-group", "");
            group.setAttribute("data-rowid", r.id);

            // Row header
            var row = makeEl("div", "cos-row", "");
            row.setAttribute("role", "button");
            row.setAttribute("tabindex", "0");
            row.setAttribute("aria-expanded", "false");

            var caretWrap = makeEl("div", "", "");
            var caret = makeEl("div", "cos-caret", "▶");
            caretWrap.appendChild(caret);

            row.appendChild(caretWrap);
            row.appendChild(makeEl("div", "", r.name));
            row.appendChild(makeEl("div", "", r.onhand));
            row.appendChild(makeEl("div", "", r.available));
            row.appendChild(makeEl("div", "", r.committed));
            row.appendChild(makeEl("div", "", r.onorder));

            // Actions
            var actions = makeEl("div", "cos-actions", "");
            actions.addEventListener("click", function (e) { e.stopPropagation(); });

            var btnIn = makeEl("button", "", "Input");
            btnIn.type = "button";

            var btnOut = makeEl("button", "", "Output");
            btnOut.type = "button";

            actions.appendChild(btnIn);
            actions.appendChild(btnOut);
            row.appendChild(actions);

            // Details panel (Inventory table)
            var details = makeEl("div", "cos-details", "");
            details.setAttribute("aria-hidden", "true");
            
            // Build a container similar to NetSuite look
            var box = makeEl("div", "box", "");
            box.style.padding = "0"; // we'll control padding via inner sections
            
            // Title bar inside expanded area
            var invHeader = makeEl("div", "", "");
            invHeader.style.padding = "8px 10px";
            invHeader.style.background = "#f1f3f6";
            invHeader.style.borderBottom = "1px solid #ddd";
            invHeader.style.fontWeight = "bold";
            invHeader.style.fontSize = "12px";
            invHeader.textContent = "Current Inventory";
            box.appendChild(invHeader);
            
            // Table header row
            var tblHead = makeEl("div", "", "");
            tblHead.style.display = "grid";
            tblHead.style.gridTemplateColumns = "1.2fr 1fr 1fr 1fr 1fr";
            tblHead.style.padding = "8px 10px";
            tblHead.style.fontSize = "11px";
            tblHead.style.fontWeight = "bold";
            tblHead.style.background = "#eee";
            tblHead.style.borderBottom = "1px solid #ddd";
            tblHead.innerHTML =
              "<div>SERIAL/LOT</div>" +
              "<div>STATUS</div>" +
              "<div style='text-align:right;'>AVAILABLE</div>" +
              "<div style='text-align:right;'>AVAILABLE IN POUNDS</div>" +
              "<div style='text-align:right;'>ADD ITEM AS</div>";
            box.appendChild(tblHead);
            
            // Table body rows
            var invRows = inventoryByItemId[r.id] || [
              { lot: "-", status: "Good", available: "-", uom: "", pounds: "-" }
            ];
            
            invRows.forEach(function (inv, idx) {
              var rowEl = makeEl("div", "", "");
              rowEl.style.display = "grid";
              rowEl.style.gridTemplateColumns = "1.2fr 1fr 1fr 1fr 1fr";
              rowEl.style.padding = "8px 10px";
              rowEl.style.fontSize = "12px";
              rowEl.style.borderBottom = "1px solid #eee";
              rowEl.style.alignItems = "center";
              rowEl.style.background = (idx % 2 === 0) ? "#fff" : "#fafafa";
            
              // Lot/Serial
              var c1 = makeEl("div", "", inv.lot);
              // Status
              var c2 = makeEl("div", "", inv.status);
            
              // Available (right aligned)
              var c3 = makeEl("div", "", (inv.available === "-" ? "-" : (String(inv.available) + " " + (inv.uom || ""))));
              c3.style.textAlign = "right";
            
              // Pounds (right aligned)
              var c4 = makeEl("div", "", (inv.pounds === "-" ? "-" : (String(inv.pounds) + " lb")));
              c4.style.textAlign = "right";
            
              // Action button
              var c5 = makeEl("div", "", "");
              c5.style.textAlign = "right";
            
              var btnLotInput = makeEl("button", "", "Input");
              btnLotInput.type = "button";
              btnLotInput.style.padding = "5px 10px";
              btnLotInput.style.cursor = "pointer";
            
              // Clicking this chooses the lot as input and opens the modal with inv context
              btnLotInput.addEventListener("click", function (e) {
                e.stopPropagation(); // don't collapse row
                openModal("input", r, inv);
              });
            
              c5.appendChild(btnLotInput);
            
              rowEl.appendChild(c1);
              rowEl.appendChild(c2);
              rowEl.appendChild(c3);
              rowEl.appendChild(c4);
              rowEl.appendChild(c5);
            
              box.appendChild(rowEl);
            });
            
            details.appendChild(box);


            // Expand/collapse
            row.addEventListener("click", function () { toggleGroup(group); });
            row.addEventListener("keydown", function (e) {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                toggleGroup(group);
              }
            });

            // Button handlers -> open iframe modal
            btnIn.addEventListener("click", function () {
              openModal("input", r);
            });
            btnOut.addEventListener("click", function () {
              openModal("output", r);
            });

            group.appendChild(row);
            group.appendChild(details);
            container.appendChild(group);
          });

        })();
      </script>
    `;
    };

    return {beforeLoad};
});

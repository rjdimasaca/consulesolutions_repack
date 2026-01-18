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

          function openModal(mode, row) {
            titleEl.textContent = mode === "input" ? "Input" : "Output";
            subtitleEl.textContent = (row && row.name) ? row.name : "Details";

            // Load Suitelet into iframe
            var iframeUrl = buildUrl(SUITELET_BASE_URL, {
              mode: mode,
              itemId: row ? row.id : "",
              itemText: row ? row.name : ""
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
          window.addEventListener("message", function (event) {
            try {
              var data = event.data;
              if (!data || typeof data !== "object") return;
              if (data.type !== "COS_REPACK_MODAL_SUBMIT") return;

              // Store payload to hidden field
              var hiddenField = document.getElementById("custpage_cos_popup_payload");
              if (hiddenField) {
                hiddenField.value = JSON.stringify(data.payload || {});
              }

              // Close modal after successful submit
              closeModal();
            } catch (err) {
              // keep quiet to avoid breaking UI
              console && console.error && console.error(err);
            }
          });

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

            // Details panel
            var details = makeEl("div", "cos-details", "");
            details.setAttribute("aria-hidden", "true");

            var box = makeEl("div", "box", "");
            var grid = makeEl("div", "", "");
            grid.style.display = "grid";
            grid.style.gridTemplateColumns = "160px 1fr";
            grid.style.gap = "6px 12px";

            setKV(grid, "Location", r.extra.location);
            setKV(grid, "Lot", r.extra.lot);
            setKV(grid, "Status", r.extra.status);
            setKV(grid, "Preferred Stock", r.extra.prefStock);
            setKV(grid, "Build Point", r.extra.buildPoint);
            setKV(grid, "Notes", r.extra.notes);

            box.appendChild(grid);
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

    return { beforeLoad };
});

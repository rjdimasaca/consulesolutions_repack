/**
 * @NApiVersion 2.1
 * @NScriptType Suitelet
 *
 * IFRAME MODAL VERSION
 * - This Suitelet is intended to be loaded inside an <iframe> shown in a parent User Event INLINEHTML modal.
 * - On OK, it posts a message to the parent window:
 *     window.parent.postMessage({ type: 'COS_REPACK_MODAL_SUBMIT', payload: {...} }, '*');
 * - On Close, it posts a close request:
 *     window.parent.postMessage({ type: 'COS_REPACK_MODAL_CLOSE' }, '*');
 */
define([], () => {

    const onRequest = (context) => {
        const req = context.request;
        const res = context.response;

        const mode = (req.parameters.mode || 'input').toLowerCase();
        const itemId = req.parameters.itemId || '';
        const itemText = req.parameters.itemText || '';

        // Mock output rows (replace later with real search data)
        const outputRows = [
            { id: 'CHEM-GA50',   text: 'CHEM-GA50',   suggested: '0 lb', onhand: '5,141.008 lb', available: '3,259.139 lb', committed: '1,881.868 lb', onorder: '0 lb',  uom: 'lb' },
            { id: 'CHEM-GA50-P', text: 'CHEM-GA50-P', suggested: '0 ea', onhand: '11 ea',        available: '11 ea',        committed: '0 ea',        onorder: '30 ea', uom: 'ea' },
            { id: 'CHEM-GA50-D', text: 'CHEM-GA50-D', suggested: '0 ea', onhand: '13 ea',        available: '13 ea',        committed: '0 ea',        onorder: '1 ea',  uom: 'ea' },
            { id: 'CHEM-GA50-T', text: 'CHEM-GA50-T', suggested: '0 ea', onhand: '5.018 ea',     available: '5.018 ea',     committed: '0 ea',        onorder: '0 ea',  uom: 'ea' }
        ];

        res.write(buildHtml({ mode, itemId, itemText, outputRows }));
    };

    function escapeHtml(s) {
        return String(s ?? '').replace(/[&<>"']/g, (c) => ({
            '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
        }[c]));
    }

    function buildHtml({ mode, itemId, itemText, outputRows }) {
        const safeMode = escapeHtml(mode);
        const safeItemText = escapeHtml(itemText || '—');

        const rowsHtml = outputRows.map((r) => `
      <div class="gridRow">
        <div>${escapeHtml(r.text)}</div>
        <div>${escapeHtml(r.suggested)}</div>
        <div>${escapeHtml(r.onhand)}</div>
        <div>${escapeHtml(r.available)}</div>
        <div>${escapeHtml(r.committed)}</div>
        <div>${escapeHtml(r.onorder)}</div>
        <div class="qtyCell">
          <input class="qtyInput" type="text" data-outputid="${escapeHtml(r.id)}" placeholder="0" />
          <span class="uom">${escapeHtml(r.uom)}</span>
        </div>
      </div>
    `).join('');

        return `
<!doctype html>
<html>
<head>
  <meta charset="utf-8"/>
  <title>${safeMode === 'output' ? 'Output' : 'Input'}</title>
  <style>
    body { margin:0; font-family: Arial, sans-serif; background:#fff; }
    .section { padding:10px 12px; border-bottom:1px solid #ddd; }
    .sectionTitle { font-weight:bold; margin-bottom:6px; }
    .inputLayout { display:flex; gap:16px; justify-content:space-between; align-items:flex-start; }
    .kv { display:grid; grid-template-columns:70px 1fr; gap:4px 10px; font-size:12px; }
    .k { color:#666; }
    .v { color:#111; }
    .qtyBox { min-width:320px; }
    .qtyRow { display:flex; justify-content:space-between; align-items:center; margin-top:6px; }
    .qtyRowLabel { font-size:12px; color:#666; }
    .qtyRowRight { display:flex; gap:8px; align-items:center; }
    .qtyMain { padding:6px; width:180px; }

    .subHeader { padding:10px 12px; background:#f1f3f6; border-bottom:1px solid #ddd; font-weight:bold; }
    .tools { padding:8px 12px; border-bottom:1px solid #ddd; background:#fafafa; display:flex; gap:6px; }
    .tools button { padding:4px 8px; cursor:pointer; }

    .gridHeader, .gridRow {
      display:grid;
      grid-template-columns: 2.2fr 1fr 1fr 1fr 1fr 1fr 1.2fr;
      padding:8px 12px;
      font-size:12px;
      align-items:center;
    }
    .gridHeader {
      font-weight:bold; background:#eee; border-bottom:1px solid #ddd;
      position:sticky; top:0;
    }
    .gridRow { border-bottom:1px solid #eee; }
    .qtyCell { display:flex; gap:8px; justify-content:flex-end; align-items:center; }
    .qtyInput { padding:6px; width:140px; }
    .uom { color:#666; }

    /* Footer buttons */
    .footer {
      padding:10px 12px; border-top:1px solid #ddd; background:#f7f7f7;
      display:flex; gap:8px;
      position:sticky; bottom:0;
    }
    .footer button { padding:6px 14px; cursor:pointer; }

    /* Scroll container inside iframe (so parent modal can be fixed height) */
    .scrollArea { height: calc(100vh - 120px - 44px); overflow:auto; }
  </style>
</head>
<body>

  <div class="section">
    <div class="sectionTitle">${safeMode === 'output' ? 'Output' : 'Input'}</div>

    <div class="inputLayout">
      <div class="kv">
        <div class="k">${safeMode === 'output' ? 'OUTPUT' : 'INPUT'}</div>
        <div class="v" id="inputItemText">${safeItemText}</div>

        <div class="k">LOT</div>
        <div class="v" id="inputLot">Nov 8 2025</div>

        <div class="k">STATUS</div>
        <div class="v" id="inputStatus">Good</div>
      </div>

      <div class="qtyBox">
        <div class="qtyRow" style="margin-top:0;">
          <div class="qtyRowLabel">AVAILABLE</div>
          <div class="v" id="inputAvailable">341.0077 lb</div>
        </div>

        <div class="qtyRow">
          <div class="qtyRowLabel">QUANTITY</div>
          <div class="qtyRowRight">
            <input id="inputQty" class="qtyMain" type="text" value="341.0077" />
            <span id="inputUom" class="uom">lb</span>
          </div>
        </div>
      </div>
    </div>
  </div>

  <div class="subHeader">Select Outputs</div>

  <div class="tools">
    <button id="btnExpandAll" type="button">Expand all</button>
    <button id="btnCustomize" type="button">Customize</button>
  </div>

  <div class="scrollArea" id="scrollArea">
    <div class="gridHeader">
      <div>Item</div>
      <div>Suggested Output</div>
      <div>On Hand</div>
      <div>Available</div>
      <div>Committed</div>
      <div>On Order</div>
      <div>Quantity</div>
    </div>
    ${rowsHtml}
  </div>

  <div class="footer">
    <button id="btnOk" type="button">OK</button>
    <button id="btnClose" type="button">Close</button>
  </div>

  <script>
    (function () {
      var MODE = ${JSON.stringify(mode)};
      var ITEM_ID = ${JSON.stringify(itemId)};
      var ITEM_TEXT = ${JSON.stringify(itemText)};

      function gatherPayload() {
        var inputQtyEl = document.getElementById('inputQty');
        var inputQty = inputQtyEl ? inputQtyEl.value : '';

        var outputs = Array.prototype.slice.call(document.querySelectorAll('input.qtyInput[data-outputid]'))
          .map(function (inp) {
            return { outputId: inp.getAttribute('data-outputid'), qty: inp.value };
          })
          .filter(function (x) {
            return x.qty && String(x.qty).trim() !== '';
          });

        return {
          mode: MODE,
          input: {
            itemId: ITEM_ID,
            itemText: ITEM_TEXT,
            qty: inputQty,
            lotText: (document.getElementById('inputLot') || {}).textContent || '',
            statusText: (document.getElementById('inputStatus') || {}).textContent || '',
            availableText: (document.getElementById('inputAvailable') || {}).textContent || '',
            uomText: (document.getElementById('inputUom') || {}).textContent || ''
          },
          outputs: outputs
        };
      }

      function postSubmit(payload) {
        // Parent UE listens for type 'COS_REPACK_MODAL_SUBMIT'
        window.parent.postMessage({ type: 'COS_REPACK_MODAL_SUBMIT', payload: payload }, '*');
      }

      function postClose() {
        // Optional: parent may also listen for explicit close
        window.parent.postMessage({ type: 'COS_REPACK_MODAL_CLOSE' }, '*');
      }

      document.getElementById('btnOk').addEventListener('click', function () {
        var payload = gatherPayload();
        postSubmit(payload);
      });

      document.getElementById('btnClose').addEventListener('click', function () {
        postClose();
      });

      document.addEventListener('keydown', function (e) {
        if (e.key === 'Escape') postClose();
      });

      // Cosmetic buttons for now
      document.getElementById('btnExpandAll').addEventListener('click', function () {
        alert('Expand all (not implemented yet)');
      });
      document.getElementById('btnCustomize').addEventListener('click', function () {
        alert('Customize (not implemented yet)');
      });
    })();
  </script>

</body>
</html>
`;
    }

    return { onRequest };
});

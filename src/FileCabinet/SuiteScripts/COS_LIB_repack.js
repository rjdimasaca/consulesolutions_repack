/**
 * COS Repack Library (shared constants + helpers)
 * @NApiVersion 2.1
 * @NModuleScope Public
 *
 * Usage (SuiteScript 2.1):
 *   define(['./COS_LIB_repack', 'N/search'], function(COS_LIB, search){ ... });
 */
define(['N/search','N/log'], function (search, log) {

  // -----------------------------
  // Constants
  // -----------------------------
  var CONST = {
    // Record fields (custom record: COS Repack)
    FIELD: {
      SUBSIDIARY: 'custrecord_cos_rep_subsidiary',
      LOCATION:   'custrecord_cos_rep_location',
      SPECIES:    'custrecord_cos_rep_species',
      STATUS:     'custrecord_cos_rep_status',
      DATE:       'custrecord_cos_rep_date',
      WIP:        'custrecord_cos_rep_wip',

      // Persisted JSON payloads on the repack record
      SUMMARY_PAYLOAD:    'custrecord_cos_rep_summary_payload',
      INPUT_LOTS_PAYLOAD: 'custrecord_cos_rep_input_lots_payload',

      // Optional helper fields used by the Actions Suitelet
      CREATED_WO_IDS:  'custrecord_cos_rep_created_wo_ids',
      CREATED_WO_DATE: 'custrecord_cos_rep_created_wo_date'
    },

    // UI-only hidden fields (custpage)
    CUSTPAGE: {
      OUTPUTS_PAYLOAD:    'custpage_cos_outputs_payload',
      INPUTS_PAYLOAD:     'custpage_cos_inputs_payload',
      PO_PAYLOAD:         'custpage_cos_po_payload',
      SUMMARY_PAYLOAD:    'custpage_cos_summary_payload',
      INPUT_LOTS_PAYLOAD: 'custpage_cos_input_lots_payload',

      CREATE_WO_URL:      'custpage_cos_createwo_url',
      PRINT_REPACK_URL:   'custpage_cos_printrepack_url'
    },

    // Status values
    STATUS: {
      DRAFT:          '1',
      WO_IN_PROGRESS: '2',
      WO_CREATED:     '3'
    },

    // Transactions / linking
    BODY: {
      CREATED_FROM_REPACK: 'custbody_cos_createdfromrepack'
    },

    // Defaults
    DEFAULT: {
      PO_VENDOR_ID: '621'
    },

    // Script/Deployment ids (defaults used in your current files; can be overridden in callers if needed)
    SCRIPT: {
      PRINT_REPACK: { scriptId: 'customscript_cos_sl_repack_print',   deployId: 'customdeploy_cos_sl_repack_print' },
      CREATE_WO:    { scriptId: 'customscript_cos_sl_repack_actions', deployId: 'customdeploy_cos_sl_repack_actions' },
      LOT_POPUP:    { scriptId: 'customscript_cos_repack_popup_sl',   deployId: 'customdeploy_cos_repack_popup_sl' }
    },

    // Item field ids
    ITEM: {
      CONVERSION: 'custitem_repack_conversion',
      SPECIES:    'custitem_repack_species'
    }
  };

  // -----------------------------
  // Small helpers
  // -----------------------------
  function isTrue(v) {
    return v === true || v === 'T' || v === 'true' || v === 1 || v === '1';
  }

  function toNum(v) {
    var n = parseFloat(v);
    return isNaN(n) ? 0 : n;
  }

  function roundN(n, pow10) {
    var x = Number(n);
    if (!isFinite(x)) return 0;
    return Math.round(x * pow10) / pow10;
  }

  function round3(n) { return roundN(n, 1e3); }
  function round6(n) { return roundN(n, 1e6); }
  function round9(n) { return roundN(n, 1e9); }

  /**
   * Return a numeric string trimmed for UI display:
   * - Integers show without decimals
   * - Otherwise up to 6 decimals, trailing zeros removed
   */
  function roundNice(n) {
    if (n === null || n === undefined || n === '') return '';
    var x = Number(n);
    if (!isFinite(x)) return '';
    var r = round6(x);
    if (Math.abs(r - Math.round(r)) < 1e-9) return String(Math.round(r));
    // keep up to 6dp but trim trailing zeros
    var s = r.toFixed(6).replace(/\.?0+$/, '');
    return s;
  }

  function safeParseJson(raw) {
    try {
      if (raw === null || raw === undefined) return null;
      if (typeof raw !== 'string') return raw; // already an object
      var t = String(raw).trim();
      if (!t) return null;
      var p = JSON.parse(t);
      // Sometimes values are JSON strings that contain JSON
      if (typeof p === 'string' && p) {
        try { return JSON.parse(p); } catch (_e2) { return p; }
      }
      return p;
    } catch (e) {
      return null;
    }
  }

  function firstNonEmptyString() {
    for (var i = 0; i < arguments.length; i++) {
      var v = arguments[i];
      if (v === null || v === undefined) continue;
      var s = String(v);
      if (s && s.trim().length) return s;
    }
    return '';
  }

  function chunkArray(arr, chunkSize) {
    var out = [];
    var a = Array.isArray(arr) ? arr : [];
    var n = Math.max(1, Number(chunkSize) || 1000);
    for (var i = 0; i < a.length; i += n) out.push(a.slice(i, i + n));
    return out;
  }

  function htmlEscape(s) {
    return String(s || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function xmlEscape(s) {
    return String(s || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&apos;');
  }

  function buildUrl(baseUrl, params) {
    var q = [];
    var p = params || {};
    for (var k in p) {
      if (!Object.prototype.hasOwnProperty.call(p, k)) continue;
      q.push(encodeURIComponent(k) + '=' + encodeURIComponent(p[k] == null ? '' : String(p[k])));
    }
    if (!q.length) return baseUrl;
    return baseUrl + (String(baseUrl).indexOf('?') >= 0 ? '&' : '?') + q.join('&');
  }

  function nowIso() {
    try { return (new Date()).toISOString(); } catch (_e) { return String(new Date()); }
  }

  // -----------------------------
  // Search helpers (server-side)
  // -----------------------------
  /**
   * Fetch item conversion map (itemId -> conversion number) using custitem_repack_conversion
   * Safe to call from UE/Suitelet (server-side). For client-side, use a Suitelet/RESTlet.
   */
  function fetchConversionMap(itemIds) {
    var map = {};
    var ids = (itemIds || []).filter(Boolean).map(String);
    if (!ids.length) return map;

    try {
      // NetSuite anyof list size limits; chunk defensively
      var chunks = chunkArray(ids, 900);
      chunks.forEach(function (chunk) {
        var s = search.create({
          type: search.Type.ITEM,
          filters: [['internalid', 'anyof', chunk]],
          columns: [
            search.createColumn({ name: 'internalid' }),
            search.createColumn({ name: CONST.ITEM.CONVERSION })
          ]
        });

        s.run().each(function (r) {
          var id = String(r.getValue({ name: 'internalid' }) || '');
          if (!id) return true;
          map[id] = toNum(r.getValue({ name: CONST.ITEM.CONVERSION }));
          return true;
        });
      });
    } catch (e) {
      try { log.error({ title: 'COS_LIB: fetchConversionMap failed', details: e }); } catch (_e2) {}
    }

    return map;
  }

  // -----------------------------
  // Exports
  // -----------------------------
  return {
    CONST: CONST,

    // primitives
    isTrue: isTrue,
    toNum: toNum,

    // rounding
    round3: round3,
    round6: round6,
    round9: round9,
    roundNice: roundNice,

    // json/strings
    safeParseJson: safeParseJson,
    firstNonEmptyString: firstNonEmptyString,
    chunkArray: chunkArray,

    // escaping/urls/time
    htmlEscape: htmlEscape,
    xmlEscape: xmlEscape,
    buildUrl: buildUrl,
    nowIso: nowIso,

    // searches
    fetchConversionMap: fetchConversionMap
  };
});

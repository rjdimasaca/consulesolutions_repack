/**
 * @NApiVersion 2.1
 * @NScriptType ClientScript
 */
define(['N/currentRecord', 'N/url'], (currentRecord, url) => {

    const COS_UI = {};

    let COS_MODAL_OVERLAY_ID = 'cos_parent_modal_overlay';

    function lockParentUI() {
        if (document.getElementById(COS_MODAL_OVERLAY_ID)) return;

        const overlay = document.createElement('div');
        overlay.id = COS_MODAL_OVERLAY_ID;
        overlay.style.position = 'fixed';
        overlay.style.top = '0';
        overlay.style.left = '0';
        overlay.style.width = '100vw';
        overlay.style.height = '100vh';
        overlay.style.background = 'rgba(0,0,0,0.25)';
        overlay.style.zIndex = '999999';
        overlay.style.cursor = 'not-allowed';

        overlay.innerHTML = '<div style="color:#fff;font-size:16px;position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);">Complete the popup to continue</div>';

        document.body.appendChild(overlay);
        document.body.style.overflow = 'hidden';
    }

    function unlockParentUI() {
        const overlay = document.getElementById(COS_MODAL_OVERLAY_ID);
        if (overlay) overlay.remove();
        document.body.style.overflow = '';
    }

    COS_UI.openInputPopup = (context) => {
        const suiteletUrl = url.resolveScript({
            scriptId: 'customscript_cos_repack_popup_sl',
            deploymentId: 'customdeploy_cos_repack_popup_sl',
            params: {
                mode: 'input',
                itemId: context.itemId || '',
                itemText: context.itemText || ''
            }
        });

        lockParentUI();

        const popup = window.open(
            suiteletUrl,
            'cos_repack_popup',
            'width=1200,height=760,resizable=yes,scrollbars=yes'
        );

        // Safety: if popup is blocked or closed manually
        const watcher = setInterval(() => {
            if (!popup || popup.closed) {
                clearInterval(watcher);
                unlockParentUI();
            }
        }, 500);

        popup.focus();
    };

    COS_UI.receivePopupPayload = (payload) => {
        try {
            const rec = currentRecord.get();

            rec.setValue({
                fieldId: 'custpage_cos_popup_payload',
                value: JSON.stringify(payload || {})
            });

            unlockParentUI();   // ✅ unlock parent here

            console.log('Popup payload stored:', payload);
        } catch (e) {
            unlockParentUI();
            console.error(e);
        }
    };

    // Expose to INLINEHTML + popup
    window.COS_UI = COS_UI;

    return {};
});

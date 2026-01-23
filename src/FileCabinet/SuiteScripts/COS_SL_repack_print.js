/**
 * @NApiVersion 2.x
 * @NScriptType Suitelet
 */
define(['N/render'], function (render) {

    function xmlEscape(s) {
        if (s === null || s === undefined) return '';
        return String(s)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&apos;');
    }

    function onRequest(context) {
        if (context.request.method !== 'GET') {
            context.response.write('Only GET is supported.');
            return;
        }

        var repackId = context.request.parameters.repackid || 'N/A';
        repackId = xmlEscape(repackId);

        var xml =
            '<?xml version="1.0"?>' +
            '<!DOCTYPE pdf PUBLIC "-//big.faceless.org//report" "report-1.1.dtd">' +
            '<pdf>' +
            '  <head>' +
            '    <style type="text/css">' +
            '      body { font-family: Helvetica, Arial, sans-serif; font-size: 12px; }' +
            '      .h1 { font-size: 18px; font-weight: bold; margin-bottom: 10px; }' +
            '    </style>' +
            '  </head>' +
            '  <body>' +
            '    <div class="h1">Repack Print</div>' +
            '    <p><b>Repack Record ID:</b> ' + repackId + '</p>' +
            '    <p>This is a placeholder PDF.</p>' +
            '  </body>' +
            '</pdf>';

        var pdfFile = render.xmlToPdf({
            xmlString: xml
        });

        context.response.writeFile({
            file: pdfFile,
            isInline: true
        });
    }

    return {
        onRequest: onRequest
    };
});

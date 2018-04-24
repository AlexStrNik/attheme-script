'use strict';
const server = require('vscode-languageserver');
const variables = require('attheme-default-values')
const NamedColors = require('./color-names.js');
const ls = require('vscode-languageserver-protocol');
const protocol = require('vscode-languageserver-protocol/lib/protocol.colorProvider.proposed');
var keys = []
for(var key in variables) keys.push({ label: key, kind: server.CompletionItemKind.Color, data: key});
// Create a connection for the server. The connection uses Node's IPC as a transport
var connection = server.createConnection(new server.IPCMessageReader(process), new server.IPCMessageWriter(process));
// Create a simple text document manager. The text document manager
// supports full document sync only
var documents = new server.TextDocuments();

// Make the text document manager listen on the connection
// for open, change and close text document events
documents.listen(connection);
// After the server has started the client sends an initialize request. The server receives
// in the passed params the rootPath of the workspace plus the client capabilities. 
var workspaceRoot;
connection.onInitialize(function (params) {
    workspaceRoot = params.rootPath;
    return {
        capabilities: {
            // Tell the client that the server works in FULL text document sync mode
            textDocumentSync: documents.syncKind,
            // Tell the client that the server support code complete
            completionProvider: {
                resolveProvider: true
            },
            documentSymbolProvider: true,
            colorProvider: true
        }
    };
});
// The content of a text document has changed. This event is emitted
// when the text document first opened or when its content has changed.
documents.onDidChangeContent(function (change) {
    validateTextDocument(change.document);
});
// hold the maxNumberOfProblems setting
// The settings have changed. Is send on server activation
// as well.
function rgbToHex(r, g, b) {
    return "#" + ((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1);
}

function colorIsValid(string){
    if(string[0]=='$'){
        if(colorVariables[string]==null | colorVariables[string]==undefined){
            return string+" variable is not defined";
        }
        return null;
    }
    return null;
}

function colorToHex(string, c_line){
    if(!string){
        return null;
    }
    if(string[0]=='$'){
        var curLineValue = null;
        var ll;
        for(var line in colorVariables[string]){
            if(Number(line) < c_line){
                curLineValue = colorVariables[string][line]
                ll = line;
            }
        }
        return colorToHex(curLineValue,ll);
    }
    if(string[0]=='#'){
        return string
    }
    if(NamedColors[string]){
        return NamedColors[string];
    }
    if(string.startsWith("rgba")){
        var nums = /rgba\((\d+),\s*(\d+),\s*(\d+),\s*([\d\.]+)(\%?)\)/i.exec(string),
        r = parseInt(nums[1], 10).toString(16),
        g = parseInt(nums[2], 10).toString(16),
        b = parseInt(nums[3], 10).toString(16),
        a = Math.round(parseFloat(nums[4], 10)*(string.indexOf('%')>0?2.55:255)).toString(16);
        return `#${(r.length == 1 ? "0"+ r : r)}${(g.length == 1 ? "0"+ g : g)}${(b.length == 1 ? "0"+ b : b)}${(a.length == 1 ? "0"+ a : a)}`;
    }
    if(string.startsWith("rgb")){
        var nums = /rgb\((\d+),\s*(\d+),\s*(\d+)\)/i.exec(string),
        r = parseInt(nums[1], 10).toString(16),
        g = parseInt(nums[2], 10).toString(16),
        b = parseInt(nums[3], 10).toString(16);
        return `#${(r.length == 1 ? "0"+ r : r)}${(g.length == 1 ? "0"+ g : g)}${(b.length == 1 ? "0"+ b : b)}`;
    }
    return null;
}

var colorVariables = {};

function validateTextDocument(textDocument) {
    var diagnostics = [];
    colorVariables = {};
    var lines = textDocument.getText().split(/\r?\n/g);
    for (var i = 0; i < lines.length; i++) {
        var line = lines[i];
        if(line.indexOf('=')!=-1){
            var colorVarName = line.split('=')[0].trim();
            var colorVarValue = line.split('=')[1].trim();
            if(colorVariables[colorVarName] == null|colorVariables[colorVarName]==undefined){
                colorVariables[colorVarName]={first:i}
            }
            colorVariables[colorVarName][i]=colorVarValue;
            var colorCheck = colorIsValid(colorVarValue);
            if(colorCheck){
                var index = line.indexOf(colorVarValue);
                diagnostics.push({
                    severity: server.DiagnosticSeverity.Error,
                    range: {
                        start: { line: i, character: index },
                        end: { line: i, character: index + colorVarValue.length }
                    },
                    message: colorCheck,
                    source: 'attheme-variables'
                });
            }
        }
        if(line.indexOf(':')!=-1){
            var varName = line.split(':')[0].trim();
            var color = line.split(':')[1].trim();

            var colorCheck = colorIsValid(color);
            if(colorCheck){
                var index = line.indexOf(color);
                diagnostics.push({
                    severity: server.DiagnosticSeverity.Error,
                    range: {
                        start: { line: i, character: index },
                        end: { line: i, character: index + color.length }
                    },
                    message: colorCheck,
                    source: 'attheme-variables'
                });
            }

            if(varName[0]=='$'|(varName[0]=='"'&&varName[varName.length-1]=='"')){
                continue;
            }
            if(variables[varName]==null|variables[varName]==undefined){
                var index = line.indexOf(varName);
                diagnostics.push({
                    severity: server.DiagnosticSeverity.Warning,
                    range: {
                        start: { line: i, character: index },
                        end: { line: i, character: index + varName.length }
                    },
                    message: varName + " is not a standart variable",
                    source: 'attheme-variables'
                });
            }
        }
    }
    // Send the computed diagnostics to VSCode.
    connection.sendDiagnostics({ uri: textDocument.uri, diagnostics: diagnostics });
}
connection.onDidChangeWatchedFiles(function (change) {
    // Monitored files have change in VSCode
    connection.console.log('We received an file change event');
});
// This handler provides the initial list of the completion items.
connection.onCompletion(function (textDocumentPosition) {
    let document = documents.get(textDocumentPosition.textDocument.uri);
    let string = document.getText().split(/\r?\n/g)[textDocumentPosition.position.line];
    if(string.indexOf(':') >= textDocumentPosition.position.character | (string.indexOf(':')==-1 && string.indexOf('=')==-1)){
        var definedVars = [];
        for(var v in colorVariables){
            if(v.first<textDocumentPosition.position.line){
                definedVars.push({label: v, documentation: colorToHex(v), data: {t:'cvars'}, kind: server.CompletionItemKind.Color})
            }
        }
        return keys.map((item)=>{return {label: item.label, documentation: rgbToHex(variables[item.label].red,variables[item.label].green,variables[item.label].blue), kind: server.CompletionItemKind.Color, data: {t: 'var', i:string.indexOf(':')}}}).concat(definedVars);
    }
    else if((string.indexOf(':') <= textDocumentPosition.position.character && string.indexOf(':')!=-1)|(string.indexOf('=') <= textDocumentPosition.position.character && string.indexOf('=')!=-1)){
        var complColors = [];
        for(var c in NamedColors){
            complColors.push({label: c, data: {t:'color', i: textDocumentPosition}, kind: server.CompletionItemKind.Color, documentation:NamedColors[c]});
        }
        for(var v in colorVariables){
    
            var d = colorToHex(v, textDocumentPosition.position.line).slice(0,7);
            if(d){
                complColors.push({label: v, data: {t:'color', i:textDocumentPosition}, kind: server.CompletionItemKind.Color, documentation:d});
            }
        }
        return complColors;
    }
});

function hex2rgb(hex) {
    if(!hex){
        return null;
    }
    connection.console.log('hex '+hex)
    if (hex.length==7){
            var q = hex.slice(1, 7);
            return {
                red: parseInt(q.slice(0, 2), 16),
                green: parseInt(q.slice(2, 4), 16),
                blue: parseInt(q.slice(4, 6), 16),
                alpha: 255
            }
    }
    else if(hex.length==4){
        var q = hex.slice(1,4);
        return {
            red: parseInt(q.slice(0, 1).repeat(2), 16),
            green: parseInt(q.slice(1, 2).repeat(2), 16),
            blue: parseInt(q.slice(2, 3).repeat(2), 16),
            alpha: 255
        }
    }
    else if(hex.length==5){
        var q = hex.slice(1,5);
        return {
            red: parseInt(q.slice(0, 1).repeat(2), 16),
            green: parseInt(q.slice(1, 2).repeat(2), 16),
            blue: parseInt(q.slice(2, 3).repeat(2), 16),
            alpha: parseInt(q.slice(3, 4).repeat(2), 16)
        }
    }
    else{
        var q = hex.slice(1, 9);
        return {
            red: parseInt(q.slice(0, 2), 16),
            green: parseInt(q.slice(2, 4), 16),
            blue: parseInt(q.slice(4, 6), 16),
            alpha: parseInt(q.slice(6, 8), 16)
        }
    }
}

connection.onRequest(protocol.DocumentColorRequest.type, params => {
    var patt = /(hsl\(\d{1,3},\s*[\d\.]+\%,\s*[\d\.]+\%\)|hsla\(\d{1,3},\s*[\d\.]+\%,\s*[\d\.]+\%,\s*[\d\.]+\%\)|hsla\(\d{1,3},\s*[\d\.]+\%,\s*[\d\.]+\%,\s*[\d\.]+\)|rgb\(\d{1,3},\s*\d{1,3},\s*\d{1,3}\)|rgba\(\d{1,3},\s*\d{1,3},\s*\d{1,3},\s*[\d\.]+\)|rgba\(\d{1,3},\s*\d{1,3},\s*\d{1,3},\s*[\d\.]+\%\)|\$[a-zA-Z0-9-]+|#[0-9a-fA-F]{8}|#[0-9a-fA-F]{6}|#[0-9a-fA-F]{3,4}|saliceblue|antiquewhite|aquamarine|azure|beige|bisque|blanchedalmond|blueviolet|brown|burlywood|cadetblue|chartreuse|chocolate|coral|cornflowerblue|cornsilk|crimson|cyan|darkblue|darkcyan|darkgoldenrod|darkgray|darkgreen|darkgrey|darkkhaki|darkmagenta|darkolivegreen|darkorange|darkorchid|darkred|darksalmon|darkseagreen|darkslateblue|darkslategray|darkslategrey|darkturquoise|darkviolet|deeppink|deepskyblue|dimgray|dimgrey|dodgerblue|firebrick|floralwhite|forestgreen|gainsboro|ghostwhite|gold|goldenrod|greenyellow|grey|honeydew|hotpink|indianred|indigo|ivory|khaki|lavender|lavenderblush|lawngreen|lemonchiffon|lightblue|lightcoral|lightcyan|lightgoldenrodyellow|lightgray|lightgreen|lightgrey|lightpink|lightsalmon|lightseagreen|lightskyblue|lightslategray|lightslategrey|lightsteelblue|lightyellow|limegreen|linen|magenta|mediumaquamarine|mediumblue|mediumorchid|mediumpurple|mediumseagreen|mediumslateblue|mediumspringgreen|mediumturquoise|mediumvioletred|midnightblue|mintcream|mistyrose|moccasin|navajowhite|oldlace|olivedrab|orangered|orchid|palegoldenrod|palegreen|paleturquoise|palevioletred|papayawhip|peachpuff|peru|pink|plum|powderblue|rosybrown|royalblue|saddlebrown|salmon|sandybrown|seagreen|seashell|sienna|skyblue|slateblue|slategray|slategrey|snow|springgreen|steelblue|tan|thistle|tomato|turquoise|violet|wheat|whitesmoke|yellowgreen|aqua|black|blue|fuchsia|gray|green|lime|maroon|navy|olive|orange|purple|red|silver|teal|white|yellow)/g;
	let document = documents.get(params.textDocument.uri);
    let lines = document.getText().split(/\r?\n/g);
    var result = [];
    for(var i in lines){
        var line = lines[i];
        var matches = line.match(patt);
        for(var m in matches){
            var match = matches[m];
            connection.console.log(match);
            var col = hex2rgb(colorToHex(match,Number(i)));
            if(match[0]=='$' && line.indexOf(match)<line.indexOf('=')){
                continue
            }
            if(!col){
                continue;
            }
            result.push({color: col,  range: {start: {line: Number(i), character: line.indexOf(match)}, end: {line: Number(i), character: line.indexOf(match)+match.length}}});
        }
    }
    return result;
});

connection.onRequest(protocol.ColorPresentationRequest.type, params => {
    connection.console.log('Hello');
    let result = [];
    var color = params.color;
    var range = params.range;
    connection.console.log(JSON.stringify(params.range));
    var TextEdit = server.TextEdit; 
    let red256 = Math.round(color.red * 255), green256 = Math.round(color.green * 255), blue256 = Math.round(color.blue * 255);

    let label;
    if (color.alpha === 1) {
        label = `rgb(${red256}, ${green256}, ${blue256})`;
    } else {
        label = `rgba(${red256}, ${green256}, ${blue256}, ${color.alpha.toString().slice(0,4)})`;
    }
    result.push({ label: label, textEdit: TextEdit.replace(range, label) });

    if (color.alpha === 1) {
        label = `#${toTwoDigitHex(red256)}${toTwoDigitHex(green256)}${toTwoDigitHex(blue256)}`;
    } else {
        label = `#${toTwoDigitHex(red256)}${toTwoDigitHex(green256)}${toTwoDigitHex(blue256)}${toTwoDigitHex(Math.round(color.alpha * 255))}`;
    }
    result.push({ label: label, textEdit: TextEdit.replace(range, label) });

    const hsl = hslFromColor(color);
    if (hsl.a === 1) {
        label = `hsl(${hsl.h}, ${Math.round(hsl.s * 100)}%, ${Math.round(hsl.l * 100)}%)`;
    } else {
        label = `hsla(${hsl.h}, ${Math.round(hsl.s * 100)}%, ${Math.round(hsl.l * 100)}%, ${hsl.a})`;
    }
    result.push({ label: label, textEdit: TextEdit.replace(range, label) });
    
    return result;
});

function toTwoDigitHex(n){
	const r = n.toString(16);
	return r.length !== 2 ? '0' + r : r;
}

function hslFromColor(rgba) {
	const r = rgba.red;
	const g = rgba.green;
	const b = rgba.blue;
	const a = rgba.alpha;

	const max = Math.max(r, g, b);
	const min = Math.min(r, g, b);
	let h = 0;
	let s = 0;
	const l = (min + max) / 2;
	const chroma = max - min;

	if (chroma > 0) {
		s = Math.min((l <= 0.5 ? chroma / (2 * l) : chroma / (2 - (2 * l))), 1);

		switch (max) {
			case r: h = (g - b) / chroma + (g < b ? 6 : 0); break;
			case g: h = (b - r) / chroma + 2; break;
			case b: h = (r - g) / chroma + 4; break;
		}

		h *= 60;
		h = Math.round(h);
	}
	return { h, s, l, a };
}


function getWordAt (str, pos) {

    // Perform type conversions.
    str = String(str);
    pos = Number(pos) >>> 0;

    // Search for the word's beginning and end.
    var left = str.slice(0, pos + 1).search(/\S+$/),
        right = str.slice(pos).search(/\s/);

    // The last word in the string is a special case.
    if (right < 0) {
        return str.slice(left);
    }

    // Return the word, using the located bounds to extract it from the string.
    return str.slice(left, right + pos);

}

function getRange(position, type){
    let document = documents.get(position.textDocument.uri);
    let string = document.getText().split(/\r?\n/g)[position.position.line];
    if(type=='color'){
        var qw = getWordAt(string,position.position.character).trim();
        return server.Range.create(server.Position.create(position.position.line, string.lastIndexOf(qw)), position.position)
    }
}
// This handler resolve additional information for the item selected in
// the completion list.
connection.onCompletionResolve(function (item) {
    if(item.data.t=='var'){
        item.detail = 'Link To Glossary';
        item.insertText = item.label+(item.data.i==-1?': ':'');
        return item;
    }
    else if (item.data.t=='color'){
        var i = getRange(item.data.i,item.data.t);
        item.textEdit = server.TextEdit.replace(i,item.label);
        return item;
    }
    else if (item.data.t='cvars'){
        item.insertText = item.label;
        return item;
    }
});

connection.listen();
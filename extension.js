// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
const vscode = require('vscode');
const client = require('vscode-languageclient');
const cll = require('vscode-languageclient/lib/configuration.proposed');
const path = require('path');
const req = require('vscode-languageserver-protocol/lib/protocol.colorProvider.proposed');
// your extension is activated the very first time the command is executed
function activate(context) {

    // Use the console to output diagnostic information (console.log) and errors (console.error)
    // This line of code will only be executed once when your extension is activated
    console.log('Congratulations, your extension "attheme-script" is now active!');
    let serverModule = context.asAbsolutePath(path.join('server', 'server.js'));

    let serverOptions = {
		run : { module: serverModule, transport: client.TransportKind.ipc },
		debug: { module: serverModule, transport: client.TransportKind.ipc }
	}
	
	// Options to control the language client
	let clientOptions = {
		// Register the server for plain text documents
		documentSelector: ['attheme-script']
	}
	
	// Create the language client and start the client.
	let AtthemeClient = new client.LanguageClient('attheme-server', 'Attheme Script Server', serverOptions, clientOptions)
	AtthemeClient.registerFeature(new cll.ConfigurationFeature(AtthemeClient));	
	let disposable = AtthemeClient.start();

	context.subscriptions.push(disposable);
	AtthemeClient.onReady().then(_ => {
		// register color provider
		console.log('Ready');
		context.subscriptions.push(vscode.languages.registerColorProvider(['attheme-script'], {
			provideDocumentColors(document) {
				let params = {
					textDocument: AtthemeClient.code2ProtocolConverter.asTextDocumentIdentifier(document)
				}
				return AtthemeClient.sendRequest(req.DocumentColorRequest.type, params).then(symbols => {
					console.log("HMM");
					return symbols.map(symbol => {
						let range = AtthemeClient.protocol2CodeConverter.asRange(symbol.range);
						console.log(JSON.stringify(range));
						let color = new vscode.Color(symbol.color.red/255, symbol.color.green/255, symbol.color.blue/255, symbol.color.alpha/255);				
						return new vscode.ColorInformation(range, color);	
					});
				});
			},
			provideColorPresentations(color, context) {
				let params = {
					textDocument: AtthemeClient.code2ProtocolConverter.asTextDocumentIdentifier(context.document),
					color,
					range: AtthemeClient.code2ProtocolConverter.asRange(context.range)
				};
				return AtthemeClient.sendRequest(req.ColorPresentationRequest.type, params).then(presentations => {
					return presentations.map(p => {
						let presentation = new vscode.ColorPresentation(p.label);
						presentation.textEdit = p.textEdit && AtthemeClient.protocol2CodeConverter.asTextEdit(p.textEdit);
						presentation.additionalTextEdits = p.additionalTextEdits && AtthemeClient.protocol2CodeConverter.asTextEdits(p.additionalTextEdits);
						return presentation;
					});
				});
			}
		}));
	});

}
exports.activate = activate;
// this method is called when your extension is deactivated
function deactivate() {

}
exports.deactivate = deactivate;


// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import * as vscode from 'vscode';
import { loginReq } from './auth/auth';
import { connectSocket, emitSocket } from './sockets/connection';

import { connectionEmitter } from './sockets/connection';
import { Position, Role, SessionRow } from './types';
import { Socket } from 'socket.io-client';
import e from 'express';

let currentSessionId : string | undefined ;

export function activate(context: vscode.ExtensionContext) {
	console.log("ACTIVATE CALLED");
	console.log('Congratulations, your extension "intervue" is now active!');
	
	connectionEmitter.on("auth_failed",(err)=>{
		vscode.window.showErrorMessage(err);
	})
	connectionEmitter.on("connected", ()=>{
		vscode.window.showInformationMessage("Connected to socket");
	})
	connectionEmitter.on("disconnected", ()=>{
		vscode.window.showInformationMessage("disconnected");
	})
	
	//decoreation representing remote cursor
	const remoteCursorDecoration_guest = vscode.window.createTextEditorDecorationType({
		before : {
			contentText : '|',
			color : "yellow"
		}
	})
	const remoteCursorDecoration_interviewer = vscode.window.createTextEditorDecorationType({
		before : {
			contentText : '|',
			color : "red"
		}
	})
	
	const disposable = vscode.commands.registerCommand('intervue.helloWorld', () => {
		// The code you place here will be executed every time your command is executed
		// Display a message box to the user
		vscode.window.showInformationMessage('Hello World from intervue!');
	});
	
	async function socketListener(socket : Socket){
		if(!socket) return;

		socket.on("code_updated",(data)=>{
			//data has content, posn and language
			//get the editor active and replace whole doc with content

			const editor = vscode.window.activeTextEditor;
			if(editor && data){
				const fullRange = new vscode.Range(
					editor.document.positionAt(0),
					editor.document.positionAt(editor.document.getText().length)
				);

				editor.edit(editBuilder =>{
					editBuilder.replace(fullRange , data.content);
				})
			}
		})
				socket.on("cursor_updated",(data : {role : Role, line : number, character : number})=>{
					if(!data){
						socket.emit("error", "No position");
						return;
					}
					//here you receive and render
					const line = data.line;
					const character = data.character;

					//now create a range of 1 point, that will be the cursor then decoration will render a cursor
					const editor = vscode.window.activeTextEditor;
					if(!editor) return;
					
					const position = new vscode.Position(line,character);
					const range = new vscode.Range(position,position); //0 range 
					
					//set
					if(data.role == Role.GUEST){
						editor.setDecorations(remoteCursorDecoration_guest, [range]);
					}else{
						editor.setDecorations(remoteCursorDecoration_interviewer, [range]);
					}
					vscode.window.showInformationMessage("cursor moved");
				})

	}
	
	const codeChanged = vscode.workspace.onDidChangeTextDocument((e :vscode.TextDocumentChangeEvent)=>{ //event emitted when any changes happen

		if(!currentSessionId){
			return;
		}
		const editor = vscode.window.activeTextEditor;
		const position = editor?.selection.active;
		//gives pos.line and pos.char
		const content  = e.document.getText();
		const payload = {
			content,
			cursorPosition : {
				line : position?.line,
				character : position?.character
			},
			language : e.document.languageId
		}
		vscode.window.showInformationMessage("code change emitted");
			emitSocket("code_change", currentSessionId, payload);
	})


	const guestLoginDisposable = vscode.commands.registerCommand('intervue.guestLogin', async()=>{
		const sessionId : string | undefined = await vscode.window.showInputBox({
			"placeHolder" : "Enter SessionId",
			"prompt" : "please provide correct sessionId"
		});

		//no login req -> guest
		const socket = await connectSocket(context, Role.GUEST);
		socketListener(socket);
		//emit join session 
		if(socket && sessionId){
			currentSessionId = sessionId;
			socket.emit("join_session",sessionId);
		}
	})

	
	const InterviewerloginDisposable = vscode.commands.registerCommand('intervue.interviewerLogin',async ()=>{
		const email : string | undefined = await vscode.window.showInputBox({
			"placeHolder" : "Enter email",
			"prompt" : "please provide input",
			validateInput: (text) => {
				if (!text.trim()) {
					return "Email cannot be empty.";
				}
				const parts = text.split("@");
				if (parts.length !== 2) {
					return "Email must contain exactly one '@'.";
				} 
				if (!parts[0]) {
					return "Email must have text before '@'.";
				}
				if (!parts[1].includes(".")) {
					return "Invalid email domain.";
				}
				return undefined; // Valid input
			}
		});

		const password : string | undefined = await vscode.window.showInputBox({
			"placeHolder" : "Enter password",
			"password" : true, //not shown
			"prompt" : "please provide input"
		}) 
		

		if(email === undefined || password === undefined){
			vscode.window.showErrorMessage("Invalid credentials");
			return;
		}
		try{
			//connection emitters receive once so lives in activate not register
			await loginReq(email, password,context); //calls the auth.ts
			//interviewer side so role
			const socket = await connectSocket(context, Role.INTERVIEWER);
			socketListener(socket);
			//emit create session and get the sesion id connectsocket return socketid
			if(socket){
				socket.emit("create_session");
				socket.on("session_created" , (resultRow0 : SessionRow) =>{
					const sessionId : string = resultRow0.id;
					if(sessionId){
						currentSessionId = sessionId;
						vscode.window.showInformationMessage(`Session created: ${sessionId}`);
					}
					
				});
			}


		}catch(err){
			if(err instanceof Error){
				vscode.window.showErrorMessage(err.message);
			}
		}
	})


	// 2 cursors 1 local and 1 rendered and wehenver cursor move you emit to server and if remote change you listen to the event and render using the editor selection event
	const cursorTracking = vscode.window.onDidChangeTextEditorSelection((e) =>{
		//e is the event 
		// 2 cursor local and render remote cursor
		//here only get local position and emit 
		//to render remote one you listen in socket listener and make decoration
		console.log("cursor tracking fired", currentSessionId);
		if(!currentSessionId){
			return;
		}

		const position : Position = e.selections[0].active;
		const payload = position;
		// console.log(position); 
		emitSocket("cursor_move",currentSessionId, payload);

	})

	context.subscriptions.push(disposable,InterviewerloginDisposable, guestLoginDisposable, codeChanged, cursorTracking);
}


// This method is called when your extension is deactivated
export function deactivate() {}



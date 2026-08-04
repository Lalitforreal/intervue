// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import * as vscode from 'vscode';
import { loginReq } from './auth/auth';
import { error } from 'console';
import { connectSocket } from './sockets/connection';

import { connectionEmitter } from './sockets/connection';
import { Role } from './types';


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

	const disposable = vscode.commands.registerCommand('intervue.helloWorld', () => {
		// The code you place here will be executed every time your command is executed
		// Display a message box to the user
		vscode.window.showInformationMessage('Hello World from intervue!');
	});

	const guestLoginDisposable = vscode.commands.registerCommand('intervue.guestLogin', async()=>{
		const sessionId : string | undefined = await vscode.window.showInputBox({
			"placeHolder" : "Enter SessionId",
			"prompt" : "please provide correct sessionId"
		});
		const socket = await connectSocket(context, Role.GUEST);
		//emit join session 
		if(socket && sessionId){
			socket?.emit("join_session",sessionId);
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
			await connectSocket(context, Role.INTERVIEWER);

		}catch(err){
			if(err instanceof Error){
				vscode.window.showErrorMessage(err.message);
			}
		}
	})

	context.subscriptions.push(disposable,InterviewerloginDisposable, guestLoginDisposable);
}

// This method is called when your extension is deactivated
export function deactivate() {}

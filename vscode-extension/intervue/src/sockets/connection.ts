//client socket
import { ExtensionContext } from "vscode";
import {io, Socket} from "socket.io-client";
import { EventEmitter } from "events";
export const connectionEmitter = new EventEmitter();
//can emit or listen
import { Role } from "../types";

export let socket  : Socket | undefined;

export async function connectSocket(context : ExtensionContext, role : Role) {
    //if token exist connect as guest 
    //if not connect as guest

    //prevent duplicate connection 
    if (socket?.connected) {
        return socket;
    }
    let token = await context.secrets.get("token");
        if(!token || token === undefined){
            //connect as guest using role only
            socket = io("http://localhost:3000", {auth : { 
                role 
            }});
        }else{
            //token stored here so can use in socket auth
            socket = io("http://localhost:3000", {auth : {
                token : token,
                role 
            }});
        }
        
        
        const s = socket; //local so safe types 
        
        s.on("connect", () => {
            connectionEmitter.emit("connected");
        });
        
        s.on("connect_error", (err) => {
            if (err.message === "unauthorized") {
                s.disconnect();
                connectionEmitter.emit("auth_failed", err.message);
            }
            // otherwise network issue, let Socket.IO retry
        });
        
        s.on("disconnect",()=>{
            connectionEmitter.emit("disconnected");
        });


        return socket; //for use in extension
}

export function emitSocket(event :string , ...args : any[]){
    socket?.emit(event, ...args); //args can be anything extra that the event needs
}





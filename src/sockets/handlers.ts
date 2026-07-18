
import type { Server } from "socket.io";
import { type ClientToServerEvents, type ServerToClientEvents, type InterServerEvents, type SocketData, Role } from "../types/socket.js";
import { SessionManager } from "../session/SessionManager.js";
import crypto from "crypto";
import { SessionStatus, type Session } from "../types/session.js";

export function registerSocketHandlers(io : Server< ClientToServerEvents,ServerToClientEvents,InterServerEvents,SocketData >,sessionManager : SessionManager){
    console.log("io-socket-connected");
    io.on("connection", (socket)=>{
        socket.on("create_session", ()=>{
            const interviewerId = crypto.randomUUID();
            const session = sessionManager.createSession(interviewerId);
            socket.join(session.id); //joined room
            //attach data to socket obj
            socket.data.role = Role.INTERVIEWER;
            socket.data.sessionId = session.id;
            socket.data.userId = interviewerId;

            //when done
            socket.emit("session_created",session);
        });
        
        socket.on("join_session", (sessionId : string) =>{

            if(!sessionId){
                console.log("invalid session id");
                return;
            }
            const session : Session | undefined = sessionManager.getSession(sessionId);
            if(session === undefined || !session){
                socket.emit("error", "Session not found");
                return;
            }
            socket.join(session?.id);
            //attach the socket.dat
            const guestId = socket.id;
            
            socket.data.role = Role.GUEST;
            socket.data.sessionId = session.id;
            socket.data.userId = guestId; //guest 
            
            //also update session 
            sessionManager.updateSession(session.id, {
                guestId : socket.data.userId,
                status : SessionStatus.ONGOING,
                startedAt : new Date()
            });
            //socket.emit -> to everyone but sender
            //io.emit -> everyone with sender
            io.to(session.id).emit("session_joined", session);
        });

        socket.on("code_change", (sessionId : string, data)=>{

            if(sessionId !== socket.data.sessionId ){
                socket.emit("error","Invalid sessionId @code_change");
                return;
            }
            socket.to(sessionId).emit("code_updated",data);
        });

        socket.on("cursor_move",(sessionId : string, data)=>{

            if(sessionId !== socket.data.sessionId ){
                socket.emit("error","Invalid sessionId @cursor_move");
                return;
            }
            socket.to(sessionId).emit("cursor_updated",data);
        });
    })
}
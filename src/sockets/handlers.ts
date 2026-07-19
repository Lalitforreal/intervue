
import type { Server } from "socket.io";
import { type ClientToServerEvents, type ServerToClientEvents, type InterServerEvents, type SocketData, Role } from "../types/socket.js";
import { SessionManager } from "../session/SessionManager.js";
import crypto from "crypto";
import { SessionStatus, type Session } from "../types/session.js";
import { requireRole } from "../middleware/roleGuard.js";

export function registerSocketHandlers(io : Server< ClientToServerEvents,ServerToClientEvents,InterServerEvents,SocketData >,sessionManager : SessionManager){
    console.log("io-socket-connected");
    io.on("connection", (socket)=>{
        socket.on("create_session", ()=>{
            //role guard
            if (!requireRole(socket, Role.INTERVIEWER)) {
                socket.emit("error", "Unauthorized");
                return;
            }            
            const session = sessionManager.createSession(socket.data.userId); //interviewerId
            socket.join(session.id); //joined room
            //role and user-id assigned by middleware
            //attach sessionId to socket obj
            socket.data.sessionId = session.id;
            
            //when done
            socket.emit("session_created",session);
        });
        
        socket.on("join_session", (sessionId : string) =>{
            if (!requireRole(socket, Role.GUEST)) {
                socket.emit("error", "Unauthorized");
                return;
            }
            if(!sessionId){
                socket.emit("error", "Invalid session ID");
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
            
            //role set by middleware already

            socket.data.sessionId = session.id; //
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
            //no role guard both allowed
            if(sessionId !== socket.data.sessionId ){
                socket.emit("error","Invalid sessionId @code_change");
                return;
            }
            socket.to(sessionId).emit("code_updated",data);
        });

        socket.on("cursor_move",(sessionId : string, data)=>{
            //no role guard both allowed
            if(sessionId !== socket.data.sessionId ){
                socket.emit("error","Invalid sessionId @cursor_move");
                return;
            }
            socket.to(sessionId).emit("cursor_updated",data);
        });
    })
}
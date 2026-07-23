//interviewer and guests both connect to the same socket-server
//server diff tehm by socket.data.role

import type {Session} from "../types/session.js";
import type { SessionRow } from "./db.js";

export interface ClientToServerEvents{
    "create_session" : ()=> void;
    "join_session" : (sessionId : string)=> void;
    "code_change" : (sessionId : string, data:{
        content : string;
        cursorPosition : { line : number, character : number};
        language : string
    })=>void;

    "cursor_move" : (sessionId : string, data : {
        line : number,
        character : number
    })=>void;
};

//client needs stuff back
export interface ServerToClientEvents{
    "session_created" : (session : SessionRow)=>void;
    "session_joined" : (session : SessionRow)=>void;
    "code_updated" : (data:{
        content: string;
        cursorPosition: {line : number, character : number};
        language: string 
    })=> void;
    "cursor_updated" : (data: { line: number; character: number })=>void;
    "error" : (message : string) => void;
};

export interface InterServerEvents{};
export interface SocketData{
    sessionId : string | null; //of the current session 
    role : Role,
    userId : string; 
}

export enum Role{ //changed to string for pg
    INTERVIEWER = 'INTERVIEWER',
    GUEST = 'GUEST'
}
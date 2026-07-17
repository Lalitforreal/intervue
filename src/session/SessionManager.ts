// SessionManager class creates the Map only once when called in server js and contains all 
//the functions needed like add session remove session, update session etc etc
//this is teh replacement of a DB for us now

import type {Session} from "../types/session.js"
import {SessionStatus} from "../types/session.js";
import crypto from "node:crypto"
export class SessionManager{
private sessions : Map<string, Session>

    constructor(){
        this.sessions = new Map();
    }

    createSession(userId : string) : Session {
        const session : Session = {
            id : crypto.randomUUID(),
            interviewerId : userId,
            guestId : null, //can be changed later
            status : SessionStatus.PRE_START,
            createdAt : new Date(),
            startedAt : null,
            endedAt : null,
            endedReason : null
        }

        this.sessions.set(session.id, session); //add to map
        return session;
    }

    getSession(sessionId : string) : Session | undefined {

        const session = this.sessions.get(sessionId);
        if(!session) console.log("getSession : not found");
        return session;
    }

    updateSession(sessionId : string, updates : Partial<Session>) : Session | undefined {
        const toUpdate : Session | undefined = this.sessions.get(sessionId);
        if(!toUpdate){
            console.log("not found") ;
            return undefined;
        }else{
            const updated : Session = {...toUpdate, ...updates};
            if(!toUpdate){
                console.log("session not found")
            }
            this.sessions.set(sessionId, updated);
            return updated;

        }
    }
}
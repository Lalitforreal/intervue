
import type {  Server } from "socket.io";
import { type ClientToServerEvents, type ServerToClientEvents, type InterServerEvents, type SocketData, Role, DisconnectedReason } from "../types/socket.js";
import { SessionManager } from "../session/SessionManager.js";
import crypto, { type UUID } from "crypto";
import {  EndedReason, SessionStatus } from "../types/session.js";
import { requireRole } from "../middleware/roleGuard.js";
import pool from "../config/db.js";
import type { SessionRow } from "../types/db.js";

import { persistEvent } from "../utils/persisitEvent.js";

export function registerSocketHandlers(io : Server< ClientToServerEvents,ServerToClientEvents,InterServerEvents,SocketData >,sessionManager : SessionManager){
    console.log("io-socket-connected");
    const disconnectedGuests = new Set<string>(); //for .on(disconnect) -> if set empty guest is there
    io.on("connection", (socket)=>{
        socket.on("create_session", async ()=>{
            //role guard
            if (!requireRole(socket, Role.INTERVIEWER)) {
                socket.emit("error", "Unauthorized");
                return;
            }
            //transaction for tables
            const client = await pool.connect();
            try{
                await client.query('BEGIN');
                //write all queries

                //add session to table session
                //add row of event to event table
                //generic for each row - tells what results.rows[0] will have
                const result = await client.query<SessionRow>('INSERT INTO sessions(interviewer_id, status) VALUES ($1,$2) RETURNING *',
                    [socket.data.userId, SessionStatus.PRE_START]
                );
    
                //you can do this to get session id but RETURNING id works;
                // const sessionId = await pool.query(`SELECT id FROM sessions WHERE (interviewer_id = ${socket.data.userId} )`);
                if(!result.rows[0]){
                    await client.query('ROLLBACK');
                    socket.emit("error", 'failed to create session');
                    return;
                }

                const sessionId = result.rows[0].id;
                const payload  =  {}; //for session created - empty.

                //util - src/utils/persistEvent
                await persistEvent(sessionId,client,'SESSION_CREATED',socket.data.userId as UUID, socket.data.role, payload);

                await client.query('COMMIT');
                //afer commit

                socket.join(sessionId); //joined room
                //role and user-id assigned by middleware
                //attach sessionId to socket obj
                socket.data.sessionId = sessionId;

                //when done after transaction then only emit
                socket.emit("session_created",result.rows[0]);

            }catch(err){
                console.log(err);
                await client.query('ROLLBACK');
                socket.emit("error", "client pool connection failed");
            }finally{
                client.release();
            }
        });
        
        socket.on("join_session", async(sessionId : string) =>{
            if (!requireRole(socket, Role.GUEST)) {
                socket.emit("error", "Unauthorized");
                return;
            }
            if(!sessionId){
                socket.emit("error", "Invalid session ID");
                return;
            }
            //also update session 
            const client = await pool.connect();
            try{

                await client.query('BEGIN');
                //FOR UPDATE locks the row so you can safely calculate next seq and avoid race condn - only valid inside a transaction
                const result = await client.query<SessionRow>('SELECT * FROM sessions WHERE id=$1 FOR UPDATE', [sessionId]);
                const sessionRow = result.rows[0];
                if(!sessionRow){
                    await client.query('ROLLBACK');
                    socket.emit("error", "Session not found");
                    return;
                }

                const guestId = socket.data.userId;
                const updatedResult = await client.query('UPDATE sessions SET guest_id = $1,status = $2, started_at = NOW() WHERE id = $3 RETURNING *',
                     [guestId, SessionStatus.ONGOING,sessionRow.id]);
                const updatedRow = updatedResult.rows[0];
                
                // events table

                const payload = {guestId : guestId};
                await persistEvent(sessionId,client,'SESSION_JOINED',socket.data.userId as UUID, socket.data.role,payload);
                
                await client.query('COMMIT');

                socket.join(sessionRow.id);
                //role set by middleware already
                socket.data.sessionId = updatedRow.id;
                io.to(updatedRow.id).emit("session_joined", updatedRow);
            }catch(err){
                await client.query('ROLLBACK');
                socket.emit("error", "update issue");
            }finally{
                client.release();
            }
        });

        // Socket event arrives with session_id and payload
        // Server verifies session_id against socket.data
        // Extract event type and actor info
        // Assign sequence_number (SELECT MAX + 1 FOR UPDATE in a transaction)
        // Write to events table
        // Broadcast to room

        socket.on("code_change", async (sessionId : string, data)=>{
            //no role guard both allowed
            if(sessionId !== socket.data.sessionId ){
                socket.emit("error","Invalid sessionId @code_change");
                return;
            }
            const client = await pool.connect();
            try{
                await client.query('BEGIN');

                const payload = data;
                await persistEvent(sessionId,client,'CODE_CHANGED',socket.data.userId as UUID, socket.data.role,payload);

                await client.query('COMMIT');
                socket.to(sessionId).emit("code_updated",data);

            }catch(err){
                await client.query('ROLLBACK');
                socket.emit("error","client err");
            }finally{
                client.release();
            }
        });

        socket.on("cursor_move",async (sessionId : string, data)=>{
            //no role guard both allowed
            if(sessionId !== socket.data.sessionId ){
                socket.emit("error","Invalid sessionId @cursor_move");
                return;
            }
            const client = await pool.connect();
            try{
                await client.query('BEGIN');
                
                const payload = data;
                await persistEvent(sessionId,client,'CURSOR_MOVED',socket.data.userId as UUID, socket.data.role,payload);

                await client.query('COMMIT');
                socket.to(sessionId).emit("cursor_updated",data);

            }catch(err){
                await client.query('ROLLBACK');
                socket.emit("error","client err");
            }finally{
                client.release();
            }
        });

        //grace period settimeout(
        // check if session still on hold, if yes end session perissit session abandoned evnet notify the guest
        // ,30000)

        //for guest cehck fi sesison has guestId or not
        socket.on("disconnect", async ()=>{
            const sessionId : string | null = socket.data.sessionId;
            if(!sessionId) return;
            const role : Role = socket.data.role;

            if(role === Role.INTERVIEWER){
                const client = await pool.connect();
                try{
                    await client.query('BEGIN');
                    
                    // update sesssion status to be on hold
                    await client.query('UPDATE sessions SET status = $1 WHERE id = $2', 
                        [SessionStatus.ON_HOLD, sessionId]
                    );
                    //persisit
                    const payload = {};
                    await persistEvent(sessionId, client, 'INTERVIEWER_DISCONNECTED',null,Role.SYSTEM, payload);
                    await client.query('COMMIT');

                    //grace period starts
                    setTimeout(async ()=>{
                        //check if session status is still on hold
                        const result = await pool.query('SELECT status FROM sessions WHERE id = $1',[sessionId]);
                        const sessionStatus = result.rows[0]?.status as SessionStatus;
                        if(sessionStatus === SessionStatus.ON_HOLD){
                            //end session - new transaction
                            const client2 = await pool.connect();
                            try{
                                await client2.query('BEGIN');
                                //update session status and ended_reason
                                await client2.query('UPDATE sessions SET status = $1 ,ended_reason = $2 WHERE id = $3',
                                    [SessionStatus.ENDED,EndedReason.ABANDONED,sessionId]
                                );
                                const payload = {};
                                await persistEvent(sessionId,client2, 'SESSION_ABANDONED',null, Role.SYSTEM,payload );

                                await client2.query('COMMIT');
                                io.to(sessionId).emit('session_ended', EndedReason.ABANDONED);
                            }catch(err){
                                await client2.query('ROLLBACK');
                                socket.emit("error", "client2 error");
                            }finally{
                                client2.release();
                            }
                        }
                    },30000)
                }catch(err){
                    await client.query('ROLLBACK');
                    socket.emit("error","client error");
                }finally{
                    client.release();
                }
            }

            if(role === Role.GUEST){
                const client3 = await pool.connect();
                try{
                    await client3.query('BEGIN');
                    const payload = {};
                    await persistEvent(sessionId,client3,'GUEST_DISCONNECTED',null, Role.SYSTEM,payload);
                    
                    await client3.query('COMMIT');
                    disconnectedGuests.add(socket.data.userId);
                                        //grace period starts
                    setTimeout(async ()=>{
                        //check if session status is still on hold

                        if(disconnectedGuests.has(socket.data.userId)){
                            //end session - new transaction
                            const client2 = await pool.connect();
                            try{
                                await client2.query('BEGIN');
                                //update session status and ended_reason
                                await client2.query('UPDATE sessions SET status = $1 ,ended_reason = $2 WHERE id = $3',
                                    [SessionStatus.ENDED,EndedReason.ABANDONED,sessionId]
                                );
                                const payload = {};
                                await persistEvent(sessionId,client2, 'SESSION_ABANDONED',null, Role.SYSTEM,payload );

                                await client2.query('COMMIT');
                                io.to(sessionId).emit('session_ended', EndedReason.ABANDONED);
                            }catch(err){
                                await client2.query('ROLLBACK');
                                socket.emit("error", "client2 error");
                            }finally{
                                client2.release();
                            }
                        }else{
                            //guest reconnected within grace period
                        }
                    },30000)
                }catch(err){
                    await client3.query('ROLLBACK');
                }finally{
                    client3.release();
                }
            }
        })



        //reconnect - 
        //interviewer -> status onhold so join and change status
        //if guest - you send missed events adn remove from disconnectedguest set

        socket.on("reconnect_session", async (sessionId : string, lastSeqNumber : number)=>{
            if(socket.data.role === Role.INTERVIEWER){
                const client = await pool.connect();
                try{
                    await client.query('BEGIN');
                    const result = await client.query('SELECT status FROM sessions WHERE id = $1 AND interviewer_id = $2',
                        [sessionId, socket.data.userId]); //recheck if valid session as you're trusting the params

                    if(!result.rows[0]){
                        socket.emit("error","wrong sessionId or not valid interviewer");
                        return;
                    }

                    const status = result.rows[0]?.status as SessionStatus;
                    socket.data.sessionId = sessionId;
                    if(status === SessionStatus.ON_HOLD){
                        //rejoin
                        await client.query('UPDATE sessions SET status = $1 WHERE id = $2',
                            [SessionStatus.ONGOING, sessionId]
                        );
                        const payload = {};
                        await persistEvent(sessionId, client, 'INTERVIEWER_RECONNECTED',null, Role.SYSTEM,payload);
                        //now get the events using query
                        const missedEvents = await client.query('SELECT * FROM events WHERE sequence_number > $1 AND session_id = $2 ORDER BY sequence_number ASC',
                            [lastSeqNumber, sessionId]
                        );

                        
                        //latest
                        const currentState =await client.query('SELECT * FROM events WHERE sequence_number = (SELECT MAX(sequence_number) FROM events WHERE event_type = $1 AND session_id = $2) AND session_id = $2',
                            ['CODE_CHANGED', sessionId]
                        );
                        await client.query('COMMIT');

                        socket.join(sessionId); //join before emit
                        socket.emit("events_missed", missedEvents.rows); //send the array of missed events
                        if(currentState.rows[0]){
                            socket.emit('current_state', currentState.rows[0]);
                        }

                    }
                    if(status === SessionStatus.ENDED){
                        socket.emit("error","session ended already can't reconnect");
                    }
                }catch(err){
                    await client.query('ROLLBACK');
                    socket.emit('error',"client error reconnecting");
                }finally{
                    client.release();
                }

            }else{
                //guest
                const client = await pool.connect();
                try{
                    await client.query('BEGIN');
                    const result = await client.query('SELECT status FROM sessions WHERE id = $1 AND guest_id = $2',
                        [sessionId, socket.data.userId]
                    )
                    const status = result.rows[0]?.status as SessionStatus;
                    if(status === SessionStatus.ENDED){
                        socket.emit("error","grace period over");
                        return;
                    }
                    if(status === SessionStatus.ONGOING && disconnectedGuests.has(socket.data.userId)){
                        const payload = {};
                        await persistEvent(sessionId, client, 'GUEST_RECONNECTED',null, Role.SYSTEM,payload);
                        //now get the events using query
                        const missedEvents = await client.query('SELECT * FROM events WHERE sequence_number > $1 AND session_id = $2 ORDER BY sequence_number ASC',
                            [lastSeqNumber, sessionId]
                        );

                        
                        //latest
                        const currentState =await client.query('SELECT * FROM events WHERE sequence_number = (SELECT MAX(sequence_number) FROM events WHERE event_type = $1 AND session_id = $2) AND session_id = $2',
                            ['CODE_CHANGED', sessionId]
                        );
                        await client.query('COMMIT');
                        disconnectedGuests.delete(socket.data.userId);

                        socket.join(sessionId);

                        socket.emit("events_missed", missedEvents.rows); //send the array of missed events
                        if(currentState.rows[0]){
                            socket.emit('current_state', currentState.rows[0]);
                        }

                        socket.data.sessionId = sessionId;
                    }


                }catch(err){
                    await client.query('ROLLBACK');
                    socket.emit("error", 'invalid client info');
                }finally{
                    client.release();
                }
            }
        });

    })
}
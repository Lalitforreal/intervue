
import type { Server } from "socket.io";
import { type ClientToServerEvents, type ServerToClientEvents, type InterServerEvents, type SocketData, Role } from "../types/socket.js";
import { SessionManager } from "../session/SessionManager.js";
import crypto from "crypto";
import { SessionStatus, type Session } from "../types/session.js";
import { requireRole } from "../middleware/roleGuard.js";
import pool from "../config/db.js";
import type { SessionRow } from "../types/db.js";

export function registerSocketHandlers(io : Server< ClientToServerEvents,ServerToClientEvents,InterServerEvents,SocketData >,sessionManager : SessionManager){
    console.log("io-socket-connected");

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
                const seqResult = await client.query('SELECT COALESCE(MAX(sequence_number),0) + 1 AS next_seq FROM events WHERE session_id = $1',[sessionId]);
                const seqNumber = seqResult.rows[0].next_seq;
                
                await client.query('INSERT INTO events(session_id, sequence_number,event_type,actor_id,actor_role) VALUES ($1,$2,$3,$4,$5)',
                    [sessionId, seqNumber,'SESSION_CREATED', socket.data.userId, socket.data.role]
                );
                
                await client.query('COMMIT');
                //afer commit

                socket.join(sessionId); //joined room
                //role and user-id assigned by middleware
                //attach sessionId to socket obj
                socket.data.sessionId = sessionId;

                //when done after transaction then only emit
                socket.emit("session_created",result.rows[0]);

            }catch(err){
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
                const seqResult = await client.query('SELECT COALESCE(MAX(sequence_number),0) + 1 AS next_seq FROM events WHERE session_id = $1',[sessionId]);
                const seqNumber = seqResult.rows[0].next_seq;
                
                await client.query('INSERT INTO events(session_id, sequence_number,event_type,actor_id,actor_role) VALUES ($1,$2,$3,$4,$5)',
                    [sessionId, seqNumber,'SESSION_JOINED', guestId , socket.data.role]
                );
                
                await client.query('COMMIT');

                socket.join(sessionRow.id);
                //role set by middleware already
                socket.data.sessionId = updatedRow.id;
                io.to(updatedRow.id).emit("session_joined", updatedRow);
            }catch(err){
                socket.emit("error", "update issue");
                await client.query('ROLLBACK');
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
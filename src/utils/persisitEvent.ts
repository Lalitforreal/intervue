import type { UUID } from "node:crypto";
import type { PoolClient } from "pg";
import type { Role } from "../types/socket.js";


export async function persistEvent(sessionId : string, client : PoolClient, eventType : string, actor_id : UUID | null ,actor_role : Role, payload : Object){

    const seqResult = await client.query('SELECT COALESCE(MAX(sequence_number),0) + 1 AS next_seq FROM events WHERE session_id = $1',[sessionId]);
    const seqNumber = seqResult.rows[0].next_seq;
    
    await client.query('INSERT INTO events(session_id, sequence_number,event_type,actor_id,actor_role, payload) VALUES ($1,$2,$3,$4,$5,$6)',
        [sessionId, seqNumber,eventType, actor_id, actor_role,payload]
    );
}
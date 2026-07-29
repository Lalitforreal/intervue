//pure function 

import type { Pool } from "pg"


export type payload = {
    code : string,
    cursor : {
        interviewer : {line : number, char : number},
        guest : {line : number, char : number}
    },
    language : string,
    problem :{
        title: string
        description: string
        constraints: string
        examples: string 
    }
}
//return promise as session might not have any CODE_CHANGED events yet
export async function replayFunc(sessionId : string, sequenceN : number, pool : Pool) : Promise<Partial<payload>>{
    try{
        const results = await pool.query('SELECT DISTINCT ON (event_type) * FROM events WHERE session_id = $1 AND sequence_number <= $2 AND event_type = ANY($3) ORDER BY event_type, sequence_number DESC ',
            [sessionId, sequenceN, ['CODE_CHANGED', 'CURSOR_MOVED', 'LANGUAGE_CHANGED', 'PROBLEM_SET']]
        );
        const resultArr = results.rows; //arr of obj
    
        let state : Partial<payload> = {}; // to update partially 
    
        // elem is obj -> { event_type: 'CODE_CHANGED', payload: { content: '...' }, sequence_number: 5, ... }
        resultArr.forEach((element)=>{
            if(element.event_type === 'CODE_CHANGED'){
                state.code = element.payload.content;
            }else if(element.event_type === 'CURSOR_MOVED'){
                state.cursor = element.payload;
            }else if(element.event_type === 'PROBLEM_SET'){
                state.problem = element.payload;
            }else if(element.event_type === 'LANGUAGE_CHANGED'){
                state.language = element.payload.to; //if language change just 
            }
        });
    
        return state;

    }catch(err){
        throw err;
    }
}
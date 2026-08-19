export enum Role{
    "INTERVIEWER" ,
    "GUEST" 
}
export enum SessionStatus {
    PRE_START = 'PRE_START',
    ONGOING = 'ONGOING',
    ON_HOLD = 'ON_HOLD',
    ENDED = 'ENDED'
}

export enum EndedReason {
    NORMAL,
    ABANDONED,
    EXPIRED
}

export interface SessionRow{
    id : string;
    interviewer_id : string;
    guest_id : string | null;
    status : SessionStatus;
    created_at : Date;
    started_at : Date | null;
    ended_at : Date | null;
    ended_reason : EndedReason | null;
}

export interface Position{
    line : number,
    character : number
}
//stores interfaces and enums for out SessionManager

export interface Session {
    id : string;
    interviewerId : string;
    guestId : string | null ; //for PRE_START state
    status : SessionStatus;
    createdAt : Date;
    startedAt : Date | null;
    endedAt : Date | null;
    endedReason : EndedReason | null // can be null cause PRE_START and ONGOING has no endedreason.
}

export enum SessionStatus {
    PRE_START,
    ONGOING,
    ON_HOLD,
    ENDED
}

export enum EndedReason {
    NORMAL,
    ABANDONED,
    EXPIRED
}
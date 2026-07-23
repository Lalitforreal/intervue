
import type { EndedReason, SessionStatus } from "./session.js";

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
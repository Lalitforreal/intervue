import { SessionManager } from "../session/SessionManager.js";
import { SessionStatus } from "../types/session.js";

const sessionManager = new SessionManager();
//created map using constructor

//test-1
const sessionT1 = sessionManager.createSession("user-123");
console.assert(sessionT1.status === SessionStatus.PRE_START, "FAIL : status should be PRE_START "); // assert(condition, message if it fails)
console.log("test-1 passes");

//test-2
const sessionT2 = sessionManager.createSession("user-1234");
console.assert(sessionT2.guestId === null, "FAIL : guestId should be null "); // assert(condition, message if it fails)
console.log("test-2 passes");

//test-3
console.assert(sessionManager.getSession(sessionT2.id) === sessionT2 , "FAIL : session wasnt created "); // assert(condition, message if it fails)
console.log("test-3 passes");

//test-4
console.assert(sessionManager.getSession("dfksjlkdfj") === undefined , "FAIL : wrong session id but still not returning undefined"); // assert(condition, message if it fails)
console.log("test-4 passes");

//test-5 
const updated = sessionManager.updateSession(sessionT1.id,{guestId : "22ccId"});
console.assert(updated?.guestId === "22ccId", "FAIL : not updated properly");
console.log("test-5 passes");
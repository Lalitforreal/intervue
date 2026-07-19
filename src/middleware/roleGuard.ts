import { Socket } from "socket.io";
import type { Role } from "../types/socket.js";

export function requireRole(socket : Socket, role : Role): boolean {
    if(socket.data.role !== role){
        return false;
    }
    return true;
}
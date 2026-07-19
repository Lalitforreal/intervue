import cookie from "cookie"; 
import jwt from "jsonwebtoken";

import type { ExtendedError, Socket } from "socket.io";
import type { Role } from "../types/socket.js";

interface User{
    role : Role,
    userId : string
};

export function socketAuth(socket : Socket, next : (err?: ExtendedError)=> void){
    try{
        const headerCookie : string | undefined = socket.handshake.headers.cookie;
        if(!headerCookie || headerCookie == undefined){
            throw new Error("unauth @headerCookie");
            return;
        }
        
        const cookies = cookie.parse(headerCookie);
        const token = cookies.token as string;
        const decoded : User  = jwt.verify(token, process.env.JWT_KEY as string) as User ;
        //jwt either returns or throws and catch handles it
        socket.data.role = decoded.role;
        socket.data.userId = decoded.userId;
        socket.data.sessionId = null;

        next();
    }catch(err){
        next(new Error("unauth"));
    }
};
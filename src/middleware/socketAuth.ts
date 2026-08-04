
import jwt, { type JwtPayload } from "jsonwebtoken";

import type { ExtendedError, Socket } from "socket.io";
import { Role } from "../types/socket.js";


//do everythign in handshake


interface UserPayload extends JwtPayload{
    userId : string,
    role : Role
}
export function socketAuth(socket : Socket, next : (err?: ExtendedError)=> void){
    try{
        let token : string | undefined;
        token = socket.handshake.auth.token;
        if(!token && socket.handshake.auth.role == Role.GUEST){
            //assign as guest
            //create guest id
            const guestId : string = crypto.randomUUID(); 
            socket.data.userId = guestId;
            socket.data.role = Role.GUEST;
            next();
            return;

        }else{
            //token is there so extract using jwt
            if (typeof token !== "string") {
                throw new Error("Invalid token");
            }

            const decoded = jwt.verify(token, process.env.JWT_KEY!);

            if(typeof decoded === "string"){
                throw new Error("Invalid token");
            }
            const user = decoded as UserPayload;
            socket.data.userId = user.userId;
            socket.data.role = user.role;
            next();
        }

    }catch(err){
        next(new Error("unauth"));
    }
};
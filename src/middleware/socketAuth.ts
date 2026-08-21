import jwt, { type JwtPayload } from "jsonwebtoken";
import type { ExtendedError, Socket } from "socket.io";
import crypto from "crypto";
import { Role } from "../types/socket.js";

interface UserPayload extends JwtPayload {
    userId: string;
    role: Role;
}

export function socketAuth(socket: Socket,next: (err?: ExtendedError) => void) {
    try {
        const token = socket.handshake.auth.token;
        const role = socket.handshake.auth.role;

        console.log("SOCKET AUTH:", {
            tokenPresent: !!token,
            role
        });

        // Guest -> no need of JWT
        if (role === Role.GUEST && !token) {
            const guestId = crypto.randomUUID();

            socket.data.userId = guestId;
            socket.data.role = Role.GUEST;

            console.log("GUEST AUTHENTICATED:", {
                guestId,
                role: socket.data.role
            });

            next();
            return;
        }

        // Interviewer must have JWT
        if (role === Role.INTERVIEWER && token) {
            const decoded = jwt.verify(
                token,
                process.env.JWT_KEY!
            );

            if (typeof decoded === "string") {
                throw new Error("Invalid token");
            }

            const user = decoded as UserPayload;

            socket.data.userId = user.userId;
            socket.data.role = user.role;

            console.log("INTERVIEWER AUTHENTICATED:", {
                userId: user.userId,
                role: user.role
            });

            next();
            return;
        }

        throw new Error("Invalid authentication");
    } catch (err) {
        console.error("SOCKET AUTH FAILED:", err);
        next(new Error("unauth"));
    }
}
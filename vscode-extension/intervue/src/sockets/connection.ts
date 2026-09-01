import { ExtensionContext } from "vscode";
import { io, Socket } from "socket.io-client";
import { EventEmitter } from "events";
import { Role } from "../types";

export const connectionEmitter = new EventEmitter();

export let socket: Socket | undefined;
export let currRole : Role | undefined;

export async function connectSocket(context: ExtensionContext,role: Role): Promise<Socket> {
        currRole = role; //use in ext for sesh end
        // Prevent duplicate connections
        if (socket?.connected) {
            console.log("REUSING EXISTING SOCKET:", socket.id);
            return socket;
        }
        /*
         * Interviewer:
         *   authenticated using JWT
         *
         * Guest:
         *   no JWT, only role
         * this will help you to get through socket auth
         */
        if (role === Role.INTERVIEWER){
            const token = await context.secrets.get("token");
            if (!token) {
                throw new Error("Interviewer authentication required");
            }
            socket = io("http://localhost:3000", {
                auth: {
                    token,
                    role: Role.INTERVIEWER
                }
            });
        } else {
            socket = io("http://localhost:3000", {
                auth: {
                    role: Role.GUEST
                }
            });
        }

        const s = socket;

        return new Promise<Socket>((resolve, reject) => {
            s.once("connect", () => {
                console.log("CLIENT SOCKET CONNECTED:", {
                    socketId: s.id,
                    role,
                    connected: s.connected
                });
                connectionEmitter.emit("connected");
                resolve(s);
            });
            s.once("connect_error", (err) => {
                console.log("CLIENT SOCKET ERROR:", {
                    message: err.message,
                    role
                });

                if (err.message === "unauthorized") {
                    s.disconnect();
                    connectionEmitter.emit(
                        "auth_failed",
                        err.message
                    );
                }
                reject(err);
            });

            s.on("disconnect", (reason) => {
                console.log("CLIENT SOCKET DISCONNECTED:", {
                    socketId: s.id,
                    reason
                });
                connectionEmitter.emit("disconnected");
            });
        });
}

export function emitSocket(event: string,...args: any[]) {
        console.log("EMIT SOCKET:", {
            event,
            socketId: socket?.id,
            connected: socket?.connected,
            args
        });
        socket?.emit(event, ...args);
}
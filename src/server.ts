import express from "express";
import dotenv from "dotenv";
dotenv.config();
import type {Request, Response} from "express";
import http from "http";
import {Server} from "socket.io";
import type { ClientToServerEvents,ServerToClientEvents,InterServerEvents,SocketData } from "./types/socket.js";
import { registerSocketHandlers } from "./sockets/handlers.js";
import { SessionManager } from "./session/SessionManager.js";
import path from "path";
import { fileURLToPath } from "url";
import {socketAuth} from "./middleware/socketAuth.js"

import pg from 'pg';
import pool from "./config/db.js";
const app = express();
const server = http.createServer(app);
const io = new Server< ClientToServerEvents,ServerToClientEvents,InterServerEvents,SocketData >(server);

app.use(express.json());
app.use(express.urlencoded({extended : false}));


io.use(socketAuth);
const sessionManager = new SessionManager();
registerSocketHandlers(io,sessionManager);

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

pool.query('SELECT NOW()').then(res => console.log(res.rows[0]));


app.get('/test', (req :Request, res : Response)=>{
    res.sendFile(path.join(__dirname, './tests/test.socket.html'));
})

app.get("/health", (req : Request, res : Response)=>{
    res.json({
        status : "OK",
        timeStamp : Date.now()
    });
})

const PORT = process.env.PORT || 3000;
server.listen(PORT,()=>{
    console.log(`Server running at port : ${PORT}`);
} )


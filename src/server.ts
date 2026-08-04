import express from "express";
import dotenv from "dotenv";
dotenv.config();
import type {Request, Response} from "express";
import http from "http";
import {Server} from "socket.io";
import { type ClientToServerEvents,type ServerToClientEvents,type InterServerEvents,type SocketData, Role } from "./types/socket.js";
import { registerSocketHandlers } from "./sockets/handlers.js";
import { SessionManager } from "./session/SessionManager.js";
import path from "path";
import { fileURLToPath } from "url";
import {socketAuth} from "./middleware/socketAuth.js"
import jwt from 'jsonwebtoken';
import pg from 'pg';
import pool from "./config/db.js";
import { error } from "console";
const app = express();
const server = http.createServer(app);
const io = new Server< ClientToServerEvents,ServerToClientEvents,InterServerEvents,SocketData >(server);
import bcrypt from "bcrypt";

app.use(express.json());
app.use(express.urlencoded({extended : false}));


io.use(socketAuth);
const sessionManager = new SessionManager();
registerSocketHandlers(io,sessionManager);

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);


app.get('/test', (req :Request, res : Response)=>{
    res.sendFile(path.join(__dirname, './tests/test.socket.html'));
})

app.get('/dev/token', (req: Request, res: Response) => {
    const token = jwt.sign(
        { userId: 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11', role: 'INTERVIEWER' },
        process.env.JWT_KEY as string,
        { expiresIn: '1d' }
    );
    res.cookie('token', token, { httpOnly: true });
    res.json({ token, message: 'cookie set' });
});

//interviewer route
app.post('/login',async (req: Request, res:Response)=>{
    const {email, password} = req.body;
    if(!email || !password){
        return res.status(400).json({
            error
        });
    }

    //query postgres
    const result  = await pool.query('SELECT * from users WHERE email = $1', [email]);
    const resPass : string = result.rows[0]?.password;
    if(!resPass){
        return res.status(400).json({
            message : "No pass"
        });
        
    }
    
    const isMatch = await bcrypt.compare(password, resPass);
    if(!isMatch){
        return res.status(401).json({
            message : "wrong pass"
        });
    }else{
        //if match token 
        
        const userId = result.rows[0].id;
        const token = jwt.sign({ 
            userId ,
            role : Role.INTERVIEWER

        }, process.env.JWT_KEY!);

        res.cookie("token",token,{
                httpOnly : true, //protects from token chori by XSS
                sameSite : "lax", //allows redirect to keep cookei
                secure : false,  //F in localhost T in production
                maxAge: 24 * 60 * 60 * 1000
        });

        res.json({token});
    }


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


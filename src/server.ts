import express from "express";
import dotenv from "dotenv";
dotenv.config();
import type {Request, Response} from "express";
import { timeStamp } from "node:console";
const app = express();
app.use(express.json());
app.use(express.urlencoded({extended : false}));

const PORT = process.env.PORT || 3000;
app.get("/health", (req : Request, res : Response)=>{
    res.json({
        status : "OK",
        timeStamp : Date.now()
    });
})

app.listen(PORT,()=>{
    console.log(`Server running at port : ${PORT}`);
} )


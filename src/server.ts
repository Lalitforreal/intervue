import express from "express";
import dotenv from "dotenv";
dotenv.config();
// import type {Request, Response} from "express";
const app = express();
app.use(express.json());
app.use(express.urlencoded({extended : false}));

const PORT = process.env.PORT || 3000;
app.listen(PORT,()=>{
    console.log(`Server running at port : ${PORT}`);
} )


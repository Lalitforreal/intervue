import axios from "axios";
import { ExtensionContext } from "vscode";



export async function loginReq(email : string, password : string, context : ExtensionContext){
    try{    
        // url, body, config
        const response = await axios.post("http://localhost:3000/login",
        {
            email, password
        });

        const token  = response.data.token as string;
        //expects string
        await context.secrets.store("token", token);
    }catch (err) {
        if (axios.isAxiosError(err)) {
            console.log(err);
            console.log(err.message);
            console.log(err.code);

            throw new Error(
                err.response
                    ? `${err.response.status} - ${JSON.stringify(err.response.data)}`
                    : `Network error: ${err.message}`
            );
        }

    throw err;
}
}
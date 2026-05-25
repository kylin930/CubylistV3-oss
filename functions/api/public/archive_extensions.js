export async function onRequest(context) {
    try {
        const responseData = {
            "code": 200,
            "message": "success",
            "data": []
        };

        return new Response(JSON.stringify(responseData), {
            status: 200,
            headers: {
                "Content-Type": "application/json;charset=utf-8",
                "Access-Control-Allow-Origin": "*",
                "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
                "Access-Control-Allow-Headers": "Content-Type, Authorization"
            }
        });
    } catch (error) {
        return new Response(JSON.stringify({
            code: 500,
            message: "Internal Server Error: " + error.message,
            data: null
        }), {
            status: 500,
            headers: {
                "Content-Type": "application/json;charset=utf-8",
                "Access-Control-Allow-Origin": "*"
            }
        });
    }
}
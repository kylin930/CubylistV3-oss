export async function onRequest(context) {
    if (context.request.method === "OPTIONS") {
        return new Response(null, {
            status: 204,
            headers: {
                "Access-Control-Allow-Origin": "*",
                "Access-Control-Allow-Methods": "POST, OPTIONS",
                "Access-Control-Allow-Headers": "Content-Type, Authorization"
            }
        });
    }

    try {
        const requestBody = await context.request.json();
        const { username, password } = requestBody;

        const expectedUsername = context.env.ADMIN_USERNAME || "admin";
        const expectedPasswordHash = context.env.ADMIN_PASSWORD_HASH || "9b3d0f8c00d65963b8843cb12bbf476ea05caa2cf3d55970b75b7c80b4874321";
        const adminToken = context.env.ADMIN_TOKEN || "secret-admin-token-cf-alist-v3";

        if (username === expectedUsername && password === expectedPasswordHash) {
            const successResponse = {
                "code": 200,
                "message": "success",
                "data": {
                    "device_key": "device-" + Date.now() + "-" + Math.random().toString(36).substring(2),
                    "token": adminToken
                }
            };
            return new Response(JSON.stringify(successResponse), {
                status: 200,
                headers: {
                    "Content-Type": "application/json;charset=utf-8",
                    "Access-Control-Allow-Origin": "*",
                    "Cache-Control": "no-store" // 登录接口也严禁缓存
                }
            });
        } else {
            return new Response(JSON.stringify({ code: 401, message: "Invalid credentials", data: null }), {
                status: 401,
                headers: { "Content-Type": "application/json;charset=utf-8", "Access-Control-Allow-Origin": "*" }
            });
        }
    } catch (error) {
        return new Response(JSON.stringify({ code: 500, message: "Error: " + error.message, data: null }), {
            status: 500,
            headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" }
        });
    }
}
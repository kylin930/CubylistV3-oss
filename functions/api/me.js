export async function onRequest(context) {
    if (context.request.method === "OPTIONS") {
        return new Response(null, {
            status: 204,
            headers: {
                "Access-Control-Allow-Origin": "*",
                "Access-Control-Allow-Methods": "GET, OPTIONS",
                "Access-Control-Allow-Headers": "Content-Type, Authorization"
            }
        });
    }

    try {
        const authHeader = context.request.headers.get("Authorization") || "";
        const expectedAdminToken = context.env.ADMIN_TOKEN || "secret-admin-token-cf-alist-v3";

        let responseData;

        // 校验 Token
        if (authHeader === expectedAdminToken || authHeader === `Bearer ${expectedAdminToken}`) {
            responseData = {
                "code": 200,
                "message": "success",
                "data": {
                    "id": 2,
                    "username": "admin",
                    "password": "",
                    "base_path": "/",
                    "role": [2],
                    "disabled": false,
                    "permission": 65535,
                    "sso_id": "",
                    "otp": false,
                    "role_names": ["admin"],
                    "permissions": [{"path": "/", "permission": 65535}]
                }
            };
        } else {
            responseData = {
                "code": 200,
                "message": "success",
                "data": {
                    "id": 1,
                    "username": "guest",
                    "password": "",
                    "base_path": "/",
                    "role": [1],
                    "disabled": false,
                    "permission": 0,
                    "sso_id": "",
                    "otp": false,
                    "role_names": ["guest"],
                    "permissions": [{"path": "/", "permission": 0}]
                }
            };
        }

        return new Response(JSON.stringify(responseData), {
            status: 200,
            headers: {
                "Content-Type": "application/json;charset=utf-8",
                "Access-Control-Allow-Origin": "*",
                "Cache-Control": "no-store, no-cache, must-revalidate, proxy-revalidate",
                "Pragma": "no-cache",
                "Expires": "0"
            }
        });

    } catch (error) {
        return new Response(JSON.stringify({ code: 500, message: "Error: " + error.message }), {
            status: 500,
            headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" }
        });
    }
}
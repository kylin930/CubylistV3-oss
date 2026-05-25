export async function onRequest(context) {
    // 预检请求处理 (CORS)
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
        // 获取前端请求头中的 Token
        const authHeader = context.request.headers.get("Authorization") || "";
        const expectedAdminToken = context.env.ADMIN_TOKEN || "secret-admin-token-cf-alist-v3";

        let responseData;

        // 判断是否是管理员登录状态
        if (authHeader === expectedAdminToken || authHeader === `Bearer ${expectedAdminToken}`) {
            // 返回管理员信息
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
                    "permission": 65535, // AList 中的最高权限
                    "sso_id": "",
                    "otp": false,
                    "role_names": ["admin"],
                    "permissions": [
                        {
                            "path": "/",
                            "permission": 65535
                        }
                    ]
                }
            };
        } else {
            // 返回访客 (Guest) 信息，权限为 0，只能查看 public 配置允许的目录
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
                    "permissions": [
                        {
                            "path": "/",
                            "permission": 0
                        }
                    ]
                }
            };
        }

        return new Response(JSON.stringify(responseData), {
            status: 200,
            headers: {
                "Content-Type": "application/json;charset=utf-8",
                "Access-Control-Allow-Origin": "*"
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
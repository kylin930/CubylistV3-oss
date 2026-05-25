export async function onRequest(context) {
    // 预检请求处理 (CORS)
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
        // 解析前端传来的请求体
        const requestBody = await context.request.json();
        const { username, password } = requestBody;

        // 从 Cloudflare 环境变量获取预设的管理员凭证（带默认值防止报错）
        const expectedUsername = context.env.ADMIN_USERNAME || "admin";
        // 默认值为你抓包到的那个哈希值
        const expectedPasswordHash = context.env.ADMIN_PASSWORD_HASH || "9b3d0f8c00d65963b8843cb12bbf476ea05caa2cf3d55970b75b7c80b4874321";
        const adminToken = context.env.ADMIN_TOKEN || "secret-admin-token-cf-alist-v3";

        // 校验账号密码
        if (username === expectedUsername && password === expectedPasswordHash) {
            const successResponse = {
                "code": 200,
                "message": "success",
                "data": {
                    "device_key": "cf-serverless-device-key",
                    "token": adminToken
                }
            };
            return new Response(JSON.stringify(successResponse), {
                status: 200,
                headers: {
                    "Content-Type": "application/json;charset=utf-8",
                    "Access-Control-Allow-Origin": "*"
                }
            });
        } else {
            // 密码错误
            const errorResponse = {
                "code": 401,
                "message": "Invalid username or password",
                "data": null
            };
            return new Response(JSON.stringify(errorResponse), {
                status: 401,
                headers: {
                    "Content-Type": "application/json;charset=utf-8",
                    "Access-Control-Allow-Origin": "*"
                }
            });
        }
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
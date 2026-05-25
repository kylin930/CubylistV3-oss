export async function onRequest(context) {
    const { request, env } = context;

    // 处理跨域预检
    if (request.method === "OPTIONS") {
        return new Response(null, {
            status: 204,
            headers: {
                "Access-Control-Allow-Origin": "*",
                "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
                "Access-Control-Allow-Headers": "Content-Type, Authorization"
            }
        });
    }

    try {
        // ==========================================
        // 1. POST 请求：供本地 Python 脚本更新 JWT 到 KV
        // ==========================================
        if (request.method === "POST") {
            const authHeader = request.headers.get("Authorization");
            const adminToken = env.ADMIN_TOKEN || "secret-admin-token-cf-alist-v3";
            
            // 安全校验：防止恶意伪造写入 KV
            if (authHeader !== adminToken && authHeader !== `Bearer ${adminToken}`) {
                return new Response(JSON.stringify({ code: 401, message: "Unauthorized local script" }), { status: 401 });
            }

            // 接收 Python 传来的 JWT 并持久化到 KV
            const payload = await request.json();
            await env.ALIST_KV.put("upload_jwt_config", JSON.stringify(payload));

            return new Response(JSON.stringify({ code: 200, message: "JWT updated successfully in CF KV" }), {
                headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" }
            });
        }

        // ==========================================
        // 2. GET 请求：前端拦截上传时，云函数去换取 STS
        // ==========================================
        if (request.method === "GET") {
            const url = new URL(request.url);
            let filePath = url.searchParams.get("path") || "/";

            // 第一步：从 KV 中读取本地脚本最新推送的 JWT
            const jwtStr = await env.ALIST_KV.get("upload_jwt_config");
            if (!jwtStr) {
                throw new Error("JWT config not found in KV. Please run your Python script first.");
            }
            
            const jwtConfig = JSON.parse(jwtStr);
            const currentJwt = jwtConfig.jwt || jwtConfig.token;

            if (!currentJwt) {
                throw new Error("Invalid JWT format stored in KV.");
            }

            // 第二步：完全对齐你 Python 脚本的请求逻辑
            const stsApiUrl = "https://api.wxzxzj.com/api/tool/upload/getStsToken"; 
            
            const stsResponse = await fetch(stsApiUrl, {
                method: "GET",
                headers: {
                    // Python 脚本里直接传 current_token，这里完全保持一致
                    "Authorization": currentJwt, 
                    "User-Agent": "Cloudflare-Pages-Worker/1.0" // 附加基本 UA
                }
            });

            // 检查底层 HTTP 级别是否报错 (对应 response.raise_for_status())
            if (!stsResponse.ok) {
                const errorText = await stsResponse.text();
                throw new Error(`请求 STS 接口网络错误: HTTP ${stsResponse.status} - ${errorText}`);
            }

            // 解析返回的 JSON 数据
            const data = await stsResponse.json();

            // 第三步：完全对齐你 Python 脚本的自定义业务状态码判断
            if (data.StatusCode !== 200 && data.statusCode !== 200 && data.code !== 200) {
                throw new Error(`STS 获取失败: ${JSON.stringify(data)}`);
            }

            // 第四步：提取核心 STS 凭证
            // 因为通常第三方接口会将实际的凭证包裹在某个字段里（比如 data.Body 或 data.data）
            // 这里做一个高兼容性的解构，确保安全过滤，绝不下发无关敏感信息
            let rawCreds = data.Body || data.data || data;

            // 第五步：组装并安全返回给前端 Hook 脚本
            return new Response(JSON.stringify({
                code: 200,
                message: "success",
                data: {
                    target_path: filePath,
                    credentials: {
                        AccessKeyId: rawCreds.AccessKeyId,
                        AccessKeySecret: rawCreds.AccessKeySecret,
                        SecurityToken: rawCreds.SecurityToken,
                        // 如果有返回默认 Bucket 等配置也可一并透传
                        bucket: rawCreds.bucket || env.OSS_BUCKET,
                        region: rawCreds.region || env.OSS_REGION,
                        expiration: rawCreds.Expiration || rawCreds.expiration
                    }
                }
            }), {
                status: 200,
                headers: {
                    "Content-Type": "application/json;charset=utf-8",
                    "Access-Control-Allow-Origin": "*"
                }
            });
        }

        return new Response("Method Not Allowed", { status: 405 });

    } catch (error) {
        return new Response(JSON.stringify({ code: 500, message: "Serverless STS error: " + error.message }), {
            status: 500,
            headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" }
        });
    }
}
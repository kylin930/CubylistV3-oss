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
        // 1. POST 请求：本地 Python 更新 JWT 到 KV
        // ==========================================
        if (request.method === "POST") {
            const authHeader = request.headers.get("Authorization");
            const adminToken = env.ADMIN_TOKEN || "secret-admin-token-cf-alist-v3";
            if (authHeader !== adminToken && authHeader !== `Bearer ${adminToken}`) {
                return new Response(JSON.stringify({ code: 401, message: "Unauthorized local script" }), { status: 401 });
            }
            const payload = await request.json();
            await env.ALIST_KV.put("upload_jwt_config", JSON.stringify(payload));
            return new Response(JSON.stringify({ code: 200, message: "JWT updated successfully in CF KV" }), {
                headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" }
            });
        }

        // ==========================================
        // 2. GET 请求：前端换取 STS
        // ==========================================
        if (request.method === "GET") {
            const url = new URL(request.url);
            let filePath = url.searchParams.get("path") || "/";

            const jwtStr = await env.ALIST_KV.get("upload_jwt_config");
            if (!jwtStr) throw new Error("KV 中未找到 JWT 配置。请先运行 Python 脚本推送。");
            
            const jwtConfig = JSON.parse(jwtStr);
            const currentJwt = jwtConfig.jwt || jwtConfig.token;
            if (!currentJwt) throw new Error("KV 中的 JWT 格式不正确。");

            // 请求目标 API
            const stsApiUrl = "https://api.wxzxzj.com/api/tool/upload/getStsToken"; 
            const stsResponse = await fetch(stsApiUrl, {
                method: "GET",
                headers: {
                    "Authorization": currentJwt,
                    "User-Agent": "Cloudflare-Pages-Worker/1.0"
                }
            });

            if (!stsResponse.ok) {
                throw new Error(`请求 STS 接口网络错误: HTTP ${stsResponse.status}`);
            }

            const data = await stsResponse.json();

            if (data.StatusCode !== 200 && data.statusCode !== 200 && data.code !== 200) {
                throw new Error(`STS 业务状态失败: ${JSON.stringify(data)}`);
            }

            // ==========================================
            // 🚀 核心修复点：基于 Python 逻辑的精准提取
            // ==========================================
            // 直接在 data 根目录寻找，如果找不到再尝试 data.data 或 data.Body (高兼容容错)
            const AccessKeyId = data.AccessKeyId || (data.data && data.data.AccessKeyId) || (data.Body && data.Body.AccessKeyId);
            const AccessKeySecret = data.AccessKeySecret || (data.data && data.data.AccessKeySecret) || (data.Body && data.Body.AccessKeySecret);
            const SecurityToken = data.SecurityToken || (data.data && data.data.SecurityToken) || (data.Body && data.Body.SecurityToken);

            // 致命异常拦截：如果还是没找到，直接抛出包含原始数据的异常，方便 F12 排错
            if (!AccessKeyId || !AccessKeySecret || !SecurityToken) {
                throw new Error(`从第三方接口获取成功，但未匹配到 STS 凭证字段。原始返回报文: ${JSON.stringify(data)}`);
            }

            return new Response(JSON.stringify({
                code: 200,
                message: "success",
                data: {
                    target_path: filePath,
                    credentials: {
                        AccessKeyId: AccessKeyId,
                        AccessKeySecret: AccessKeySecret,
                        SecurityToken: SecurityToken,
                        // 可选提取 bucket/region
                        bucket: data.bucket || (data.data && data.data.bucket) || env.OSS_BUCKET,
                        region: data.region || (data.data && data.data.region) || env.OSS_REGION
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
        return new Response(JSON.stringify({ code: 500, message: "STS 中转错误: " + error.message }), {
            status: 500,
            headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" }
        });
    }
}
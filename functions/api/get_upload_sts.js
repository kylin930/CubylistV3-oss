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
        const authHeader = request.headers.get("Authorization") || "";
        const adminToken = env.ADMIN_TOKEN || "secret-admin-token-cf-alist-v3";
        
        // 校验请求头 Token 是否满足管理员要求
        const isAuthorized = (authHeader === adminToken || authHeader === `Bearer ${adminToken}`);

        // ==========================================
        // 1. POST 请求：供本地 Python 脚本更新 JWT 到 KV
        // ==========================================
        if (request.method === "POST") {
            // 严格拦截非管理员授权
            if (!isAuthorized) {
                return new Response(JSON.stringify({ code: 401, message: "Unauthorized local script" }), { 
                    status: 401,
                    headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" }
                });
            }

            const payload = await request.json();
            await env.ALIST_KV.put("upload_jwt_config", JSON.stringify(payload));

            return new Response(JSON.stringify({ code: 200, message: "JWT updated successfully in CF KV" }), {
                headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" }
            });
        }

        // ==========================================
        // 2. GET 请求：前端 Hook 劫持直传时换取临时 STS
        // ==========================================
        if (request.method === "GET") {
            // 严格拦截非登录/匿名越权访客获取 STS 凭证
            // 如果前端页面上没有管理员 Token 或者是访客身份，直接中断并返回 401
            if (!isAuthorized) {
                return new Response(JSON.stringify({ code: 401, message: "Unauthorized visitor: Login required to get STS token." }), { 
                    status: 401,
                    headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" }
                });
            }

            const url = new URL(request.url);
            let filePath = url.searchParams.get("path") || "/";

            // 从 KV 中读取本地定时脚本最新推送的外部系统登录口令 JWT
            const jwtStr = await env.ALIST_KV.get("upload_jwt_config");
            if (!jwtStr) throw new Error("KV中未检测到合法的JWT基础配置，请运行本地Python推流脚本。");
            
            const jwtConfig = JSON.parse(jwtStr);
            const currentJwt = jwtConfig.jwt || jwtConfig.token;
            if (!currentJwt) throw new Error("KV中检索到的JWT数据层级或格式有误。");

            // 完全对齐 Python 请求逻辑，赴目标接口以 JWT 兑换临时高安全 OSS 凭证
            const stsApiUrl = "https://api.wxzxzj.com/api/tool/upload/getStsToken"; 
            const stsResponse = await fetch(stsApiUrl, {
                method: "GET",
                headers: {
                    "Authorization": currentJwt,
                    "User-Agent": "Cloudflare-Pages-Worker/1.0"
                }
            });

            if (!stsResponse.ok) {
                throw new Error(`请求第三方STS服务发生网络传输故障: HTTP ${stsResponse.status}`);
            }

            const data = await stsResponse.json();

            // 对齐业务状态码校验
            if (data.StatusCode !== 200 && data.statusCode !== 200 && data.code !== 200) {
                throw new Error(`第三方STS服务拒绝签发凭证: ${JSON.stringify(data)}`);
            }

            // 对齐最外层根节点结构解构提取凭证
            const AccessKeyId = data.AccessKeyId || (data.data && data.data.AccessKeyId) || (data.Body && data.Body.AccessKeyId);
            const AccessKeySecret = data.AccessKeySecret || (data.data && data.data.AccessKeySecret) || (data.Body && data.Body.AccessKeySecret);
            const SecurityToken = data.SecurityToken || (data.data && data.data.SecurityToken) || (data.Body && data.Body.SecurityToken);

            if (!AccessKeyId || !AccessKeySecret || !SecurityToken) {
                throw new Error(`凭证解析熔断：未能在返回报文中识别到凭证特征。`);
            }

            // 安全下发短寿命 STS 凭证
            return new Response(JSON.stringify({
                code: 200,
                message: "success",
                data: {
                    target_path: filePath,
                    credentials: {
                        AccessKeyId: AccessKeyId,
                        AccessKeySecret: AccessKeySecret,
                        SecurityToken: SecurityToken,
                        bucket: data.bucket || (data.data && data.data.bucket) || env.OSS_BUCKET,
                        region: data.region || (data.data && data.data.region) || env.OSS_REGION
                    }
                }
            }), {
                status: 200,
                headers: {
                    "Content-Type": "application/json;charset=utf-8",
                    "Access-Control-Allow-Origin": "*",
                    "Cache-Control": "no-store" // 严禁节点缓存临时凭证
                }
            });
        }

        return new Response("Method Not Allowed", { status: 405 });

    } catch (error) {
        return new Response(JSON.stringify({ code: 500, message: "STS Fetch Error: " + error.message, data: null }), {
            status: 500,
            headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" }
        });
    }
}
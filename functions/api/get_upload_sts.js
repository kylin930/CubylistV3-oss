export async function onRequest(context) {
    const { request, env } = context;

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
        const isAuthorized = (authHeader === adminToken || authHeader === `Bearer ${adminToken}`);

        const db = env.ALIST_D1;
        if (!db) throw new Error("ALIST_D1 namespace is not bound.");

        // ==========================================
        // 1. POST: 供本地 Python 脚本更新 JWT 到 D1
        // ==========================================
        if (request.method === "POST") {
            if (!isAuthorized) {
                return new Response(JSON.stringify({ code: 401, message: "Unauthorized local script" }), { status: 401, headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" } });
            }

            const payload = await request.json();
            
            // D1 更新操作：插入或更新 key='upload_jwt_config'
            await db.prepare(`INSERT INTO config (key, value) VALUES ('upload_jwt_config', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value`)
                    .bind(JSON.stringify(payload))
                    .run();

            return new Response(JSON.stringify({ code: 200, message: "JWT updated successfully in CF D1" }), { headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" } });
        }

        // ==========================================
        // 2. GET: 前端获取临时 STS
        // ==========================================
        if (request.method === "GET") {
            if (!isAuthorized) {
                return new Response(JSON.stringify({ code: 401, message: "Unauthorized visitor: Login required to get STS token." }), { status: 401, headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" } });
            }

            const url = new URL(request.url);
            let filePath = url.searchParams.get("path") || "/";

            // 从 D1 配置表中读取 JWT
            const configRecord = await db.prepare("SELECT value FROM config WHERE key = 'upload_jwt_config'").first();
            if (!configRecord || !configRecord.value) {
                throw new Error("D1中未检测到合法的JWT基础配置，请运行本地Python推流脚本。");
            }
            
            const jwtConfig = JSON.parse(configRecord.value);
            const currentJwt = jwtConfig.jwt || jwtConfig.token;
            if (!currentJwt) throw new Error("D1中检索到的JWT数据层级或格式有误。");

            // 兑换临时高安全 OSS 凭证
            const stsApiUrl = env.STSAPIUrl; 
            const stsResponse = await fetch(stsApiUrl, {
                method: "GET",
                headers: { "Authorization": currentJwt, "User-Agent": "Cloudflare-Pages-Worker/1.0" }
            });

            if (!stsResponse.ok) throw new Error(`请求第三方STS服务发生网络传输故障: HTTP ${stsResponse.status}`);
            const data = await stsResponse.json();

            if (data.StatusCode !== 200 && data.statusCode !== 200 && data.code !== 200) {
                throw new Error(`第三方STS服务拒绝签发凭证: ${JSON.stringify(data)}`);
            }

            const AccessKeyId = data.AccessKeyId || (data.data && data.data.AccessKeyId) || (data.Body && data.Body.AccessKeyId);
            const AccessKeySecret = data.AccessKeySecret || (data.data && data.data.AccessKeySecret) || (data.Body && data.Body.AccessKeySecret);
            const SecurityToken = data.SecurityToken || (data.data && data.data.SecurityToken) || (data.Body && data.Body.SecurityToken);

            if (!AccessKeyId || !AccessKeySecret || !SecurityToken) {
                throw new Error(`凭证解析熔断：未能在返回报文中识别到凭证特征。`);
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
                        bucket: data.bucket || (data.data && data.data.bucket) || env.OSS_BUCKET,
                        region: data.region || (data.data && data.data.region) || env.OSS_REGION
                    }
                }
            }), { status: 200, headers: { "Content-Type": "application/json;charset=utf-8", "Access-Control-Allow-Origin": "*", "Cache-Control": "no-store" } });
        }

        return new Response("Method Not Allowed", { status: 405 });

    } catch (error) {
        return new Response(JSON.stringify({ code: 500, message: "STS Fetch Error: " + error.message, data: null }), { status: 500, headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" } });
    }
}
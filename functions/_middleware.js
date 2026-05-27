// 全局内存 LRU 级缓存映射 (在 Cloudflare Workers Isolate 级别存活)
const rateLimitMap = new Map();

// 每个 IP 60 秒内最多允许 60 次 API 请求
const RATE_LIMIT_WINDOW_MS = 60000;
const MAX_REQUESTS_PER_WINDOW = 60;

export async function onRequest(context) {
    const { request, next } = context;
    const url = new URL(request.url);

    // 仅针对 api/fs 系列核心数据库路径做限流拦截，不阻碍静态文件页面的访问
    if (url.pathname.startsWith('/api/fs')) {
        const clientIP = request.headers.get("CF-Connecting-IP") || "0.0.0.0";
        const now = Date.now();

        let reqData = rateLimitMap.get(clientIP);

        if (!reqData) {
            rateLimitMap.set(clientIP, { count: 1, firstReqTime: now });
        } else {
            // 如果在时间窗口内
            if (now - reqData.firstReqTime < RATE_LIMIT_WINDOW_MS) {
                reqData.count++;
                
                // 触发限流防御
                if (reqData.count > MAX_REQUESTS_PER_WINDOW) {
                    return new Response(JSON.stringify({
                        code: 429,
                        message: "请求过于频繁，请稍后再试。(Rate Limit Exceeded)",
                        data: null
                    }), {
                        status: 429,
                        headers: {
                            "Content-Type": "application/json;charset=utf-8",
                            "Access-Control-Allow-Origin": "*"
                        }
                    });
                }
            } else {
                // 超出时间窗口，重新计时
                rateLimitMap.set(clientIP, { count: 1, firstReqTime: now });
            }
        }

        // 为了防止内存泄漏 (Map持续扩大)，如果 Map 超过 1 万条，随机清理掉 10%
        if (rateLimitMap.size > 10000) {
            let deleteCount = 1000;
            for (let key of rateLimitMap.keys()) {
                rateLimitMap.delete(key);
                if (--deleteCount === 0) break;
            }
        }
    }

    // 放行通过，进入下一步实际处理函数
    return next();
}
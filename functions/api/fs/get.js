export async function onRequest(context) {
    // 1. 处理跨域预检
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
        let { path } = requestBody;

        if (!path) {
            return new Response(JSON.stringify({ code: 400, message: "Path is required", data: null }), {
                status: 400,
                headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" }
            });
        }

        // 规范化文件路径结构
        if (!path.startsWith("/")) path = "/" + path;
        if (path.length > 1 && path.endsWith("/")) path = path.slice(0, -1);

        const kvNamespace = context.env.ALIST_KV;
        if (!kvNamespace) {
            throw new Error("ALIST_KV namespace is not bound.");
        }

        let fileMeta = null;

        // 优先尝试直接从独立的文件元数据键（file:{path}）中检索
        const fileMetaStr = await kvNamespace.get(`file:${path}`);
        if (fileMetaStr) {
            fileMeta = JSON.parse(fileMetaStr);
        } else {
            // 兜底备用方案：从父级目录索引列表中反向解构匹配该文件
            const lastSlashIndex = path.lastIndexOf("/");
            const parentPath = lastSlashIndex === 0 ? "/" : path.substring(0, lastSlashIndex);
            const fileName = path.substring(lastSlashIndex + 1);

            const dirDataStr = await kvNamespace.get(`dir:${parentPath}`);
            if (dirDataStr) {
                const dirList = JSON.parse(dirDataStr);
                const matchedItem = dirList.find(item => item.name === fileName && !item.is_dir);
                if (matchedItem) {
                    fileMeta = matchedItem;
                }
            }
        }

        // 资源完全不存在，返回标准 AList 404
        if (!fileMeta) {
            return new Response(JSON.stringify({
                code: 404,
                message: "object not found",
                data: null
            }), {
                status: 404,
                headers: { "Content-Type": "application/json;charset=utf-8", "Access-Control-Allow-Origin": "*" }
            });
        }

        // ==========================================
        // 🚀 核心改动：直接拼接 OSS 直连公共访问地址
        // ==========================================
        
        // 从环境变量获取你的 OSS 公共域名或绑定的自定义域名
        // 例如：https://your-bucket.oss-cn-hangzhou.aliyuncs.com 或 https://pan.yourdomain.com
        const publicDomain = context.env.OSS_PUBLIC_DOMAIN;
        if (!publicDomain) {
            throw new Error("OSS_PUBLIC_DOMAIN environment variable is not configured.");
        }

        // 确保域名末尾没有斜杠
        const cleanDomain = publicDomain.endsWith('/') ? publicDomain.slice(0, -1) : publicDomain;
        
        // 获取真实的 OSS Key，如果没有在 KV 里特别声明 oss_key，则直接使用路径
        const ossKey = fileMeta.oss_key || path;
        
        // 对路径进行标准的 URI 编码，避免中文或特殊字符导致链接失效（保留斜杠结构）
        const safeObjectKey = ossKey.split('/').map(segment => encodeURIComponent(segment)).join('/');

        // 直接拼接出最终的直连下载/预览 URL
        const rawUrl = `${cleanDomain}${safeObjectKey.startsWith('/') ? '' : '/'}${safeObjectKey}`;

        // 严格遵循 AList 前端预期的数据结构封包
        const responseData = {
            "code": 200,
            "message": "success",
            "data": {
                "id": fileMeta.id || "",
                "path": path,
                "name": fileMeta.name,
                "size": fileMeta.size || 0,
                "is_dir": false,
                "modified": fileMeta.modified || new Date().toISOString(),
                "created": fileMeta.created || fileMeta.modified || new Date().toISOString(),
                "sign": "", // 直链无需签名
                "thumb": fileMeta.thumb || "",
                "type": fileMeta.type || 0,
                "hashinfo": "null",
                "hash_info": null,
                "raw_url": rawUrl, // 直接将直链喂给前端
                "readme": "",
                "header": "",
                "provider": "Cloudflare KV (Public OSS)",
                "related": null
            }
        };

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
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
        let { path } = requestBody;

        if (!path) {
            return new Response(JSON.stringify({ code: 400, message: "Path is required", data: null }), {
                status: 400,
                headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" }
            });
        }

        // 前置解密与路径规整
        let decodedPath = decodeURIComponent(decodeURIComponent(path));
        if (!decodedPath.startsWith("/")) decodedPath = "/" + decodedPath;
        if (decodedPath.length > 1 && decodedPath.endsWith("/")) decodedPath = decodedPath.slice(0, -1);

        const kvNamespace = context.env.ALIST_KV;
        if (!kvNamespace) throw new Error("ALIST_KV namespace is not bound.");

        let fileMeta = null;

        // 优先检索文件键
        const fileMetaStr = await kvNamespace.get(`file:${decodedPath}`);
        if (fileMetaStr) {
            fileMeta = JSON.parse(fileMetaStr);
        } else {
            // 兜底策略：从父级目录反向检索
            const lastSlashIndex = decodedPath.lastIndexOf("/");
            const parentPath = lastSlashIndex === 0 ? "/" : decodedPath.substring(0, lastSlashIndex);
            const fileName = decodedPath.substring(lastSlashIndex + 1);

            const dirDataStr = await kvNamespace.get(`dir:${parentPath}`);
            if (dirDataStr) {
                const dirList = JSON.parse(dirDataStr);
                const matchedItem = dirList.find(item => item.name === fileName && !item.is_dir);
                if (matchedItem) fileMeta = matchedItem;
            }
        }

        if (!fileMeta) {
            return new Response(JSON.stringify({ code: 404, message: "object not found", data: null }), {
                status: 404,
                headers: { "Content-Type": "application/json;charset=utf-8", "Access-Control-Allow-Origin": "*" }
            });
        }

        // 获取 OSS 公共公网域名
        const publicDomain = context.env.OSS_PUBLIC_DOMAIN;
        if (!publicDomain) throw new Error("OSS_PUBLIC_DOMAIN environment variable is missing.");
        const cleanDomain = publicDomain.endsWith('/') ? publicDomain.slice(0, -1) : publicDomain;
        
        // 提取真实的 OSS 文件键并进行纯净编码
        const ossKey = fileMeta.oss_key || decodedPath;
        const safeObjectKey = ossKey.split('/').map(segment => encodeURIComponent(segment)).join('/');

        // 专门用来给 AList 网页端内做图片预览、视频播放
        const rawUrl = `${cleanDomain}${safeObjectKey.startsWith('/') ? '' : '/'}${safeObjectKey}`;

        // 加入了阿里云 OSS 官方的 response-content-disposition 强制附件下载参数
        // 对文件名进行符合 HTTP Header 规范的 URL 编码，防止中文文件名下载时变成乱码或下划线
        const safeDownloadName = encodeURIComponent(fileMeta.name);
        const downloadUrl = `${rawUrl}?response-content-disposition=attachment%3B%20filename%3D${safeDownloadName}`;

        // 严格组装 AList 前端预期字段
        const responseData = {
            "code": 200,
            "message": "success",
            "data": {
                "id": fileMeta.id || "",
                "path": decodedPath,
                "name": fileMeta.name,
                "size": fileMeta.size || 0,
                "is_dir": false,
                "modified": fileMeta.modified || new Date().toISOString(),
                "created": fileMeta.created || fileMeta.modified || new Date().toISOString(),
                "sign": "", 
                "thumb": fileMeta.thumb || "",
                "type": fileMeta.type || 0,
                "hashinfo": "null",
                "hash_info": null,
                "raw_url": rawUrl,
                "download_url": downloadUrl, 
                "readme": "",
                "header": "",
                "provider": "Cloudflare KV (Flattening OSS)",
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
        return new Response(JSON.stringify({ code: 500, message: error.message, data: null }), {
            status: 500,
            headers: { "Content-Type": "application/json;charset=utf-8", "Access-Control-Allow-Origin": "*" }
        });
    }
}
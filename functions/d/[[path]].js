export async function onRequest(context) {
    // 处理跨域预检请求
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

    // 重定向接口只接受 GET 请求
    if (context.request.method !== "GET") {
        return new Response("Method Not Allowed", { status: 405 });
    }

    try {
        // 1. 获取动态路由参数并拼接成完整虚拟路径
        // 在 Cloudflare Pages 中，[[path]].js 会把后续的路径切分成数组
        // 例如 /d/a/b.png -> context.params.path = ['a', 'b.png']
        const pathArray = context.params.path;
        if (!pathArray || pathArray.length === 0) {
            return new Response("Bad Request: Empty path", { status: 400 });
        }

        // 拼接路径并前置强制解码，防止前端传来的 %2F 导致匹配失败
        let virtualPath = "/" + pathArray.join("/");
        virtualPath = decodeURIComponent(virtualPath);

        const kv = context.env.ALIST_KV;
        if (!kv) throw new Error("ALIST_KV namespace is not bound.");

        // 2. 从 KV 虚拟文件系统中精准捞取文件元数据
        let fileMeta = null;
        
        // 优先检索独立文件键
        const fileMetaStr = await kv.get(`file:${virtualPath}`);
        if (fileMetaStr) {
            fileMeta = JSON.parse(fileMetaStr);
        } else {
            // 兜底策略：从父级目录反向检索
            const lastSlashIndex = virtualPath.lastIndexOf("/");
            const parentPath = lastSlashIndex === 0 ? "/" : virtualPath.substring(0, lastSlashIndex);
            const fileName = virtualPath.substring(lastSlashIndex + 1);

            const dirDataStr = await kv.get(`dir:${parentPath}`);
            if (dirDataStr) {
                const dirList = JSON.parse(dirDataStr);
                const matchedItem = dirList.find(item => item.name === fileName && !item.is_dir);
                if (matchedItem) fileMeta = matchedItem;
            }
        }

        // 3. 文件不存在，返回 404 纯文本
        if (!fileMeta) {
            return new Response("404 Not Found: The requested file does not exist in VFS.", { 
                status: 404,
                headers: { "Content-Type": "text/plain;charset=utf-8" }
            });
        }

        // 4. 拼装真实的 OSS 直链
        const publicDomain = context.env.OSS_PUBLIC_DOMAIN;
        if (!publicDomain) throw new Error("OSS_PUBLIC_DOMAIN environment variable is missing.");
        const cleanDomain = publicDomain.endsWith('/') ? publicDomain.slice(0, -1) : publicDomain;
        
        // 提取真实的 OSS 文件键（我们在 Hook 里存在根目录的那个无斜杠的名称）
        const ossKey = fileMeta.oss_key || virtualPath;
        const safeObjectKey = ossKey.split('/').map(segment => encodeURIComponent(segment)).join('/');
        
        // 组装基础直链
        let redirectUrl = `${cleanDomain}${safeObjectKey.startsWith('/') ? '' : '/'}${safeObjectKey}`;
        
        const urlObj = new URL(context.request.url);
        if (urlObj.pathname.startsWith('/d/')) {
            const safeDownloadName = encodeURIComponent(fileMeta.name);
            redirectUrl += `?response-content-disposition=attachment%3B%20filename%3D${safeDownloadName}`;
        }

        // 返回 302 重定向
        return Response.redirect(redirectUrl, 302);

    } catch (error) {
        return new Response("Internal Server Error: " + error.message, { 
            status: 500,
            headers: { "Content-Type": "text/plain;charset=utf-8" }
        });
    }
}
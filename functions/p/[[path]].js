export async function onRequest(context) {
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

    if (context.request.method !== "GET") {
        return new Response("Method Not Allowed", { status: 405 });
    }

    try {
        const pathArray = context.params.path;
        if (!pathArray || pathArray.length === 0) {
            return new Response("Bad Request: Empty path", { status: 400 });
        }

        let virtualPath = "/" + pathArray.join("/");
        virtualPath = decodeURIComponent(virtualPath);

        const db = context.env.ALIST_D1;
        if (!db) throw new Error("ALIST_D1 namespace is not bound.");

        // D1 一击必中：通过路径直接提取文件元数据（且必须是文件，不能是目录）
        const stmt = db.prepare("SELECT * FROM vfs WHERE path = ? AND is_dir = 0").bind(virtualPath);
        const fileMeta = await stmt.first();

        if (!fileMeta) {
            return new Response("404 Not Found: The requested file does not exist in VFS.", { 
                status: 404,
                headers: { "Content-Type": "text/plain;charset=utf-8" }
            });
        }

        const publicDomain = context.env.OSS_PUBLIC_DOMAIN;
        if (!publicDomain) throw new Error("OSS_PUBLIC_DOMAIN environment variable is missing.");
        const cleanDomain = publicDomain.endsWith('/') ? publicDomain.slice(0, -1) : publicDomain;
        
        const ossKey = fileMeta.oss_key || virtualPath;
        const safeObjectKey = ossKey.split('/').map(segment => encodeURIComponent(segment)).join('/');
        
        let redirectUrl = `${cleanDomain}${safeObjectKey.startsWith('/') ? '' : '/'}${safeObjectKey}`;

        return Response.redirect(redirectUrl, 302);

    } catch (error) {
        return new Response("Internal Server Error: " + error.message, { 
            status: 500,
            headers: { "Content-Type": "text/plain;charset=utf-8" }
        });
    }
}
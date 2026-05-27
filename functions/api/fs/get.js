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
            return new Response(JSON.stringify({ code: 400, message: "Path is required", data: null }), { status: 400, headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" } });
        }

        let decodedPath = decodeURIComponent(decodeURIComponent(path));
        if (!decodedPath.startsWith("/")) decodedPath = "/" + decodedPath;
        if (decodedPath.length > 1 && decodedPath.endsWith("/")) decodedPath = decodedPath.slice(0, -1);

        const db = context.env.ALIST_D1;
        if (!db) throw new Error("ALIST_D1 namespace is not bound.");

        const stmt = db.prepare("SELECT * FROM vfs WHERE path = ?").bind(decodedPath);
        const fileMeta = await stmt.first();

        if (!fileMeta || fileMeta.is_dir === 1) {
            return new Response(JSON.stringify({ code: 404, message: "object not found", data: null }), { status: 404, headers: { "Content-Type": "application/json;charset=utf-8", "Access-Control-Allow-Origin": "*" } });
        }

        const publicDomain = context.env.OSS_PUBLIC_DOMAIN;
        if (!publicDomain) throw new Error("OSS_PUBLIC_DOMAIN environment variable is missing.");
        const cleanDomain = publicDomain.endsWith('/') ? publicDomain.slice(0, -1) : publicDomain;
        
        const ossKey = fileMeta.oss_key || decodedPath;
        const safeObjectKey = ossKey.split('/').map(segment => encodeURIComponent(segment)).join('/');
        const rawUrl = `${cleanDomain}${safeObjectKey.startsWith('/') ? '' : '/'}${safeObjectKey}`;
        const safeDownloadName = encodeURIComponent(fileMeta.name);
        const downloadUrl = `${rawUrl}?response-content-disposition=attachment%3B%20filename%3D${safeDownloadName}`;

        const responseData = {
            "code": 200,
            "message": "success",
            "data": {
                "id": fileMeta.id,
                "path": decodedPath,
                "name": fileMeta.name,
                "size": fileMeta.size,
                "is_dir": false,
                "modified": fileMeta.modified,
                "created": fileMeta.created,
                "sign": fileMeta.sign || "", 
                "thumb": fileMeta.thumb || "",
                "type": fileMeta.type,
                "hashinfo": "null",
                "hash_info": null,
                "raw_url": rawUrl,
                "download_url": downloadUrl, 
                "readme": "",
                "header": "",             // 已补全
                "provider": "Cloudflare D1 (Flattening OSS)",
                "related": null           // 已补全
            }
        };

        return new Response(JSON.stringify(responseData), { status: 200, headers: { "Content-Type": "application/json;charset=utf-8", "Access-Control-Allow-Origin": "*" } });
    } catch (error) {
        return new Response(JSON.stringify({ code: 500, message: error.message, data: null }), { status: 500, headers: { "Content-Type": "application/json;charset=utf-8", "Access-Control-Allow-Origin": "*" } });
    }
}
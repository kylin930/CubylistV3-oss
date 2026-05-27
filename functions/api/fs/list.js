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
        const authHeader = context.request.headers.get("Authorization") || "";
        const expectedAdminToken = context.env.ADMIN_TOKEN || "secret-admin-token-cf-alist-v3";
        const isAdmin = (authHeader === expectedAdminToken || authHeader === `Bearer ${expectedAdminToken}`);

        const requestBody = await context.request.json();
        // 核心切入：动态提取分页参数，默认第1页，每页50条
        let { path, page = 1, per_page = 50 } = requestBody;

        if (!path) path = "/";

        let decodedPath = decodeURIComponent(decodeURIComponent(path));
        if (!decodedPath.startsWith("/")) decodedPath = "/" + decodedPath;
        if (decodedPath.length > 1 && decodedPath.endsWith("/")) decodedPath = decodedPath.slice(0, -1);

        const kvNamespace = context.env.ALIST_KV;
        if (!kvNamespace) {
            throw new Error("ALIST_KV namespace is not bound.");
        }

        const kvKey = `dir:${decodedPath}`;
        const dirDataStr = await kvNamespace.get(kvKey);

        let content = [];
        if (dirDataStr) {
            content = JSON.parse(dirDataStr);
        }

        const formattedContent = content.map(item => {
            const itemPath = item.path || (decodedPath === "/" ? `/${item.name}` : `${decodedPath}/${item.name}`);
            return {
                id: item.id || "",
                path: itemPath,
                name: item.name,
                size: item.size || 0,
                is_dir: !!item.is_dir,
                modified: item.modified || new Date().toISOString(),
                created: item.created || item.modified || new Date().toISOString(),
                sign: item.sign || "",
                thumb: item.thumb || "",
                type: item.type || (item.is_dir ? 1 : 0),
                hashinfo: "null",
                hash_info: null,
                label_list: null
            };
        });

        const totalItems = formattedContent.length;
        const startIndex = (page - 1) * per_page;
        const endIndex = startIndex + per_page;
        const paginatedContent = formattedContent.slice(startIndex, endIndex);

        const responseData = {
            "code": 200,
            "message": "success",
            "data": {
                "content": paginatedContent, // 仅返回当前页的50条切片
                "total": totalItems,         // 上报总数据量驱动前端计算总页数
                "readme": "",
                "write": isAdmin, 
                "provider": "Cloudflare KV"
            }
        };

        return new Response(JSON.stringify(responseData), {
            status: 200,
            headers: {
                "Content-Type": "application/json;charset=utf-8",
                "Access-Control-Allow-Origin": "*",
                "Cache-Control": "no-store" 
            }
        });

    } catch (error) {
        return new Response(JSON.stringify({
            code: 500,
            message: "List VFS Error: " + error.message,
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
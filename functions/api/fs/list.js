export async function onRequest(context) {
    if (context.request.method === "OPTIONS") {
        return new Response(null, { status: 204, headers: { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Methods": "POST, OPTIONS", "Access-Control-Allow-Headers": "Content-Type, Authorization" } });
    }

    try {
        const authHeader = context.request.headers.get("Authorization") || "";
        const expectedAdminToken = context.env.ADMIN_TOKEN || "secret-admin-token-cf-alist-v3";
        const isAdmin = (authHeader === expectedAdminToken || authHeader === `Bearer ${expectedAdminToken}`);

        const requestBody = await context.request.json();
        let { path, page = 1, per_page = 50 } = requestBody;

        if (!path) path = "/";
        let decodedPath = decodeURIComponent(decodeURIComponent(path));
        if (!decodedPath.startsWith("/")) decodedPath = "/" + decodedPath;
        if (decodedPath.length > 1 && decodedPath.endsWith("/")) decodedPath = decodedPath.slice(0, -1);

        const db = context.env.ALIST_D1;
        const startIndex = (page - 1) * per_page;

        const results = await db.batch([
            db.prepare("SELECT count(*) as total FROM vfs WHERE parent_path = ?").bind(decodedPath),
            db.prepare("SELECT * FROM vfs WHERE parent_path = ? ORDER BY is_dir DESC, name ASC LIMIT ? OFFSET ?").bind(decodedPath, per_page, startIndex)
        ]);

        const totalItems = results[0].results[0].total || 0;
        const dbItems = results[1].results || [];

        const paginatedContent = dbItems.map(item => ({
            id: item.id,
            path: item.path,
            name: item.name,
            size: item.size,
            is_dir: !!item.is_dir, 
            modified: item.modified,
            created: item.created,
            sign: item.sign || "",
            thumb: item.thumb || "",
            type: item.type,
            hashinfo: "null",
            hash_info: null,
            label_list: null
        }));

        return new Response(JSON.stringify({
            "code": 200, "message": "success",
            "data": { "content": paginatedContent, "total": totalItems, "readme": "", "write": isAdmin, "provider": "Cloudflare D1" }
        }), { status: 200, headers: { "Content-Type": "application/json;charset=utf-8", "Access-Control-Allow-Origin": "*", "Cache-Control": "no-store" } });

    } catch (error) {
        return new Response(JSON.stringify({ code: 500, message: "List VFS Error: " + error.message, data: null }), { status: 500, headers: { "Content-Type": "application/json;charset=utf-8", "Access-Control-Allow-Origin": "*" } });
    }
}
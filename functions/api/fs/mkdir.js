export async function onRequest(context) {
    if (context.request.method === "OPTIONS") return new Response(null, { status: 204, headers: { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Methods": "POST, OPTIONS", "Access-Control-Allow-Headers": "Content-Type, Authorization" } });
    if (context.request.method !== "POST") return new Response("Method Not Allowed", { status: 405 });

    try {
        const { request, env } = context;
        let { path } = await request.json();

        if (!path) return new Response(JSON.stringify({ code: 400, message: "Path is required" }), { status: 400, headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" } });
        if (!path.startsWith("/")) path = "/" + path;
        if (path.length > 1 && path.endsWith("/")) path = path.slice(0, -1);

        const db = env.ALIST_D1;
        const lastSlashIndex = path.lastIndexOf("/");
        const parentPath = lastSlashIndex === 0 ? "/" : path.substring(0, lastSlashIndex);
        const newFolderName = path.substring(lastSlashIndex + 1);

        const nowIso = new Date().toISOString();
        const dirId = "dir-" + Math.random().toString(36).substring(2, 10) + Date.now().toString(36);

        // 尝试插入，如果是已存在的数据，触发 UNIQUE 约束异常，我们在此捕获
        try {
            await db.prepare(`INSERT INTO vfs (id, path, parent_path, name, is_dir, size, type, created, modified) VALUES (?, ?, ?, ?, 1, 0, 1, ?, ?)`)
                    .bind(dirId, path, parentPath, newFolderName, nowIso, nowIso)
                    .run();
        } catch (e) {
            if (e.message.includes('UNIQUE constraint failed')) {
                return new Response(JSON.stringify({ code: 400, message: "文件夹或文件已存在", data: null }), { status: 200, headers: { "Content-Type": "application/json;charset=utf-8", "Access-Control-Allow-Origin": "*" } });
            }
            throw e;
        }

        return new Response(JSON.stringify({ code: 200, message: "success", data: null }), { status: 200, headers: { "Content-Type": "application/json;charset=utf-8", "Access-Control-Allow-Origin": "*" } });
    } catch (error) {
        return new Response(JSON.stringify({ code: 500, message: "Mkdir VFS Error: " + error.message, data: null }), { status: 500, headers: { "Content-Type": "application/json;charset=utf-8", "Access-Control-Allow-Origin": "*" } });
    }
}
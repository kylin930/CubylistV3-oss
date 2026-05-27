export async function onRequest(context) {
    if (context.request.method === "OPTIONS") return new Response(null, { status: 204, headers: { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Methods": "POST, OPTIONS", "Access-Control-Allow-Headers": "Content-Type, Authorization" } });
    if (context.request.method !== "POST") return new Response("Method Not Allowed", { status: 405 });

    try {
        const { request, env } = context;
        let { dir, names } = await request.json();

        if (!dir || !names || !Array.isArray(names)) {
            return new Response(JSON.stringify({ code: 400, message: "Invalid parameters" }), { status: 400, headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" } });
        }

        if (!dir.startsWith("/")) dir = "/" + dir;
        if (dir.length > 1 && dir.endsWith("/")) dir = dir.slice(0, -1);

        const db = env.ALIST_D1;
        let batchStmts = [];

        for (const name of names) {
            const targetFullPath = dir === "/" ? `/${name}` : `${dir}/${name}`;
            
            // 精准匹配自身，或使用 LIKE 模糊匹配清空内部所有子目录/文件
            batchStmts.push(
                db.prepare(`DELETE FROM vfs WHERE path = ? OR path LIKE ?`).bind(targetFullPath, targetFullPath + '/%')
            );
        }

        await db.batch(batchStmts);

        return new Response(JSON.stringify({ code: 200, message: "success", data: null }), { status: 200, headers: { "Content-Type": "application/json;charset=utf-8", "Access-Control-Allow-Origin": "*" } });
    } catch (error) {
        return new Response(JSON.stringify({ code: 500, message: "Remove VFS Error: " + error.message, data: null }), { status: 500, headers: { "Content-Type": "application/json;charset=utf-8", "Access-Control-Allow-Origin": "*" } });
    }
}
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

    if (context.request.method !== "POST") {
        return new Response("Method Not Allowed", { status: 405 });
    }

    try {
        const { request, env } = context;
        let { dir, names } = await request.json();

        if (!dir || !names || !Array.isArray(names)) {
            return new Response(JSON.stringify({ code: 400, message: "Invalid parameters" }), {
                status: 400,
                headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" }
            });
        }

        if (!dir.startsWith("/")) dir = "/" + dir;
        if (dir.length > 1 && dir.endsWith("/")) dir = dir.slice(0, -1);

        const db = env.ALIST_D1;
        if (!db) throw new Error("ALIST_D1 namespace is not bound.");

        // ========================================================
        // 核心修复：分批（Chunking）执行，防止单次 Batch 中 LIKE 语句过多导致编译报错
        // ========================================================
        const CHUNK_SIZE = 20; // 每次最多打包 20 个路径的 LIKE 删除，这个数量对 SQLite 绝对安全
        
        for (let i = 0; i < names.length; i += CHUNK_SIZE) {
            const chunkNames = names.slice(i, i + CHUNK_SIZE);
            let chunkStmts = [];

            for (const name of chunkNames) {
                const targetFullPath = dir === "/" ? `/${name}` : `${dir}/${name}`;
                // 每一个文件的删除和其子目录的级联删除
                chunkStmts.push(
                    db.prepare(`DELETE FROM vfs WHERE path = ? OR path LIKE ?`).bind(targetFullPath, targetFullPath + '/%')
                );
            }

            // 执行当前切片的微型批处理事务
            if (chunkStmts.length > 0) {
                await db.batch(chunkStmts);
            }
        }

        return new Response(JSON.stringify({
            code: 200,
            message: "success",
            data: null
        }), {
            status: 200,
            headers: {
                "Content-Type": "application/json;charset=utf-8",
                "Access-Control-Allow-Origin": "*"
            }
        });

    } catch (error) {
        return new Response(JSON.stringify({ 
            code: 500, 
            message: "Remove VFS Error: " + error.message, 
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